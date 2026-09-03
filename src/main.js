import { GpsTracker } from './gps.js';
import { Oni } from './oniAI.js';
import { AudioEngine } from './audio.js';
import { distanceMeters, destinationPoint, randomBearing } from './geo.js';
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

  gps.start(
    (newFix) => {
      player = { lat: newFix.lat, lon: newFix.lon, accuracy: newFix.accuracy };
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
  });

  ui.showScreen('running');
  uiLoopId = setInterval(updateRunningUI, 250);
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
