import { GpsTracker } from './gps.js';
import { Oni } from './oniAI.js';
import { AudioEngine } from './audio.js';
import { distanceMeters, bearingDegrees, destinationPoint, randomBearing } from './geo.js';
import { GameStatus, EndReason } from './gameState.js';
import * as ui from './ui.js';
import * as logger from './logger.js';

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
let headingSource = null; // 'gps-native' | 'gps-computed' | 'compass' | null, for the debug panel
let compassHeading = null; // degrees, smoothed device-orientation fallback
let compassVecX = null;
let compassVecY = null;
let orientationEventType = null; // which event we're listening to, for cleanup

const audio = new AudioEngine();

ui.init({
  onStart: startGame,
  onTestAudio: async () => {
    try {
      await audio.playTestTone();
      ui.setAudioStatus('テスト音を再生しました');
    } catch (err) {
      ui.setAudioStatus(err.message, true);
    }
  },
  onStop: () => endGame(EndReason.STOPPED),
  onRestart: () => {
    status = GameStatus.READY;
    ui.showScreen('setup');
  },
  onDownloadLog: () => logger.downloadLog(),
  onClearLog: () => {
    logger.clearLog();
    ui.setLogCount(logger.getSessionCount());
  },
});

ui.setLogCount(logger.getSessionCount());

async function startGame(formConfig) {
  if (status === GameStatus.RUNNING) return;
  config = formConfig;

  // Invoke AudioContext.resume() before the first asynchronous permission/
  // location wait so mobile autoplay policy sees the START tap directly.
  try {
    await audio.init();
  } catch (err) {
    ui.showError(err.message);
    return;
  }

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

  player = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy };
  startPoint = { lat: fix.lat, lon: fix.lon };

  const oniStart = destinationPoint(fix.lat, fix.lon, randomBearing(), config.oniInitialDistance);
  oni = new Oni({ lat: oniStart.lat, lon: oniStart.lon, speedMps: config.oniSpeed });

  status = GameStatus.RUNNING;
  startedAt = performance.now();
  outOfArea = false;
  lastAreaWarnAt = 0;
  playerHeading = null;
  headingSource = null;

  logger.startSession(config);

  gps.start(
    (newFix) => {
      const prevPlayer = player;
      player = { lat: newFix.lat, lon: newFix.lon, accuracy: newFix.accuracy };
      updatePlayerHeading(prevPlayer, newFix);

      const dir = config.enableDirectionalCues ? computeDirectionCue() : null;
      logger.logGpsFix({
        t: Math.round(performance.now() - startedAt),
        lat: newFix.lat,
        lon: newFix.lon,
        accuracy: newFix.accuracy,
        oniLat: oni.lat,
        oniLon: oni.lon,
        distance: Math.round(distanceMeters(newFix.lat, newFix.lon, oni.lat, oni.lon)),
        playerHeading,
        headingSource,
        pulseCount: dir ? dir.pulseCount : null,
      });
    },
    (err) => {
      ui.setGpsWarning('⚠ ' + err.message);
      logger.logEvent('gpsError', { t: Math.round(performance.now() - startedAt), message: err.message });
    }
  );

  requestWakeLock();
  if (config.enableCompassFallback) startCompass();

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

// Updates the module-level `playerHeading` estimate from a new GPS fix.
// Prefers the platform's own fused direction-of-travel (GeolocationCoordinates
// .heading — typically derived by the OS location provider from GPS +
// available sensors, and generally more reliable than differencing two raw
// fixes ourselves, especially at walking speed). Falls back to a bearing
// between the last two fixes only when that movement clearly exceeds both
// fixes' combined GPS accuracy — otherwise a "heading" computed from two
// points a few meters apart is just noise, not a real direction change.
function updatePlayerHeading(prevPlayer, newFix) {
  if (newFix.heading != null && !Number.isNaN(newFix.heading)) {
    playerHeading = newFix.heading;
    headingSource = 'gps-native';
    return;
  }
  const moved = distanceMeters(prevPlayer.lat, prevPlayer.lon, newFix.lat, newFix.lon);
  const noiseFloor = (prevPlayer.accuracy || 0) + (newFix.accuracy || 0);
  if (moved >= Math.max(config.headingMinMoveM, noiseFloor)) {
    playerHeading = bearingDegrees(prevPlayer.lat, prevPlayer.lon, newFix.lat, newFix.lon);
    headingSource = 'gps-computed';
    return;
  }
  // Genuinely can't tell from GPS right now (stationary, or movement is
  // just noise) — fall back to the smoothed compass reading if we have one.
  if (config.enableCompassFallback && compassHeading != null) {
    playerHeading = compassHeading;
    headingSource = 'compass';
  }
}

// event.alpha (device orientation) needs `absolute: true` (or iOS's
// webkitCompassHeading) to be referenced to true north rather than an
// arbitrary starting angle. Smoothed via a circular EMA (averaging raw
// degrees breaks across the 0/360 wrap) because a phone held or
// armband-mounted by a running person swings and bounces constantly —
// see CLAUDE.md.
function handleOrientation(event) {
  let heading;
  if (typeof event.webkitCompassHeading === 'number') {
    heading = event.webkitCompassHeading;
  } else if (event.absolute === true && event.alpha != null) {
    heading = (360 - event.alpha) % 360;
  } else {
    return;
  }

  const rad = (heading * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  const w = config.compassSmoothing;
  if (compassVecX == null) {
    compassVecX = x;
    compassVecY = y;
  } else {
    compassVecX = compassVecX * (1 - w) + x * w;
    compassVecY = compassVecY * (1 - w) + y * w;
  }
  compassHeading = ((Math.atan2(compassVecY, compassVecX) * 180) / Math.PI + 360) % 360;
}

async function startCompass() {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') return;
    } catch {
      return;
    }
  }
  compassHeading = null;
  compassVecX = null;
  compassVecY = null;
  orientationEventType = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(orientationEventType, handleOrientation);
}

function stopCompass() {
  if (orientationEventType) {
    window.removeEventListener(orientationEventType, handleOrientation);
    orientationEventType = null;
  }
  compassHeading = null;
  compassVecX = null;
  compassVecY = null;
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
  if (outOfArea && !wasOutOfArea) {
    logger.logEvent('areaExit', { t: Math.round(now - startedAt) });
  } else if (!outOfArea && wasOutOfArea) {
    logger.logEvent('areaEnter', { t: Math.round(now - startedAt) });
  }
  if (outOfArea && (!wasOutOfArea || now - lastAreaWarnAt > 3000)) {
    audio.playWarningTone();
    lastAreaWarnAt = now;
    if (config.areaExitGameOver) {
      endGame(EndReason.OUT_OF_AREA, 'プレイエリア外に出たため終了しました。');
      return;
    }
  }

  const poorAccuracy = player.accuracy != null && player.accuracy > config.poorAccuracyThresholdM;

  ui.updateRunning({
    elapsedSec: Math.floor((now - startedAt) / 1000),
    poorAccuracy,
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
    playerHeading,
    headingSource,
    direction: config.enableDirectionalCues ? computeDirectionCue() : null,
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
  stopCompass();

  if (reason === EndReason.CAPTURED) audio.playCaptureSound();

  const elapsedSec = Math.floor((performance.now() - startedAt) / 1000);
  const finalDistance = player && oni ? Math.round(distanceMeters(player.lat, player.lon, oni.lat, oni.lon)) : null;
  logger.endSession({ reason, elapsedSec, finalDistance });
  ui.setLogCount(logger.getSessionCount());

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
