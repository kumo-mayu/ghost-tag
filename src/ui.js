import { MapView } from './mapView.js';
import { AreaEditor } from './areaEditor.js';
import * as areaStore from './areaStore.js';

let els = {};
let callbacks = {};
let mapView = null;
let areaEditor = null;
let selectedAreaSlotId = '';
let selectedAreaPolygon = null;
let editingAreaSlotId = null;

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
  els.mapOrientation = document.getElementById('map-orientation');
  els.mapError = document.getElementById('map-error');
  els.mapContainer = document.getElementById('map-container');
  els.runningTimer = document.getElementById('running-timer');
  els.gpsAccuracy = document.getElementById('gps-accuracy');
  els.areaWarning = document.getElementById('area-warning');
  els.gpsWarning = document.getElementById('gps-warning');
  els.accuracyWarning = document.getElementById('accuracy-warning');
  els.wakeLockWarning = document.getElementById('wake-lock-warning');
  els.endedTitle = document.getElementById('ended-title');
  els.endedMessage = document.getElementById('ended-message');
  els.endedTime = document.getElementById('ended-time');
  els.logCount = document.getElementById('log-count');
  els.logDownloadBtn = document.getElementById('log-download-btn');
  els.logClearBtn = document.getElementById('log-clear-btn');
  els.areaSlotSelect = document.getElementById('area-slot-select');
  els.areaNewBtn = document.getElementById('area-new-btn');
  els.areaEditBtn = document.getElementById('area-edit-btn');
  els.areaDeleteBtn = document.getElementById('area-delete-btn');
  els.areaEditorMap = document.getElementById('area-editor-map');
  els.areaEditorName = document.getElementById('area-editor-name');
  els.areaEditorError = document.getElementById('area-editor-error');
  els.areaEditorLocateBtn = document.getElementById('area-editor-locate-btn');
  els.areaEditorUndoBtn = document.getElementById('area-editor-undo-btn');
  els.areaEditorClearBtn = document.getElementById('area-editor-clear-btn');
  els.areaEditorSaveBtn = document.getElementById('area-editor-save-btn');
  els.areaEditorCancelBtn = document.getElementById('area-editor-cancel-btn');
  els.screens = {
    setup: document.getElementById('screen-setup'),
    running: document.getElementById('screen-running'),
    ended: document.getElementById('screen-ended'),
    'area-editor': document.getElementById('screen-area-editor'),
  };

  mapView = new MapView(els.mapContainer);
  areaEditor = new AreaEditor(els.areaEditorMap);
  refreshAreaSlotOptions();

  els.setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();
    const config = readConfig();
    const validationError = validateConfig(config);
    if (validationError) {
      showError(validationError);
      return;
    }
    callbacks.onStart(config);
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
  els.mapOrientation.addEventListener('change', () => {
    mapView.setOrientation(els.mapOrientation.value);
  });

  els.areaSlotSelect.addEventListener('change', onAreaSlotChange);
  els.areaDeleteBtn.addEventListener('click', () => {
    if (!selectedAreaSlotId) return;
    areaStore.deleteSlot(selectedAreaSlotId);
    refreshAreaSlotOptions();
  });
  els.areaNewBtn.addEventListener('click', async () => {
    editingAreaSlotId = null;
    els.areaEditorName.value = '';
    hideAreaEditorError();
    showScreen('area-editor');
    await areaEditor.open([]);
    try {
      await areaEditor.locate();
    } catch (err) {
      showAreaEditorError(err.message);
    }
  });
  els.areaEditBtn.addEventListener('click', async () => {
    const slot = selectedAreaSlotId ? areaStore.getSlot(selectedAreaSlotId) : null;
    if (!slot) return;
    editingAreaSlotId = slot.id;
    els.areaEditorName.value = slot.name;
    hideAreaEditorError();
    showScreen('area-editor');
    await areaEditor.open(slot.points);
  });
  els.areaEditorLocateBtn.addEventListener('click', async () => {
    try {
      await areaEditor.locate();
    } catch (err) {
      showAreaEditorError(err.message);
    }
  });
  els.areaEditorUndoBtn.addEventListener('click', () => areaEditor.undo());
  els.areaEditorClearBtn.addEventListener('click', () => areaEditor.clear());
  els.areaEditorSaveBtn.addEventListener('click', () => {
    const points = areaEditor.getPoints();
    const name = els.areaEditorName.value.trim();
    if (points.length < 3) {
      showAreaEditorError('3点以上のピンを配置してください');
      return;
    }
    if (!name) {
      showAreaEditorError('エリア名を入力してください');
      return;
    }
    const slot = areaStore.saveSlot({ id: editingAreaSlotId, name, points });
    areaEditor.destroy();
    refreshAreaSlotOptions(slot.id);
    showScreen('setup');
  });
  els.areaEditorCancelBtn.addEventListener('click', () => {
    areaEditor.destroy();
    showScreen('setup');
  });
}

function refreshAreaSlotOptions(selectId) {
  const slots = areaStore.listSlots();
  els.areaSlotSelect.innerHTML = '';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '未選択';
  els.areaSlotSelect.appendChild(emptyOpt);
  slots.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name}（${s.points.length}点）`;
    els.areaSlotSelect.appendChild(opt);
  });
  els.areaSlotSelect.value = selectId || '';
  onAreaSlotChange();
}

function onAreaSlotChange() {
  const id = els.areaSlotSelect.value;
  const slot = id ? areaStore.getSlot(id) : null;
  selectedAreaSlotId = id;
  selectedAreaPolygon = slot ? slot.points : null;
  els.areaEditBtn.disabled = !slot;
  els.areaDeleteBtn.disabled = !slot;
}

function showAreaEditorError(msg) {
  els.areaEditorError.textContent = msg;
  els.areaEditorError.removeAttribute('hidden');
}

function hideAreaEditorError() {
  els.areaEditorError.setAttribute('hidden', '');
  els.areaEditorError.textContent = '';
}

function readConfig() {
  const fd = new FormData(els.setupForm);
  return {
    playAreaPolygon: selectedAreaPolygon,
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

function validateConfig(config) {
  if (!config.playAreaPolygon || config.playAreaPolygon.length < 3) {
    return 'プレイエリアを選択または作成してください（3点以上の多角形が必要です）';
  }
  const numericValues = Object.entries(config).filter(([, value]) => typeof value === 'number');
  if (numericValues.some(([, value]) => !Number.isFinite(value))) {
    return '設定値には有効な数値を入力してください';
  }
  if (config.captureDistance >= config.oniInitialDistance) {
    return '捕獲判定距離は鬼の初期出現距離より小さくしてください';
  }
  if (config.audioMinIntervalMs > config.audioMaxIntervalMs) {
    return '音の最短間隔は最長間隔以下にしてください';
  }
  if (config.captureDistance >= config.audioFarDistance) {
    return '音の遠距離判定は捕獲判定距離より大きくしてください';
  }
  if (config.directionMinFilterHz > config.directionMaxFilterHz) {
    return '方向フィルターの下限は上限以下にしてください';
  }
  return '';
}

export function resetMapTrail() {
  mapView.resetTrail();
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

export function updateRunning({ elapsedSec, accuracy, gpsLost, gpsMessage, outOfArea, poorAccuracy, wakeLockProblem, wakeLockMessage }) {
  els.runningTimer.textContent = formatTime(elapsedSec);
  els.gpsAccuracy.textContent = accuracy != null ? accuracy.toFixed(1) : '--';

  if (outOfArea) els.areaWarning.removeAttribute('hidden');
  else els.areaWarning.setAttribute('hidden', '');

  if (poorAccuracy) els.accuracyWarning.removeAttribute('hidden');
  else els.accuracyWarning.setAttribute('hidden', '');

  if (wakeLockProblem) {
    els.wakeLockWarning.textContent = `⚠ ${wakeLockMessage || '画面の自動消灯を防止できません'}`;
    els.wakeLockWarning.removeAttribute('hidden');
  } else {
    els.wakeLockWarning.setAttribute('hidden', '');
  }

  if (gpsLost) setGpsWarning(`⚠ ${gpsMessage || 'GPS信号ロスト'}（ゲーム一時停止中）`);
  else clearGpsWarning();
}

export function updateDebug({ player, oni, distance, distFromStart, oniSpeed, startPoint, playAreaPolygon, captureDistance, playerHeading, headingSource, direction }) {
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
  mapView.update({ player, oni, startPoint, playAreaPolygon, captureDistance, playerHeading });
}

export function showEnded({ reason, elapsedSec, message }) {
  els.endedTitle.textContent = reason === 'CAPTURED' ? 'GAME OVER — 捕まった' : '終了';
  els.endedMessage.textContent =
    message || (reason === 'CAPTURED' ? '鬼に追いつかれました。' : 'プレイを終了しました。');
  els.endedTime.textContent = formatTime(elapsedSec);
  showScreen('ended');
}
