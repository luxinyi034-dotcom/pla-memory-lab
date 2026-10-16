// Study session state machine shared by new learning and scheduled review.
//
// For each group:
//   recognize (English only → 认识 / 不认识) → detail (full card) → … every item
//   dictation (Chinese prompt → write English) → result → … every item
//   wrong answers go to the end of the group's dictation queue until correct
//   groupDone → next group … → complete
//
// Only the first answer to each item counts for mastery. In a repeat
// ("再次巩固") round nothing is recorded.
import { nowISO, todayKey } from './time.js';
import { recordNew, recordReview } from './srs.js';
import { gradeAnswer } from './grading.js';
import { ensureProgress, recordDailyMistake, markCheckin, uuid } from './actions.js';

export function createFlow(type, groups, { repeat = false } = {}) {
  return {
    id: uuid(), kind: 'study', type, repeat, createdAt: nowISO(), day: todayKey(),
    queue: groups.map(entry => ({ groupID: entry.groupID, itemIDs: [...entry.itemIDs] })).filter(entry => entry.itemIDs.length),
    gi: 0, phase: 'recognize', ii: 0, recognized: {},
    dictQueue: [], di: 0, firstResult: {}, attempts: {},
    draft: '', answer: '', correct: null, errors: [],
  };
}

export const currentGroup = flow => flow.queue[flow.gi];

export function currentItemID(flow) {
  const group = currentGroup(flow);
  if (!group) return null;
  if (flow.phase === 'recognize' || flow.phase === 'detail') return group.itemIDs[flow.ii];
  if (flow.phase === 'dictation' || flow.phase === 'result') return flow.dictQueue[flow.di];
  return null;
}

export function flowTotals(flow) {
  const total = flow.queue.reduce((sum, entry) => sum + entry.itemIDs.length, 0);
  const done = Object.keys(flow.firstResult).length;
  return { total, done };
}

export function recognize(flow, known) {
  const id = currentItemID(flow);
  flow.recognized[id] = Boolean(known);
  flow.phase = 'detail';
}

export function nextAfterDetail(flow) {
  const group = currentGroup(flow);
  flow.ii += 1;
  if (flow.ii >= group.itemIDs.length) {
    flow.phase = 'dictation'; flow.dictQueue = [...group.itemIDs]; flow.di = 0; flow.draft = '';
  } else flow.phase = 'recognize';
}

/** Go back one card in the recognise/detail pass. */
export function previousCard(flow) {
  if (flow.phase === 'detail') { flow.phase = 'recognize'; return; }
  if (flow.phase === 'recognize' && flow.ii > 0) { flow.ii -= 1; flow.phase = 'detail'; }
}

export function submitAnswer(state, flow, answer) {
  const id = currentItemID(flow);
  const expression = state.expressions.find(item => item.id === id);
  if (!expression) { flow.phase = 'result'; flow.correct = true; return true; }
  const correct = gradeAnswer(answer, expression.english);
  const first = !(id in flow.firstResult);
  flow.attempts[id] = (flow.attempts[id] ?? 0) + 1;
  if (first) flow.firstResult[id] = correct;
  if (!flow.repeat) {
    const progress = ensureProgress(state, id);
    if (flow.type === 'new') {
      if (first) recordNew(progress, correct);
    } else {
      // Retries are not counted twice for mastery (same attempt key), but a
      // correct retry still passes the review node.
      recordReview(progress, correct);
    }
    if (!correct && first) recordDailyMistake(state, id, flow.type === 'new' ? 'new' : 'review');
  }
  if (!correct) {
    if (first) flow.errors.push(id);
    flow.dictQueue.push(id);
  }
  flow.answer = answer; flow.correct = correct; flow.draft = ''; flow.phase = 'result';
  return correct;
}

export function nextAfterResult(flow) {
  flow.di += 1; flow.answer = ''; flow.correct = null;
  flow.phase = flow.di >= flow.dictQueue.length ? 'groupDone' : 'dictation';
}

export function nextGroup(state, flow) {
  flow.gi += 1; flow.ii = 0; flow.di = 0; flow.dictQueue = [];
  if (flow.gi >= flow.queue.length) {
    flow.phase = 'complete';
    flow.completedAt = nowISO();
    if (flow.type === 'new' && !flow.repeat) markCheckin(state, todayKey());
  } else flow.phase = 'recognize';
}

/** A saved session is resumable only if all its expressions still exist. */
export function isResumable(state, flow) {
  if (!flow || flow.kind !== 'study' || flow.phase === 'complete' || !Array.isArray(flow.queue) || !flow.queue.length) return false;
  const ids = new Set(state.expressions.map(item => item.id));
  return flow.queue.every(entry => entry.itemIDs.every(id => ids.has(id)));
}

/** Restart a finished review as an unrecorded consolidation round. */
export function repeatFlow(flow) {
  return createFlow(flow.type, flow.queue.map(entry => ({ groupID: entry.groupID, itemIDs: entry.itemIDs })), { repeat: true });
}
