// All state mutations live here. Each function mutates the given state
// in place; the store wraps calls so the index is rebuilt and saved.
import { nowISO, todayKey } from './time.js';
import { blankProgress, completeReviewsForDay } from './srs.js';
import { canMakeup } from './selectors.js';

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function ensureProgress(state, expressionID) {
  let progress = state.progress.find(item => item.expressionID === expressionID);
  if (!progress) { progress = blankProgress(expressionID); state.progress.push(progress); }
  return progress;
}

const nextSortOrder = (list, filter = () => true) => list.filter(filter).reduce((max, item) => Math.max(max, (item.sortOrder ?? 0) + 1), 0);

// ---------- Groups ----------

export function createGroup(state, { name, category = 'expression', description = '' }) {
  const now = nowISO();
  const group = { id: uuid(), name: name.trim() || '未命名分组', description, category, sortOrder: nextSortOrder(state.groups), createdAt: now, updatedAt: now };
  state.groups.push(group);
  return group;
}

export function renameGroup(state, groupID, name) {
  const group = state.groups.find(item => item.id === groupID);
  if (!group || !name.trim()) return false;
  group.name = name.trim(); group.updatedAt = nowISO();
  return true;
}

export function setGroupsCategory(state, groupIDs, category) {
  const ids = new Set(groupIDs); const now = nowISO();
  state.groups.forEach(group => { if (ids.has(group.id)) { group.category = category; group.updatedAt = now; } });
}

function forgetExpressions(state, ids) {
  state.progress = state.progress.filter(item => !ids.has(item.expressionID));
  state.wrongBook = state.wrongBook.filter(item => !ids.has(item.expressionID));
  state.favorites = state.favorites.filter(id => !ids.has(id));
  for (const [key, session] of Object.entries(state.quickReviewSessions ?? {})) {
    if (!session?.queue) continue;
    session.queue = session.queue.filter(id => !ids.has(id));
    if (!session.queue.length) delete state.quickReviewSessions[key];
  }
  if (state.wrongDictationSession?.queue) {
    state.wrongDictationSession.queue = state.wrongDictationSession.queue.filter(id => !ids.has(id));
    state.wrongDictationSession.retryQueue = (state.wrongDictationSession.retryQueue ?? []).filter(id => !ids.has(id));
  }
  // Study sessions that touch removed expressions are rebuilt from scratch.
  state.sessions = (state.sessions ?? []).filter(session => !(session?.queue ?? []).some(entry => (entry.itemIDs ?? []).some(id => ids.has(id))));
}

export function deleteGroups(state, groupIDs) {
  const groups = new Set(groupIDs);
  const removed = new Set(state.expressions.filter(item => groups.has(item.groupID)).map(item => item.id));
  state.groups = state.groups.filter(group => !groups.has(group.id));
  state.expressions = state.expressions.filter(item => !removed.has(item.id));
  forgetExpressions(state, removed);
  return removed.size;
}

/**
 * Apply a new order for a subset of groups (e.g. one category tab) without
 * disturbing the relative position of the others.
 */
export function reorderGroups(state, orderedIDs) {
  const sorted = [...state.groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const subset = new Set(orderedIDs);
  const queue = [...orderedIDs];
  const byID = new Map(state.groups.map(group => [group.id, group]));
  const result = sorted.map(group => (subset.has(group.id) ? byID.get(queue.shift()) : group));
  result.forEach((group, index) => { group.sortOrder = index; });
}

// ---------- Expressions ----------

const EDITABLE = ['english', 'chinese', 'phonetic', 'example', 'writingPosition', 'notes'];

export function addExpression(state, groupID, fields) {
  const now = nowISO();
  const english = String(fields.english ?? '').trim();
  if (!english) throw new Error('请填写英文表达。');
  const expression = {
    id: uuid(), groupID, english, normalizedEnglish: english.toLowerCase(),
    chinese: '', phonetic: '', example: '', writingPosition: '', notes: '',
    sortOrder: nextSortOrder(state.expressions, item => item.groupID === groupID), isFavorite: false, createdAt: now, updatedAt: now,
  };
  EDITABLE.forEach(key => { if (key !== 'english' && fields[key] != null) expression[key] = String(fields[key]).trim(); });
  state.expressions.push(expression);
  return expression;
}

/** Edit content only. ID, progress, error history and favourite stay intact. */
export function updateExpression(state, id, fields) {
  const expression = state.expressions.find(item => item.id === id);
  if (!expression) throw new Error('这条表达已不存在。');
  const english = String(fields.english ?? expression.english).trim();
  if (!english) throw new Error('英文表达不能为空。');
  EDITABLE.forEach(key => { if (fields[key] != null) expression[key] = String(fields[key]).trim(); });
  expression.english = english;
  expression.normalizedEnglish = english.toLowerCase();
  if (fields.groupID && fields.groupID !== expression.groupID) {
    expression.sortOrder = nextSortOrder(state.expressions, item => item.groupID === fields.groupID);
    expression.groupID = fields.groupID;
  }
  expression.updatedAt = nowISO();
  return expression;
}

export function deleteExpression(state, id) {
  state.expressions = state.expressions.filter(item => item.id !== id);
  forgetExpressions(state, new Set([id]));
}

export function toggleFavorite(state, id) {
  const expression = state.expressions.find(item => item.id === id);
  if (!expression) return false;
  expression.isFavorite = !expression.isFavorite;
  state.favorites = state.expressions.filter(item => item.isFavorite).map(item => item.id);
  return expression.isFavorite;
}

/**
 * Import spreadsheet records in table order. Rows with the same group name
 * and category go to the same group (existing or new).
 */
export function importRecords(state, records, { defaultCategory = 'expression', fallbackGroupName = '导入分组' } = {}) {
  const now = nowISO();
  const key = (category, name) => `${category}\u0000${name}`;
  const existing = new Map(state.groups.map(group => [key(group.category, group.name.trim()), group]));
  let groupsCreated = 0; let added = 0;
  const touched = new Set();
  for (const record of records) {
    const category = record.category ?? defaultCategory;
    const name = (record.group || fallbackGroupName).trim();
    let group = existing.get(key(category, name));
    if (!group) {
      group = { id: uuid(), name, description: '从 Excel 导入的分组。', category, sortOrder: nextSortOrder(state.groups), createdAt: now, updatedAt: now };
      state.groups.push(group); existing.set(key(category, name), group); groupsCreated += 1;
    }
    touched.add(group.id);
    addExpression(state, group.id, record);
    added += 1;
  }
  return { groupsCreated, added, groupIDs: [...touched] };
}

// ---------- Wrong book ----------

export function addToWrongBook(state, expressionID) {
  if (!state.wrongBook.some(item => item.expressionID === expressionID)) state.wrongBook.push({ expressionID, createdAt: nowISO(), source: 'quick' });
}
export function removeFromWrongBook(state, expressionID) {
  state.wrongBook = state.wrongBook.filter(item => item.expressionID !== expressionID);
}

// ---------- Daily records ----------

export function recordDailyMistake(state, expressionID, source, day = todayKey()) {
  state.dailyMistakes[day] ??= [];
  const list = state.dailyMistakes[day];
  if (!list.some(item => item?.expressionID === expressionID && item.source === source)) list.push({ expressionID, source, firstWrongAt: nowISO() });
}

export function markCheckin(state, day = todayKey()) {
  if (!state.checkins.includes(day)) { state.checkins.push(day); state.checkins.sort(); return true; }
  return false;
}

/** Make-up check-in: marks the date and treats that day's reviews as done. New learning is untouched. */
export function claimMakeup(state, date, today = todayKey()) {
  const check = canMakeup(state, date, today);
  if (!check.ok) throw new Error(check.reason);
  state.makeupCheckins.push({ date, createdAt: nowISO() });
  markCheckin(state, date);
  let reviewed = 0;
  state.progress.forEach(progress => { if (completeReviewsForDay(progress, date)) reviewed += 1; });
  return reviewed;
}
