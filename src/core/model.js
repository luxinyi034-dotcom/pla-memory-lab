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
    dailyMistakes: {}, navigationMemory: {}, migrations: {},
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

const KNOWN_KEYS = new Set(['groups', 'expressions', 'progress', 'checkins', 'favorites', 'makeupCheckins', 'wrongBook',
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
