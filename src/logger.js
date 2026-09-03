// Client-side-only session log: GPS fixes, direction cues, and key events
// (area exit/enter, GPS errors, game end) for reviewing real-world test
// runs later. Stored in localStorage on the device only — nothing is sent
// anywhere. Best-effort: a storage failure (quota, private browsing) must
// never break the game, so every write is wrapped and just warns.
const STORAGE_KEY = 'ghost-tag-log-v1';
const MAX_SESSIONS = 20; // keep localStorage usage small

let currentSession = null;

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { sessions: [] };
  } catch (err) {
    console.warn('ログの読み込みに失敗しました', err);
    return { sessions: [] };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('ログの保存に失敗しました', err);
  }
}

export function startSession(config) {
  currentSession = {
    startedAt: new Date().toISOString(),
    config,
    events: [],
  };
}

function pushEvent(entry) {
  if (!currentSession) return;
  currentSession.events.push(entry);
}

// data should include `t` (ms since session start) plus whatever fields
// the caller finds useful — kept schema-free here on purpose.
export function logGpsFix(data) {
  pushEvent({ type: 'gps', ...data });
}

export function logEvent(type, data = {}) {
  pushEvent({ type, ...data });
}

export function endSession(summary) {
  if (!currentSession) return;
  currentSession.endedAt = new Date().toISOString();
  currentSession.summary = summary;

  const all = loadAll();
  all.sessions.push(currentSession);
  if (all.sessions.length > MAX_SESSIONS) {
    all.sessions = all.sessions.slice(-MAX_SESSIONS);
  }
  saveAll(all);
  currentSession = null;
}

export function getSessionCount() {
  return loadAll().sessions.length;
}

export function clearLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('ログの削除に失敗しました', err);
  }
}

export function downloadLog() {
  const all = loadAll();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `ghost-tag-log-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
