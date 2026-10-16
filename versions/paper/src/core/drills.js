// Quick check (快速刷词) and wrong-book dictation. Both are independent of
// the review schedule: they never change mastery or due dates.
import { nowISO } from './time.js';
import { gradeAnswer } from './grading.js';
import { addToWrongBook, removeFromWrongBook } from './actions.js';

// ---------- Quick check ----------

/** Resume a saved quick session for `source`, keeping decisions for items still available. */
export function openQuickSession(state, source, available) {
  const saved = state.quickReviewSessions?.[source];
  const availableSet = new Set(available);
  const savedQueue = (saved?.queue ?? []).filter(id => availableSet.has(id));
  const queue = savedQueue.length ? [...savedQueue, ...available.filter(id => !savedQueue.includes(id))] : [...available];
  const decisions = Object.fromEntries(Object.entries(saved?.decisions ?? saved?.quickDecisions ?? {})
    .filter(([id, value]) => availableSet.has(id) && (value === 'familiar' || value === 'unfamiliar')));
  const session = {
    type: 'quick', source, queue, decisions,
    revealed: (saved?.revealed && Array.isArray(saved.revealed) ? saved.revealed : saved?.revealedIDs ?? []).filter(id => availableSet.has(id)),
    index: 0, savedAt: nowISO(),
  };
  session.index = nextUndecided(session, Number.isFinite(saved?.index) ? saved.index : 0);
  state.quickReviewSessions[source] = session;
  return session;
}

export function nextUndecided(session, from = 0) {
  const after = session.queue.findIndex((id, i) => i >= from && !session.decisions[id]);
  if (after >= 0) return after;
  const any = session.queue.findIndex(id => !session.decisions[id]);
  return any >= 0 ? any : session.queue.length;
}

/** Latest decision wins: familiar removes from the wrong book, unfamiliar adds. */
export function decideQuick(state, session, id, decision) {
  session.decisions[id] = decision;
  if (decision === 'familiar') removeFromWrongBook(state, id); else addToWrongBook(state, id);
  session.index = nextUndecided(session, session.queue.indexOf(id) + 1);
  session.savedAt = nowISO();
}

export function toggleReveal(session, id) {
  session.revealed = session.revealed.includes(id) ? session.revealed.filter(item => item !== id) : [...session.revealed, id];
}

export function quickDone(session) {
  return session.queue.length > 0 && session.queue.every(id => session.decisions[id]);
}

// ---------- Wrong-book dictation ----------
// Pass 1 goes through every wrong-book item. Items answered wrongly go, in the
// order of their first mistake, into the next pass; a correct answer removes
// the item from the wrong book immediately. Ends when the book is empty.

export function openWrongDictation(state) {
  const live = new Set(state.wrongBook.map(item => item.expressionID).filter(id => state.expressions.some(e => e.id === id)));
  const saved = state.wrongDictationSession;
  if (saved?.type === 'wrong-dictation' && saved.phase !== 'complete') {
    const queue = (saved.queue ?? []).filter(id => live.has(id) || (saved.phase === 'result' && id === saved.queue[saved.index]));
    if (queue.some(id => live.has(id))) {
      const current = saved.queue?.[saved.index];
      const session = { ...saved, queue, retryQueue: (saved.retryQueue ?? []).filter(id => live.has(id)) };
      session.index = Math.max(0, queue.indexOf(current));
      if (session.index >= queue.length) session.index = 0;
      state.wrongDictationSession = session;
      return session;
    }
  }
  const queue = [...live];
  const session = { type: 'wrong-dictation', phase: queue.length ? 'writing' : 'complete', queue, index: 0, retryQueue: [], pass: 1, draft: '', answer: '', correct: null, totalAtStart: queue.length, cleared: 0 };
  state.wrongDictationSession = queue.length ? session : null;
  return session;
}

export function submitWrongDictation(state, session, answer) {
  const id = session.queue[session.index];
  const expression = state.expressions.find(item => item.id === id);
  const correct = expression ? gradeAnswer(answer, expression.english) : true;
  session.answer = answer; session.correct = correct; session.draft = ''; session.phase = 'result';
  if (correct) { removeFromWrongBook(state, id); session.cleared = (session.cleared ?? 0) + 1; }
  else if (!session.retryQueue.includes(id)) session.retryQueue.push(id);
  state.wrongDictationSession = session;
}

export function advanceWrongDictation(state, session) {
  session.index += 1; session.answer = ''; session.correct = null;
  const live = new Set(state.wrongBook.map(item => item.expressionID));
  // Skip anything that left the wrong book meanwhile (e.g. marked familiar in quick check).
  while (session.index < session.queue.length && !live.has(session.queue[session.index])) session.index += 1;
  if (session.index >= session.queue.length) {
    const retry = session.retryQueue.filter(id => live.has(id));
    if (retry.length) { session.queue = retry; session.retryQueue = []; session.index = 0; session.pass += 1; session.phase = 'writing'; }
    else { session.phase = 'complete'; state.wrongDictationSession = null; return session; }
  } else session.phase = 'writing';
  if (!state.wrongBook.length) { session.phase = 'complete'; state.wrongDictationSession = null; return session; }
  state.wrongDictationSession = session;
  return session;
}
