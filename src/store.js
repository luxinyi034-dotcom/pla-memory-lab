// Single source of truth in the browser. Views read `store.state` / `store.ix`
// and change data only through `store.commit(fn)`.
import { normalizeState, validateState, defaultState, applyMigrations, hasPendingMigrations, MIGRATION_KEYS } from './core/model.js';
import { resyncSchedule } from './core/srs.js';
import { buildIndex } from './core/selectors.js';
import { todayKey, nowISO, setPausedDays } from './core/time.js';

const STORAGE_KEY = 'pla-memory-lab-state';
const META_KEY = 'pla-memory-lab-meta';
const DB_NAME = 'pla-memory-lab';
const DAILY_LIMIT = 30;   // automatic daily snapshots kept
const VERSION_LIMIT = 10; // "before opening version X" snapshots kept
const VERSION_TAG = ' · 打开 ';

const listeners = new Set();
let saveTimer = null;

export const store = {
  state: defaultState(),
  ix: null,
  meta: {},
  source: 'empty',
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Run a mutation, rebuild indexes, persist, notify. */
  commit(mutator, { silent = false } = {}) {
    const result = mutator(this.state);
    setPausedDays(this.state.pausedDays);
    this.ix = buildIndex(this.state);
    this.scheduleSave();
    if (!silent) listeners.forEach(fn => fn());
    return result;
  },

  /** Swap in a fully validated state (used by import). */
  replace(next) {
    validateState(next);
    prepareState(next);
    this.state = next;
    this.ix = buildIndex(next);
    this.saveNow();
    listeners.forEach(fn => fn());
  },

  scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => this.saveNow(), 250);
  },

  saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.meta.savedAt = nowISO();
      localStorage.setItem(META_KEY, JSON.stringify(this.meta));
      this.saveError = null;
    } catch (error) {
      this.saveError = error;
      console.error('Save failed', error);
    }
    dailySnapshot(this.state).catch(() => {});
  },

  setMeta(patch) {
    this.meta = { ...this.meta, ...patch };
    try { localStorage.setItem(META_KEY, JSON.stringify(this.meta)); } catch { /* ignore */ }
  },

  /**
   * Read the saved data. `appVersion` names the copy of the site doing the
   * reading; when it differs from the last one that opened this data, the
   * untouched data is kept as a snapshot first, so a new release (or an older
   * archived version) can never silently lose anything.
   */
  async load(appVersion = 'unknown') {
    try { this.meta = JSON.parse(localStorage.getItem(META_KEY) ?? '{}') ?? {}; } catch { this.meta = {}; }
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (this.meta.appVersion !== appVersion) {
          await saveVersionSnapshot(`${todayKey()}${VERSION_TAG}${appVersion} 前`, parsed).catch(error => console.warn('Version snapshot failed', error));
        }
        this.state = normalizeState(parsed);
        validateState(this.state);
        this.source = 'local';
      } catch (error) {
        console.error('Stored state unreadable, trying snapshot', error);
        const snapshot = await latestSnapshot();
        if (snapshot) { this.state = normalizeState(snapshot.state); this.source = 'snapshot'; }
      }
    }
    if (this.source === 'empty') {
      // First launch on this device: start from the bundled backup of the
      // learner's real data. Never generate demo content.
      try {
        const response = await fetch('./data/seed.json', { cache: 'no-cache' });
        if (response.ok) {
          const payload = await response.json();
          this.state = normalizeState(payload.state ?? payload);
          validateState(this.state);
          this.source = 'seed';
          this.setMeta({ seededFrom: payload.exportedAt ?? null, seededAt: nowISO() });
        }
      } catch (error) { console.warn('No seed data', error); }
    }
    this.setMeta({ appVersion, appVersionSeenAt: nowISO() });
    const migrated = prepareState(this.state);
    this.ix = buildIndex(this.state);
    this.migrated = migrated;
    if (this.source !== 'local' || migrated) this.saveNow();
    // A daily copy even on days with no studying.
    await dailySnapshot(this.state).catch(() => {});
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  },
};

/**
 * Make a freshly loaded state ready to use: tell the date maths which days are
 * paused and run one-off data migrations. Before a migration changes anything,
 * the untouched data is kept as a named snapshot (restoring it does not re-run
 * the migration).
 */
function prepareState(state) {
  setPausedDays(state.pausedDays);
  if (!hasPendingMigrations(state)) return null;
  const before = JSON.parse(JSON.stringify(state));
  before.migrations = { ...before.migrations };
  MIGRATION_KEYS.forEach(key => { before.migrations[key] = 'skipped-restore'; });
  const result = applyMigrations(state);
  if (result) {
    saveNamedSnapshot(`${todayKey()} · 整理复习前`, before).catch(() => {});
    setPausedDays(state.pausedDays);
    state.progress.forEach(resyncSchedule);
  }
  return result;
}

/** Keep a snapshot taken before a different version opened the data; prune to the newest few. */
async function saveVersionSnapshot(day, state) {
  await saveNamedSnapshot(day, state);
  const all = await listSnapshots();
  const versions = all.filter(snap => snap.day.includes(VERSION_TAG)).sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
  if (versions.length <= VERSION_LIMIT) return;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    versions.slice(VERSION_LIMIT).forEach(snap => tx.objectStore('snapshots').delete(snap.day));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

async function saveNamedSnapshot(day, state) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ day, savedAt: nowISO(), state });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

// ---------- IndexedDB daily snapshots (safety net, newest 30 kept) ----------

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('no indexedDB')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'day' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let lastSnapshotDay = null;
async function dailySnapshot(state) {
  const day = todayKey();
  if (lastSnapshotDay === day) return;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const os = tx.objectStore('snapshots');
    const get = os.get(day);
    get.onsuccess = () => {
      if (!get.result) os.put({ day, savedAt: nowISO(), state: JSON.parse(JSON.stringify(state)) });
      const keys = os.getAllKeys();
      keys.onsuccess = () => {
        // Only prune the automatic daily ones; named safety snapshots stay.
        const daily = keys.result.filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort();
        daily.slice(0, Math.max(0, daily.length - DAILY_LIMIT)).forEach(key => os.delete(key));
      };
    };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  lastSnapshotDay = day;
}

export async function listSnapshots() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const request = db.transaction('snapshots').objectStore('snapshots').getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.day.localeCompare(a.day)));
      request.onerror = () => reject(request.error);
    });
  } catch { return []; }
}

async function latestSnapshot() { return (await listSnapshots())[0] ?? null; }
