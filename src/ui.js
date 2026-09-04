import { MapView } from './mapView.js';

let els = {};
let callbacks = {};
let mapView = null;

export function init(cb) {
  callbacks = cb;

  els.setupForm = document.getElementById('config-form');
  els.setupError = document.getElementById('setup-error');
  els.startBtn = document.getElementById('start-btn');
  els.accuracyChoice = document.getElementById('accuracy-choice');
  els.accuracyChoiceMessage = document.getElementById('accuracy-choice-message');
  els.accuracyForceBtn = document.getElementById('accuracy-force-btn');
  els.accuracyRetryBtn = document.getElementById('accuracy-retry-btn');
  els.audioTestBtn = document.getElementById('audio-test-btn');
  els.audioStatus = document.getElementById('audio-status');
  els.stopBtn = document.getElementById('stop-btn');
  els.restartBtn = document.getElementById('restart-btn');
  els.debugToggle = document.getElementById('debug-toggle');
  els.debugPanel = document.getElementById('debug-panel');
  els.debugText = document.getElementById('debug-text');
  els.mapMode = document.getElementById('map-mode');
  els.mapError = document.getElementById('map-error');
  els.mapContainer = document.getElementById('map-container');
  els.runningTimer = document.getElementById('running-timer');
  els.gpsAccuracy = document.getElementById('gps-accuracy');
  els.areaWarning = document.getElementById('area-warning');
  els.gpsWarning = document.getElementById('gps-warning');
  els.accuracyWarning = document.getElementById('accuracy-warning');
  els.endedTitle = document.getElementById('ended-title');
  els.endedMessage = document.getElementById('ended-message');
  els.endedTime = document.getElementById('ended-time');
  els.logCount = document.getElementById('log-count');
  els.logDownloadBtn = document.getElementById('log-download-btn');
  els.logClearBtn = document.getElementById('log-clear-btn');
  els.screens = {
    setup: document.getElementById('screen-setup'),
    running: document.getElementById('screen-running'),
    ended: document.getElementById('screen-ended'),
  };

  mapView = new MapView(els.mapContainer);

  els.setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();
    callbacks.onStart(readConfig());
  });
  els.stopBtn.addEventListener('click', () => callbacks.onStop());
  els.audioTestBtn.addEventListener('click', () => callbacks.onTestAudio());
  els.accuracyForceBtn.addEventListener('click', () => callbacks.onForceAccuracy());
  els.accuracyRetryBtn.addEventListener('click', () => callbacks.onRetryAccuracy());
  els.restartBtn.addEventListener('click', () => callbacks.onRestart());
  els.debugToggle.addEventListener('click', toggleDebug);
  els.logDownloadBtn.addEventListener('click', () => callbacks.onDownloadLog());
  els.logClearBtn.addEventListener('click', () => callbacks.onClearLog());
  els.mapMode.addEventListener('change', async () => {
    els.mapError.setAttribute('hidden', '');
    try {
      await mapView.setMode(els.mapMode.value);
      if (els.mapMode.value !== 'off') {
        els.mapContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      els.mapMode.value = 'off';
      els.mapError.textContent = err.message;
      els.mapError.removeAttribute('hidden');
    }
  });
}

function readConfig() {
  const fd = new FormData(els.setupForm);
  return {
    playAreaRadius: Number(fd.get('playAreaRadius')),
    oniInitialDistance: Number(fd.get('oniInitialDistance')),
    oniSpeed: Number(fd.get('oniSpeed')),
    captureDistance: Number(fd.get('captureDistance')),
    enableHighAccuracy: fd.get('enableHighAccuracy') === 'on',
    areaExitGameOver: fd.get('areaExitGameOver') === 'on',
    enableStereoPan: fd.get('enableStereoPan') === 'on',
    enableDirectionalCues: fd.get('enableDirectionalCues') === 'on',
    enableCompassFallback: fd.get('enableCompassFallback') === 'on',
    oniTickMs: Number(fd.get('oniTickMs')),
    gpsLostTimeoutMs: Number(fd.get('gpsLostTimeoutMs')),
    audioMinIntervalMs: Number(fd.get('audioMinIntervalMs')),
    audioMaxIntervalMs: Number(fd.get('audioMaxIntervalMs')),
    audioFarDistance: Number(fd.get('audioFarDistance')),
    headingMinMoveM: Number(fd.get('headingMinMoveM')),
    directionPulseGapMs: Number(fd.get('directionPulseGapMs')),
    directionMinFilterHz: Number(fd.get('directionMinFilterHz')),
    directionMaxFilterHz: Number(fd.get('directionMaxFilterHz')),
    compassSmoothing: Number(fd.get('compassSmoothing')),
    poorAccuracyThresholdM: Number(fd.get('poorAccuracyThresholdM')),
  };
}

export function setLogCount(n) {
  els.logCount.textContent = String(n);
}

function toggleDebug() {
  const hidden = els.debugPanel.hasAttribute('hidden');
  if (hidden) {
    els.debugPanel.removeAttribute('hidden');
    els.debugToggle.textContent = 'デバッグ情報を隠す';
    mapView.refreshSize();
  } else {
    els.debugPanel.setAttribute('hidden', '');
    els.debugToggle.textContent = 'デバッグ情報を表示';
  }
}

export function showScreen(name) {
  Object.entries(els.screens).forEach(([key, el]) => {
    if (key === name) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  });
}

export function showError(msg) {
  els.setupError.textContent = msg;
  els.setupError.removeAttribute('hidden');
}

export function setAudioStatus(msg, isError = false) {
  els.audioStatus.textContent = msg;
  els.audioStatus.classList.toggle('error', isError);
}

export function setStartPending(pending) {
  els.startBtn.disabled = pending;
  els.startBtn.textContent = pending ? 'GPS取得中…' : 'START';
}

export function showAccuracyChoice(accuracy, threshold) {
  els.startBtn.disabled = true;
  els.startBtn.textContent = 'GPS精度不足';
  els.accuracyChoiceMessage.textContent =
    `GPS精度が±${accuracy.toFixed(1)}mです（目標±${threshold}m以内）。`;
  els.accuracyChoice.removeAttribute('hidden');
}

export function hideAccuracyChoice() {
  els.accuracyChoice.setAttribute('hidden', '');
}

function hideError() {
  els.setupError.setAttribute('hidden', '');
  els.setupError.textContent = '';
}

export function setGpsWarning(msg) {
  els.gpsWarning.removeAttribute('hidden');
  els.gpsWarning.textContent = msg;
}

function clearGpsWarning() {
  els.gpsWarning.setAttribute('hidden', '');
  els.gpsWarning.textContent = '⚠ GPS信号ロスト';
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function updateRunning({ elapsedSec, accuracy, gpsLost, gpsMessage, outOfArea, poorAccuracy }) {
  els.runningTimer.textContent = formatTime(elapsedSec);
  els.gpsAccuracy.textContent = accuracy != null ? accuracy.toFixed(1) : '--';

  if (outOfArea) els.areaWarning.removeAttribute('hidden');
  else els.areaWarning.setAttribute('hidden', '');

  if (poorAccuracy) els.accuracyWarning.removeAttribute('hidden');
  else els.accuracyWarning.setAttribute('hidden', '');

  if (gpsLost) setGpsWarning(`⚠ ${gpsMessage || 'GPS信号ロスト'}（ゲーム一時停止中）`);
  else clearGpsWarning();
}

export function updateDebug({ player, oni, distance, distFromStart, oniSpeed, startPoint, playAreaRadius, captureDistance, playerHeading, headingSource, direction }) {
  if (els.debugPanel.hasAttribute('hidden')) return;
  els.debugText.textContent = [
    `player: ${player.lat.toFixed(6)}, ${player.lon.toFixed(6)} (±${player.accuracy?.toFixed(1) ?? '?'}m)`,
    `oni:    ${oni.lat.toFixed(6)}, ${oni.lon.toFixed(6)}`,
    `distance to oni: ${distance.toFixed(1)} m`,
    `distance from start: ${distFromStart.toFixed(1)} m`,
    `oni speed: ${oniSpeed} m/s`,
    `heading: ${playerHeading != null ? playerHeading.toFixed(0) + '°' : '不明'} (${headingSource ?? '-'})`,
    `direction cue: ${direction ? `pulse×${direction.pulseCount}, ${direction.filterHz.toFixed(0)}Hz` : '-'}`,
  ].join('\n');
  mapView.update({ player, oni, startPoint, playAreaRadius, captureDistance });
}

export function showEnded({ reason, elapsedSec, message }) {
  els.endedTitle.textContent = reason === 'CAPTURED' ? 'GAME OVER — 捕まった' : '終了';
  els.endedMessage.textContent =
    message || (reason === 'CAPTURED' ? '鬼に追いつかれました。' : 'プレイを終了しました。');
  els.endedTime.textContent = formatTime(elapsedSec);
  showScreen('ended');
}
