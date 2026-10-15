// Review schedule: nodes at 1, 2, 4, 7, 15, 30 days after the first learning
// day. `intervalIndex` = number of nodes already completed (0..6).
import { dayKey, addActiveDays, addDaysISO, nowISO, todayKey, diffDaysKey, middayISO } from './time.js';

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];
export const NODE_LABELS = ['第一天', '第二天', '第四天', '第七天', '第十五天', '第三十天'];

export function blankProgress(expressionID) {
  return {
    expressionID, status: 'new', firstLearnedAt: null, lastReviewedAt: null, nextReviewAt: null,
    intervalIndex: 0, firstAttemptCorrect: null, lastAttemptCorrect: null, errorCount: 0,
    needsStrengthening: false, accuracyAttempts: [],
  };
}

export function learnedDay(progress) { return progress?.firstLearnedAt ? dayKey(progress.firstLearnedAt) : null; }

/** Business day on which node `node` falls due. */
export function nodeDueDay(progress, node) {
  const start = learnedDay(progress);
  return start && node < REVIEW_INTERVALS.length ? addActiveDays(start, REVIEW_INTERVALS[node]) : null;
}

function syncSchedule(progress) {
  const idx = progress.intervalIndex ?? 0;
  const due = progress.firstLearnedAt ? nodeDueDay(progress, idx) : null;
  progress.nextReviewAt = due ? addDaysISO(progress.firstLearnedAt, diffDaysKey(learnedDay(progress), due)) : null;
  progress.status = !progress.firstLearnedAt ? 'new' : idx >= REVIEW_INTERVALS.length ? 'mastered' : 'scheduled';
}

/** Recompute stored schedule fields, e.g. after the paused days changed. */
export const resyncSchedule = syncSchedule;

/** Next due business day for an expression, or null when not learned / all nodes done. */
export function nextDueDay(progress) {
  if (!progress?.firstLearnedAt) return null;
  return nodeDueDay(progress, progress.intervalIndex ?? 0);
}

export function isDue(progress, today = todayKey()) {
  const due = nextDueDay(progress);
  return Boolean(due && due <= today);
}

/** 'done' | 'today' | 'overdue' | 'future' | 'locked' */
export function nodeStatus(progress, node, today = todayKey()) {
  if (!progress?.firstLearnedAt) return 'locked';
  if ((progress.intervalIndex ?? 0) > node) return 'done';
  const due = nodeDueDay(progress, node);
  // A later node only becomes reachable after the current one is passed.
  if ((progress.intervalIndex ?? 0) < node) return 'future';
  return due === today ? 'today' : due < today ? 'overdue' : 'future';
}

function recordAttempt(progress, key, correct) {
  progress.accuracyAttempts ??= [];
  if (progress.accuracyAttempts.some(item => item.key === key)) return false;
  progress.accuracyAttempts.push({ key, correct: Boolean(correct) });
  return true;
}

/** First dictation of a new expression. Later retries in the same session do not call this. */
export function recordNew(progress, correct, now = nowISO()) {
  progress.firstLearnedAt ??= now;
  progress.firstAttemptCorrect = correct;
  progress.lastAttemptCorrect = correct;
  progress.intervalIndex = 0;
  progress.needsStrengthening = !correct;
  if (recordAttempt(progress, `new:${dayKey(progress.firstLearnedAt)}`, correct) && !correct) progress.errorCount = (progress.errorCount ?? 0) + 1;
  progress.lastReviewedAt = now;
  syncSchedule(progress);
}

/**
 * A scheduled review answer. Only the first answer for a node on a given day
 * counts toward mastery; the node advances once the answer is correct.
 * Nodes that were missed entirely (their date already passed) are folded in,
 * so one catch-up review never leaves the expression due again tomorrow for
 * a date that is already behind us.
 */
export function recordReview(progress, correct, now = nowISO()) {
  const today = dayKey(now);
  const current = progress.intervalIndex ?? 0;
  const counted = recordAttempt(progress, `node:${current}:${today}`, correct);
  if (correct) {
    let idx = Math.min(current + 1, REVIEW_INTERVALS.length);
    while (idx < REVIEW_INTERVALS.length && nodeDueDay(progress, idx) <= today) idx += 1;
    progress.intervalIndex = idx;
    progress.lastAttemptCorrect = true;
    progress.needsStrengthening = false;
  } else {
    progress.lastAttemptCorrect = false;
    progress.needsStrengthening = true;
    if (counted) progress.errorCount = (progress.errorCount ?? 0) + 1;
  }
  progress.lastReviewedAt = now;
  syncSchedule(progress);
}

/** Make-up check-in: treat everything due on or before `target` as reviewed correctly that day. */
export function completeReviewsForDay(progress, target) {
  if (!progress?.firstLearnedAt) return false;
  const due = nextDueDay(progress);
  if (!due || due > target) return false;
  const current = progress.intervalIndex ?? 0;
  recordAttempt(progress, `node:${current}:${target}`, true);
  let idx = current + 1;
  while (idx < REVIEW_INTERVALS.length && nodeDueDay(progress, idx) <= target) idx += 1;
  progress.intervalIndex = Math.min(idx, REVIEW_INTERVALS.length);
  progress.lastAttemptCorrect = true;
  progress.needsStrengthening = false;
  if (!progress.lastReviewedAt || dayKey(progress.lastReviewedAt) < target) progress.lastReviewedAt = middayISO(target);
  syncSchedule(progress);
  return true;
}

/** Mastery = share of counted attempts answered correctly (0-100), null if never attempted. */
export function mastery(progress) {
  const attempts = progress?.accuracyAttempts ?? [];
  if (!attempts.length) return null;
  return Math.round(attempts.filter(item => item.correct).length / attempts.length * 100);
}

/** Did this expression get a counted review answer on `day`? */
export function reviewedOn(progress, day) {
  return (progress?.accuracyAttempts ?? []).some(item => String(item.key).startsWith('node:') && String(item.key).endsWith(`:${day}`));
}

export function daysUntil(day, today = todayKey()) { return diffDaysKey(today, day); }
