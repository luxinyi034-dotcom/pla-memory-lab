// Read-only derived data. Views call these; they never mutate state.
import { todayKey, dayKey, addDaysKey } from './time.js';
import { isDue, nextDueDay, nodeStatus, mastery, reviewedOn, REVIEW_INTERVALS, learnedDay } from './srs.js';

export function buildIndex(state) {
  const groupById = new Map(state.groups.map(group => [group.id, group]));
  const exprById = new Map(state.expressions.map(item => [item.id, item]));
  const progressById = new Map(state.progress.map(item => [item.expressionID, item]));
  const exprsByGroup = new Map(state.groups.map(group => [group.id, []]));
  state.expressions.forEach(item => { if (exprsByGroup.has(item.groupID)) exprsByGroup.get(item.groupID).push(item); });
  exprsByGroup.forEach(list => list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
  const importOrder = new Map(state.expressions.map((item, index) => [item.id, index]));
  return { state, groupById, exprById, progressById, exprsByGroup, importOrder };
}

export const categoryLabel = category => (category === 'vocabulary' ? '词汇积累' : '表达积累');
export const groupItems = (ix, groupID) => ix.exprsByGroup.get(groupID) ?? [];
export const progressOf = (ix, id) => ix.progressById.get(id);
export const isLearned = (ix, id) => Boolean(ix.progressById.get(id)?.firstLearnedAt);
export const masteryOf = (ix, id) => mastery(ix.progressById.get(id));

const time = value => { const ms = Date.parse(value ?? ''); return Number.isFinite(ms) ? ms : Infinity; };

/** Import order of a group: createdAt, then manual sortOrder. */
export function compareImport(a, b) {
  const left = Date.parse(a.createdAt ?? '') || 0; const right = Date.parse(b.createdAt ?? '') || 0;
  return left - right || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** Within a group: earliest first-learned first, then the table order. */
export function compareLearned(ix) {
  return (a, b) => time(ix.progressById.get(a.id)?.firstLearnedAt) - time(ix.progressById.get(b.id)?.firstLearnedAt)
    || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

export function earliestLearned(ix, groupID) {
  return groupItems(ix, groupID).reduce((min, item) => Math.min(min, time(ix.progressById.get(item.id)?.firstLearnedAt)), Infinity);
}

/** Groups ordered by when they were first learned; never-learned groups follow in import order. */
export function groupsByLearnedOrder(ix, groups) {
  return [...groups].sort((a, b) => {
    const la = earliestLearned(ix, a.id); const lb = earliestLearned(ix, b.id);
    if (la !== lb) return la - lb;
    return compareImport(a, b);
  });
}

// ---------- New learning ----------

/** Groups of a category that still contain unlearned expressions, oldest import first. */
export function newLearningGroups(ix, category) {
  return ix.state.groups
    .filter(group => group.category === category)
    .map(group => {
      const items = groupItems(ix, group.id);
      const unlearned = items.filter(item => !isLearned(ix, item.id));
      return { group, items, unlearned, taskCount: unlearned.length };
    })
    .filter(entry => entry.taskCount > 0)
    .sort((a, b) => compareImport(a.group, b.group));
}

/** Pick whole groups in order so the total lands as close to the target as possible. */
export function recommendGroups(entries, target) {
  const picked = []; let total = 0;
  for (const entry of entries) {
    if (total >= target) break;
    const next = total + entry.taskCount;
    if (picked.length && Math.abs(next - target) > Math.abs(total - target)) break;
    picked.push(entry); total = next;
  }
  return picked;
}

export function dailyCategory(state, today = todayKey()) {
  const rotation = state.categoryRotation;
  if (rotation?.date === today && rotation.category) return rotation.category;
  // Alternate with whatever was used last time (by date), default to expression.
  if (rotation?.category) return rotation.category === 'vocabulary' ? 'expression' : 'vocabulary';
  return 'expression';
}

// ---------- Reviews ----------

export function dueExpressions(ix, today = todayKey()) {
  return ix.state.expressions.filter(item => isDue(ix.progressById.get(item.id), today));
}

/** Due groups (earliest learning first) with their due items (earliest learning first). */
export function dueGroups(ix, today = todayKey()) {
  const byGroup = new Map();
  dueExpressions(ix, today).forEach(item => {
    if (!byGroup.has(item.groupID)) byGroup.set(item.groupID, []);
    byGroup.get(item.groupID).push(item);
  });
  const order = compareLearned(ix);
  return [...byGroup.entries()]
    .map(([groupID, items]) => ({ group: ix.groupById.get(groupID), items: items.sort(order) }))
    .filter(entry => entry.group)
    .sort((a, b) => time(ix.progressById.get(a.items[0].id)?.firstLearnedAt) - time(ix.progressById.get(b.items[0].id)?.firstLearnedAt)
      || compareImport(a.group, b.group));
}

export function todayNewItems(ix, today = todayKey()) {
  return ix.state.expressions.filter(item => learnedDay(ix.progressById.get(item.id)) === today).sort(compareLearned(ix));
}

export function todayReviewedItems(ix, today = todayKey()) {
  return ix.state.expressions.filter(item => {
    const progress = ix.progressById.get(item.id);
    return progress?.firstLearnedAt && learnedDay(progress) !== today && reviewedOn(progress, today);
  }).sort(compareLearned(ix));
}

/** Group a list of expressions into [{group, items}] preserving first-appearance order. */
export function sectionByGroup(ix, items) {
  const sections = new Map();
  items.forEach(item => {
    if (!sections.has(item.groupID)) sections.set(item.groupID, { group: ix.groupById.get(item.groupID), items: [] });
    sections.get(item.groupID).items.push(item);
  });
  return [...sections.values()].filter(section => section.group);
}

// ---------- Plan ----------

export function groupMastery(ix, groupID) {
  const values = groupItems(ix, groupID).map(item => masteryOf(ix, item.id)).filter(value => value != null);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function groupNodeStatus(ix, groupID, node, today = todayKey()) {
  const statuses = groupItems(ix, groupID).map(item => nodeStatus(ix.progressById.get(item.id), node, today)).filter(status => status !== 'locked');
  if (!statuses.length) return 'locked';
  if (statuses.every(status => status === 'done')) return 'done';
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('today')) return 'today';
  return 'future';
}

/** { label, tone, days } for the plan's "下一复习" column. */
export function groupNextReview(ix, groupID, today = todayKey()) {
  const items = groupItems(ix, groupID);
  const learned = items.filter(item => isLearned(ix, item.id));
  if (!learned.length) return { label: '尚未开始', tone: 'quiet', days: Infinity };
  const days = learned.map(item => nextDueDay(ix.progressById.get(item.id))).filter(Boolean).sort();
  if (!days.length) return { label: '已全部完成', tone: 'done', days: Infinity };
  return reviewLabel(days[0], today);
}

export function reviewLabel(day, today = todayKey()) {
  if (!day) return { label: '尚未开始', tone: 'quiet', days: Infinity };
  const [ty, tm, td] = today.split('-').map(Number); const [y, m, d] = day.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  // Anything that has come due simply is today's review; there is no "overdue".
  if (days < 0) return { label: '今日复习', tone: 'today', days };
  if (days === 0) return { label: '今日复习', tone: 'today', days };
  return { label: `${days} 天后`, tone: 'future', days };
}

export function masteryTone(value) {
  if (value == null) return 'none';
  return value >= 85 ? 'high' : value >= 60 ? 'mid' : 'low';
}

export function passesMasteryFilter(value, filter) {
  if (filter === 'all') return true;
  return value != null && value < Number(filter);
}

// ---------- Check-ins ----------

export function streak(checkins, today = todayKey()) {
  const set = new Set(checkins);
  let cursor = set.has(today) ? today : addDaysKey(today, -1);
  let count = 0;
  while (set.has(cursor)) { count += 1; cursor = addDaysKey(cursor, -1); }
  return count;
}

export const MAKEUP_LIMIT_PER_MONTH = 2;
export function makeupUsed(state, monthKey) {
  return state.makeupCheckins.filter(item => item.date.slice(0, 7) === monthKey).length;
}
export function canMakeup(state, date, today = todayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return { ok: false, reason: '只能补过去的日期' };
  if (state.checkins.includes(date)) return { ok: false, reason: '这一天已经打卡' };
  if (makeupUsed(state, date.slice(0, 7)) >= MAKEUP_LIMIT_PER_MONTH) return { ok: false, reason: `本月补打卡已用完（每月 ${MAKEUP_LIMIT_PER_MONTH} 次）` };
  return { ok: true };
}

// ---------- Quick check ----------

export function quickQueue(ix, source, today = todayKey()) {
  if (source === 'today') return [...todayNewItems(ix, today), ...todayReviewedItems(ix, today)].map(item => item.id);
  return ix.state.expressions.filter(item => isLearned(ix, item.id)).sort(compareLearned(ix)).map(item => item.id);
}

// ---------- Search ----------

export function searchExpressions(ix, query) {
  const keyword = String(query ?? '').trim().toLocaleLowerCase();
  if (!keyword) return [];
  const score = item => {
    let best = Infinity;
    for (const field of [item.english, item.chinese, item.notes, item.example]) {
      const text = String(field ?? '').toLocaleLowerCase();
      const index = text.indexOf(keyword);
      if (index < 0) continue;
      const base = field === item.english || field === item.chinese ? 0 : 10;
      best = Math.min(best, base + (text === keyword ? 0 : index === 0 ? 1 : 2 + index / 100));
    }
    return best;
  };
  return ix.state.expressions.map((item, index) => ({ item, index, s: score(item) }))
    .filter(entry => Number.isFinite(entry.s))
    .sort((a, b) => a.s - b.s || a.index - b.index)
    .map(entry => entry.item);
}

export { REVIEW_INTERVALS, dayKey };
