// State shape, normalisation, import (merge / replace) and export.
// Everything here is pure (no DOM) so it can be unit-tested in Node.

export const APP_NAME = 'PLA Memory Lab';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  autoPronunciationEnabled: false,
  pronunciationLocale: 'en-US',
  newTarget: 20,
  newTargetMode: '20',
};

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [], expressions: [], progress: [],
    wrongBook: [], favorites: [], checkins: [], makeupCheckins: [],
    sessions: [], quickReviewSessions: {}, wrongDictationSession: null,
    dailyMistakes: {}, navigationMemory: {}, migrations: {}, pausedDays: [], checkinBackfills: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Accept either a backup wrapper ({backupVersion, state}) or a bare state. */
export function unwrapPayload(payload) {
  if (!isObject(payload)) throw new Error('文件内容不是有效的 JSON 对象。');
  const candidate = isObject(payload.state) && Array.isArray(payload.state.groups) ? payload.state : payload;
  if (!Array.isArray(candidate.groups)) throw new Error('备份中缺少分组数据（groups）。');
  if (!Array.isArray(candidate.expressions) && Array.isArray(candidate.entries)) candidate.expressions = candidate.entries;
  if (!Array.isArray(candidate.expressions)) throw new Error('备份中缺少表达数据（expressions）。');
  return candidate;
}

const NESTED_BACKUP_MIGRATION = 'strip-nested-backup-2026-10-15';

/**
 * Fill defaults and repair known problems while keeping every unknown field.
 * Returns a new object; the input is not modified.
 */
export function normalizeState(input) {
  const state = { ...defaultState(), ...clone(input) };
  state.migrations = isObject(state.migrations) ? state.migrations : {};

  // Older versions stored a whole backup wrapper *inside* state when
  // restoring. It is a stale duplicate (and grows on every restore), so drop it.
  if (isObject(state.state) && Array.isArray(state.state.groups)) {
    delete state.state; delete state.backupVersion; delete state.app; delete state.exportedAt;
    state.migrations[NESTED_BACKUP_MIGRATION] ??= new Date().toISOString();
  }

  for (const key of ['groups', 'expressions', 'progress', 'wrongBook', 'favorites', 'checkins', 'makeupCheckins', 'sessions']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  for (const key of ['quickReviewSessions', 'dailyMistakes', 'navigationMemory']) {
    if (!isObject(state[key])) state[key] = {};
  }
  state.pausedDays = Array.isArray(state.pausedDays) ? [...new Set(state.pausedDays.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort() : [];
  state.checkinBackfills = isObject(state.checkinBackfills) ? state.checkinBackfills : {};
  state.wrongDictationSession = isObject(state.wrongDictationSession) ? state.wrongDictationSession : null;
  state.settings = { ...DEFAULT_SETTINGS, ...(isObject(state.settings) ? state.settings : {}) };
  state.schemaVersion ??= SCHEMA_VERSION;

  state.groups = state.groups.filter(isObject).map((group, index) => ({
    ...group,
    id: String(group.id),
    name: String(group.name ?? '未命名分组'),
    category: group.category === 'vocabulary' ? 'vocabulary' : 'expression',
    sortOrder: Number.isFinite(group.sortOrder) ? group.sortOrder : index,
  }));

  const favoriteSet = new Set(state.favorites.map(String));
  state.expressions = state.expressions.filter(isObject).map((item, index) => {
    const english = String(item.english ?? '');
    return {
      ...item,
      id: String(item.id),
      groupID: String(item.groupID),
      english,
      normalizedEnglish: item.normalizedEnglish ?? english.toLowerCase(),
      chinese: String(item.chinese ?? ''),
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
      isFavorite: Boolean(item.isFavorite) || favoriteSet.has(String(item.id)),
    };
  });
  // `isFavorite` on the expression is the source of truth; keep the list in sync.
  state.favorites = state.expressions.filter(item => item.isFavorite).map(item => item.id);

  state.progress = state.progress.filter(item => isObject(item) && item.expressionID != null).map(item => ({
    status: 'scheduled', firstLearnedAt: null, lastReviewedAt: null, nextReviewAt: null, intervalIndex: 0,
    firstAttemptCorrect: null, lastAttemptCorrect: null, errorCount: 0, needsStrengthening: false,
    ...item,
    expressionID: String(item.expressionID),
    accuracyAttempts: Array.isArray(item.accuracyAttempts) ? item.accuracyAttempts : [],
  }));

  state.checkins = [...new Set(state.checkins.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
  state.makeupCheckins = state.makeupCheckins
    .map(item => (typeof item === 'string' ? { date: item, createdAt: null } : item))
    .filter(item => isObject(item) && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  state.wrongBook = state.wrongBook.filter(item => isObject(item) && item.expressionID)
    .map(item => ({ ...item, source: item.source ?? 'quick' }));
  return state;
}

/** Throw a readable error when references are broken. */
export function validateState(state) {
  const groupIDs = new Set();
  for (const group of state.groups) {
    if (!group.id) throw new Error('有分组缺少 id。');
    if (groupIDs.has(group.id)) throw new Error(`分组 id 重复：${group.id}`);
    groupIDs.add(group.id);
  }
  const expressionIDs = new Set();
  for (const item of state.expressions) {
    if (!item.id) throw new Error('有表达缺少 id。');
    if (expressionIDs.has(item.id)) throw new Error(`表达 id 重复：${item.id}`);
    if (!groupIDs.has(item.groupID)) throw new Error(`表达「${item.english}」指向不存在的分组。`);
    expressionIDs.add(item.id);
  }
  const progressIDs = new Set();
  for (const item of state.progress) {
    if (progressIDs.has(item.expressionID)) throw new Error(`学习进度重复：${item.expressionID}`);
    progressIDs.add(item.expressionID);
  }
  return true;
}

function mergeById(current, incoming, key = 'id') {
  const result = current.map(item => ({ ...item }));
  const index = new Map(result.map((item, i) => [item[key], i]));
  let added = 0; let updated = 0;
  for (const item of incoming) {
    const id = item?.[key];
    if (id == null) continue;
    if (index.has(id)) { result[index.get(id)] = { ...result[index.get(id)], ...item }; updated += 1; }
    else { index.set(id, result.length); result.push({ ...item }); added += 1; }
  }
  return { list: result, added, updated };
}

const KNOWN_KEYS = new Set(['pausedDays', 'checkinBackfills', 'groups', 'expressions', 'progress', 'checkins', 'favorites', 'makeupCheckins', 'wrongBook',
  'dailyMistakes', 'sessions', 'quickReviewSessions', 'wrongDictationSession', 'settings', 'migrations', 'navigationMemory', 'schemaVersion']);

/**
 * Data-only merge restore: update records with the same ID, append new ones,
 * keep unknown fields. Either returns a fully valid new state or throws —
 * the caller only swaps state on success (atomic).
 */
export function mergeImport(currentInput, payload) {
  const current = normalizeState(currentInput);
  const imported = normalizeState(unwrapPayload(clone(payload)));
  validateState(imported);

  const groups = mergeById(current.groups, imported.groups);
  const expressions = mergeById(current.expressions, imported.expressions);
  const progress = mergeById(current.progress, imported.progress, 'expressionID');

  const next = { ...current };
  for (const [key, value] of Object.entries(imported)) if (!KNOWN_KEYS.has(key)) next[key] = value;
  next.groups = groups.list;
  next.expressions = expressions.list;
  next.progress = progress.list;
  next.checkins = [...new Set([...current.checkins, ...imported.checkins])].sort();
  next.favorites = [...new Set([...current.favorites, ...imported.favorites])];
  const makeup = new Map(current.makeupCheckins.map(item => [item.date, item]));
  imported.makeupCheckins.forEach(item => makeup.set(item.date, item));
  next.makeupCheckins = [...makeup.values()].sort((a, b) => a.date.localeCompare(b.date));
  next.wrongBook = mergeById(current.wrongBook, imported.wrongBook, 'expressionID').list;
  next.dailyMistakes = { ...current.dailyMistakes };
  for (const [day, records] of Object.entries(imported.dailyMistakes)) {
    const list = [...(next.dailyMistakes[day] ?? [])];
    for (const record of records ?? []) {
      const id = typeof record === 'string' ? record : record?.expressionID;
      if (id && !list.some(item => (typeof item === 'string' ? item : item?.expressionID) === id && (item?.source ?? 'new') === (record?.source ?? 'new'))) list.push(record);
    }
    next.dailyMistakes[day] = list;
  }
  next.sessions = imported.sessions.length ? imported.sessions : current.sessions;
  next.quickReviewSessions = { ...current.quickReviewSessions, ...imported.quickReviewSessions };
  next.wrongDictationSession = imported.wrongDictationSession ?? current.wrongDictationSession;
  next.settings = { ...current.settings, ...imported.settings };
  next.migrations = { ...current.migrations, ...imported.migrations };
  next.pausedDays = [...new Set([...current.pausedDays, ...imported.pausedDays])].sort();
  next.checkinBackfills = { ...current.checkinBackfills, ...imported.checkinBackfills };
  next.navigationMemory = current.navigationMemory;
  next.schemaVersion = current.schemaVersion ?? SCHEMA_VERSION;

  // Re-apply favourites from the merged list onto expressions.
  const favorites = new Set(next.favorites);
  next.expressions = next.expressions.map(item => ({ ...item, isFavorite: Boolean(item.isFavorite) || favorites.has(item.id) }));
  const result = normalizeState(next);
  validateState(result);
  return {
    state: result,
    report: {
      groupsAdded: groups.added, groupsUpdated: groups.updated,
      expressionsAdded: expressions.added, expressionsUpdated: expressions.updated,
      progressAdded: progress.added, progressUpdated: progress.updated,
    },
  };
}

/** Replace everything with the backup (still data only; app code is untouched). */
export function replaceImport(payload, currentSettings = {}) {
  const imported = normalizeState(unwrapPayload(clone(payload)));
  imported.navigationMemory = {};
  imported.settings = { ...currentSettings, ...imported.settings };
  validateState(imported);
  return imported;
}

export function countState(state) {
  return {
    groups: state.groups.length,
    expressions: state.expressions.length,
    progress: state.progress.length,
    learned: state.progress.filter(item => item.firstLearnedAt).length,
    accuracyAttempts: state.progress.reduce((sum, item) => sum + (item.accuracyAttempts?.length ?? 0), 0),
    checkins: state.checkins.length,
    wrongBook: state.wrongBook.length,
    favorites: state.favorites.length,
  };
}

/** Stable JSON (sorted keys) so the same data always hashes the same. */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** SHA-256 over the learning content (groups, expressions, progress, check-ins). */
export async function contentHash(state) {
  const content = canonicalJSON({ groups: state.groups, expressions: state.expressions, progress: state.progress, checkins: state.checkins });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildExport(state, exportedAt = new Date().toISOString()) {
  return {
    backupVersion: 1,
    app: APP_NAME,
    exportedAt,
    schemaVersion: state.schemaVersion ?? SCHEMA_VERSION,
    counts: countState(state),
    contentHash: await contentHash(state),
    state: clone(state),
  };
}

// ---------- One-off data migrations ----------

export const GAP_MIGRATION = 'gap-pause-2026-10-07-v1';
const GAP_FROM = '2026-10-07';
const GAP_TO = '2026-10-14';

function daysBetween(from, to) {
  const out = []; const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * The learner took a break from 2026-10-07 to 2026-10-14 and came back to
 * every review overdue. This (a) fills in the missing check-ins for those days
 * and (b) stops those days from counting towards review due dates, as if the
 * break never happened. Learning records (first-learned time, mastery,
 * attempts, error counts) are untouched. Runs once per data set.
 */
export function applyGapMigration(state, { now = new Date().toISOString() } = {}) {
  state.migrations ??= {};
  if (state.migrations[GAP_MIGRATION]) return null;
  const hasLearning = state.progress.some(item => item.firstLearnedAt);
  if (!hasLearning) { state.migrations[GAP_MIGRATION] = 'not-needed'; return null; }

  const days = daysBetween(GAP_FROM, GAP_TO);
  // A day with real learning (a first learning event) is never paused.
  const learnedDays = new Set(state.progress.filter(item => item.firstLearnedAt).map(item => item.firstLearnedAt.slice(0, 10)));
  const paused = days.filter(day => !learnedDays.has(day));
  const missing = days.filter(day => !state.checkins.includes(day));

  state.pausedDays = [...new Set([...(state.pausedDays ?? []), ...paused])].sort();
  state.checkinBackfills ??= {};
  for (const day of missing) { state.checkins.push(day); state.checkinBackfills[day] = now; }
  state.checkins = [...new Set(state.checkins)].sort();
  state.migrations[GAP_MIGRATION] = now;
  return { paused: paused.length, checkinsAdded: missing.length };
}

export const UNDO_MIGRATION = 'undo-catchup-2026-10-15-v1';
const CATCHUP_DAY = '2026-10-15';
const CATCHUP_MINUTE = '2026-10-15T13:49';

/**
 * On 2026-10-15 an old one-click "catch-up" marked every learned expression as
 * reviewed (all correct) in a single minute. Those were not real answers. This
 * removes exactly those records: each affected expression goes back one review
 * node and loses that one auto attempt. Anything reviewed for real since then
 * (last reviewed time no longer inside that minute) is left alone.
 * It also keeps the days between then and now (when nothing was studied) out
 * of the schedule, so what is due on the first day back shows as today's review
 * instead of overdue.
 */
export function applyUndoCatchup(state, { now = new Date().toISOString() } = {}) {
  state.migrations ??= {};
  if (state.migrations[UNDO_MIGRATION]) return null;
  let undone = 0; let removedAttempts = 0; let kept = 0;
  for (const p of state.progress) {
    const idx = p.intervalIndex ?? 0;
    const key = `node:${idx - 1}:${CATCHUP_DAY}`;
    const at = (p.accuracyAttempts ?? []).findIndex(item => item.key === key);
    if (at < 0 || !String(p.lastReviewedAt ?? '').startsWith(CATCHUP_MINUTE)) {
      if ((p.accuracyAttempts ?? []).some(item => item.key.startsWith('node:') && item.key.endsWith(`:${CATCHUP_DAY}`))) kept += 1;
      continue;
    }
    p.accuracyAttempts.splice(at, 1);
    p.intervalIndex = idx - 1;
    const last = p.accuracyAttempts[p.accuracyAttempts.length - 1];
    p.lastAttemptCorrect = last ? Boolean(last.correct) : p.firstAttemptCorrect;
    p.needsStrengthening = last ? !last.correct : false;
    const lastDay = [...p.accuracyAttempts].reverse().map(item => item.key.match(/(\d{4}-\d{2}-\d{2})$/)?.[1]).find(Boolean);
    p.lastReviewedAt = lastDay ? `${lastDay}T12:00:00+08:00` : p.firstLearnedAt;
    undone += 1; removedAttempts += 1;
  }
  // Idle days since the one-click catch-up do not count either.
  const today = new Date(new Date(now).getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const touched = new Set(state.progress.flatMap(p => [p.firstLearnedAt?.slice(0, 10), ...(p.accuracyAttempts ?? []).map(item => item.key.match(/(\d{4}-\d{2}-\d{2})$/)?.[1])]).filter(Boolean));
  const idle = today > CATCHUP_DAY ? daysBetween(CATCHUP_DAY, new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)).filter(day => !touched.has(day)) : [];
  state.pausedDays = [...new Set([...(state.pausedDays ?? []), ...idle])].sort();
  state.migrations[UNDO_MIGRATION] = now;
  return { undone, removedAttempts, kept, idleDays: idle.length };
}

export function hasPendingMigrations(state) {
  return !state.migrations?.[GAP_MIGRATION] || !state.migrations?.[UNDO_MIGRATION];
}
export const MIGRATION_KEYS = [GAP_MIGRATION, UNDO_MIGRATION];

export function applyMigrations(state, options = {}) {
  const gap = applyGapMigration(state, options);
  const undo = applyUndoCatchup(state, options);
  return gap || undo ? { gap, undo } : null;
}
