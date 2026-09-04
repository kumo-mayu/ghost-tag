// Named play-area polygon presets ("slots"), stored in localStorage only —
// same policy as logger.js: this is location data, so it never leaves the
// device. Best-effort: a storage failure must never break the setup screen.
const STORAGE_KEY = 'ghost-tag-area-slots-v1';
const MAX_SLOTS = 30;

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { slots: [] };
  } catch (err) {
    console.warn('プレイエリアの読み込みに失敗しました', err);
    return { slots: [] };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('プレイエリアの保存に失敗しました', err);
    return false;
  }
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listSlots() {
  return loadAll().slots;
}

export function getSlot(id) {
  return loadAll().slots.find((s) => s.id === id) || null;
}

// { id?, name, points } -> saved slot (id assigned if not given). Updates
// in place when id matches an existing slot, otherwise appends.
export function saveSlot({ id, name, points }) {
  const all = loadAll();
  const slot = { id: id || makeId(), name, points, updatedAt: new Date().toISOString() };
  const idx = all.slots.findIndex((s) => s.id === slot.id);
  if (idx >= 0) all.slots[idx] = slot;
  else all.slots.push(slot);
  if (all.slots.length > MAX_SLOTS) all.slots = all.slots.slice(-MAX_SLOTS);
  saveAll(all);
  return slot;
}

export function deleteSlot(id) {
  const all = loadAll();
  all.slots = all.slots.filter((s) => s.id !== id);
  saveAll(all);
}
