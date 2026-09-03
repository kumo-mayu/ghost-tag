import { GpsTracker } from './gps.js';
import { Oni } from './oniAI.js';
import { AudioEngine } from './audio.js';
import { distanceMeters, bearingDegrees, destinationPoint, randomBearing } from './geo.js';
import { GameStatus, EndReason } from './gameState.js';
import * as ui from './ui.js';

let status = GameStatus.READY;
let config = null;
let gps = null;
let oni = null;
let player = null; // { lat, lon, accuracy }
let startPoint = null;
let oniLoopId = null;
let uiLoopId = null;
let startedAt = 0;
let outOfArea = false;
let lastAreaWarnAt = 0;
let wakeLock = null;
let playerHeading = null; // degrees, estimated from recent GPS movement

const audio = new AudioEngine();

ui.init({
  onStart: startGame,
  onStop: () => endGame(EndReason.STOPPED),
  onRestart: () => {
    status = GameStatus.READY;
    ui.showScreen('setup');
  },
});

async function startGame(formConfig) {
  if (status === GameStatus.RUNNING) return;
  config = formConfig;

  if (!GpsTracker.isSupported()) {
    ui.showError('このブラウザはGeolocationに対応していません');
    return;
  }

  gps = new GpsTracker({
    enableHighAccuracy: config.enableHighAccuracy,
    lostTimeoutMs: config.gpsLostTimeoutMs,
  });

  let fix;
  try {
    fix = await gps.getCurrentPosition(20000);
  } catch (err) {
    ui.showError(err.message);
    return;
  }

  // Audio must init synchronously inside the user gesture (form submit / button
  // click) chain for mobile Chrome to allow it — this call sits right after
  // the awaited getCurrentPosition, so make sure this stays close to the click.
  audio.init();

  player = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy };
  startPoint = { lat: fix.lat, lon: fix.lon };

  const oniStart = destinationPoint(fix.lat, fix.lon, randomBearing(), config.oniInitialDistance);
  oni = new Oni({ lat: oniStart.lat, lon: oniStart.lon, speedMps: config.oniSpeed });

  status = GameStatus.RUNNING;
  startedAt = performance.now();
  outOfArea = false;
  lastAreaWarnAt = 0;
  playerHeading = null;

  gps.start(
    (newFix) => {
      const prevPlayer = player;
      player = { lat: newFix.lat, lon: newFix.lon, accuracy: newFix.accuracy };
      const moved = distanceMeters(prevPlayer.lat, prevPlayer.lon, newFix.lat, newFix.lon);
      if (moved >= config.headingMinMoveM) {
        playerHeading = bearingDegrees(prevPlayer.lat, prevPlayer.lon, newFix.lat, newFix.lon);
      }
    },
    (err) => ui.setGpsWarning('⚠ ' + err.message)
  );

  requestWakeLock();

  let lastTick = performance.now();
  oniLoopId = setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    oni.update(dt, player.lat, player.lon);
    checkCapture();
  }, config.oniTickMs);

  audio.startDistanceBeeper({
    minIntervalMs: config.audioMinIntervalMs,
    maxIntervalMs: config.audioMaxIntervalMs,
    farDistance: config.audioFarDistance,
    captureDistance: config.captureDistance,
    getDistance: () => distanceMeters(player.lat, player.lon, oni.lat, oni.lon),
    getPan: config.enableStereoPan ? computePan : undefined,
    getDirection: config.enableDirectionalCues ? computeDirectionCue : undefined,
  });

  ui.showScreen('running');
  uiLoopId = setInterval(updateRunningUI, 250);
}

// Relative bearing of the oni vs. the player's estimated heading, mapped to
// a stereo pan (-1 left .. 0 center/ambiguous .. +1 right). Front and behind
// both come out centered — plain stereo can't distinguish them, and this
// prototype doesn't try to (see CLAUDE.md).
function computePan() {
  if (playerHeading == null) return 0;
  const oniBearing = bearingDegrees(player.lat, player.lon, oni.lat, oni.lon);
  const relative = ((oniBearing - playerHeading + 540) % 360) - 180; // -180..180
  return Math.sin((relative * Math.PI) / 180);
}

// Speaker-safe direction cue: coarse sector (1=front,2=right,3=behind,
// 4=left) via pulse count + a lowpass filter that brightens the closer
// the player's heading is to actually facing the oni. Returns null while
// heading is unknown (player hasn't moved enough yet).
function computeDirectionCue() {
  if (playerHeading == null) return null;
  const oniBearing = bearingDegrees(player.lat, player.lon, oni.lat, oni.lon);
  const relative = ((oniBearing - playerHeading + 540) % 360) - 180; // -180..180
  const abs = Math.abs(relative);

  let pulseCount;
  if (abs <= 45) pulseCount = 1; // front
  else if (abs >= 135) pulseCount = 3; // behind
  else pulseCount = relative > 0 ? 2 : 4; // right : left

  const clarity = 1 - abs / 180; // 0 (directly behind) .. 1 (dead ahead)
  const filterHz = config.directionMinFilterHz + clarity * (config.directionMaxFilterHz - config.directionMinFilterHz);

  return { pulseCount, filterHz, pulseGapMs: config.directionPulseGapMs };
}

function checkCapture() {
  const dist = distanceMeters(player.lat, player.lon, oni.lat, oni.lon);
  if (dist <= config.captureDistance) {
    endGame(EndReason.CAPTURED);
  }
}

function updateRunningUI() {
  if (status !== GameStatus.RUNNING) return;

  const dist = distanceMeters(player.lat, player.lon, oni.lat, oni.lon);
  const distFromStart = distanceMeters(startPoint.lat, startPoint.lon, player.lat, player.lon);

  const wasOutOfArea = outOfArea;
  outOfArea = distFromStart > config.playAreaRadius;
  const now = performance.now();
  if (outOfArea && (!wasOutOfArea || now - lastAreaWarnAt > 3000)) {
    audio.playWarningTone();
    lastAreaWarnAt = now;
    if (config.areaExitGameOver) {
      endGame(EndReason.OUT_OF_AREA, 'プレイエリア外に出たため終了しました。');
      return;
    }
  }

  ui.updateRunning({
    elapsedSec: Math.floor((now - startedAt) / 1000),
    accuracy: player.accuracy,
    gpsLost: gps.isLost(),
    outOfArea,
  });

  ui.updateDebug({
    player,
    oni,
    distance: dist,
    distFromStart,
    oniSpeed: config.oniSpeed,
    startPoint,
    playAreaRadius: config.playAreaRadius,
    captureDistance: config.captureDistance,
  });
}

function endGame(reason, message) {
  if (status !== GameStatus.RUNNING) return;
  status = GameStatus.ENDED;

  clearInterval(oniLoopId);
  clearInterval(uiLoopId);
  audio.stopDistanceBeeper();
  gps.stop();
  releaseWakeLock();

  if (reason === EndReason.CAPTURED) audio.playCaptureSound();

  const elapsedSec = Math.floor((performance.now() - startedAt) / 1000);
  ui.showEnded({ reason, elapsedSec, message });
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    // Not fatal — the prototype still works with the screen turning off,
    // just with degraded GPS/timer reliability while off (see CLAUDE.md).
    console.warn('WakeLock取得失敗', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (status === GameStatus.RUNNING && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});
