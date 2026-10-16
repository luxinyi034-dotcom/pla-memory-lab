// One-off clean-up of the review schedule (2026-10-16), run once as a keyed
// migration from model.js. The store keeps a snapshot of the data before it runs.
import { dayKey, nowISO, setPausedDays } from './time.js';
import { blankProgress, nodeDueDay, resyncSchedule } from './srs.js';

export const REGULAR_MIGRATION = 'regular-schedule-2026-10-16-v1';
const RESET_DAY = '2026-10-16';
const NODE_KEY = /^node:(\d+):(\d{4}-\d{2}-\d{2})$/;

/**
 * Make every learned expression follow the plain schedule counted from the day
 * it was first learned:
 * - a review done late is filed under the day it was due (result unchanged),
 * - a review done early or on a paused day (accidental taps) is dropped and
 *   that node is open again,
 * - everything recorded on the learning day 2026-10-16 is undone so that day
 *   starts over: its reviews, its new learning (those words become new again),
 *   its check-in, its wrong-answer list and (when run that day) any
 *   half-finished session. This applies whenever the release is first opened,
 *   since anything studied after that is kept.
 * Results of real answers, favourites, the wrong-word book and the library are
 * not touched.
 */
export function applyRegularSchedule(state, { now = nowISO() } = {}) {
  state.migrations ??= {};
  if (state.migrations[REGULAR_MIGRATION]) return null;
  setPausedDays(state.pausedDays);
  const paused = new Set(state.pausedDays ?? []);
  const runningOnResetDay = dayKey(now) === RESET_DAY;
  const report = { moved: 0, dropped: 0, unlearned: 0, todayRemoved: 0, checkinRemoved: false };

  state.progress = (state.progress ?? []).map(progress => {
    if (!progress.firstLearnedAt) return progress;
    if (dayKey(progress.firstLearnedAt) === RESET_DAY) {
      report.unlearned += 1;
      report.todayRemoved += (progress.accuracyAttempts ?? []).length;
      return blankProgress(progress.expressionID);
    }
    const attempts = progress.accuracyAttempts ?? [];
    const kept = [];
    let index = progress.intervalIndex ?? 0;
    let errorsRemoved = 0;
    for (const attempt of attempts) {
      const match = NODE_KEY.exec(String(attempt.key));
      if (!match) { kept.push(attempt); continue; }
      const node = Number(match[1]);
      const day = match[2];
      const due = nodeDueDay(progress, node);
      const today = day === RESET_DAY;
      const target = `node:${node}:${due}`;
      const duplicate = day !== due && (kept.some(item => item.key === target) || attempts.some(item => item.key === target));
      if (today || !due || paused.has(day) || day < due || duplicate) {
        index = Math.min(index, node);
        if (!attempt.correct) errorsRemoved += 1;
        if (today) report.todayRemoved += 1; else report.dropped += 1;
        continue;
      }
      if (day !== due) { kept.push({ ...attempt, key: target }); report.moved += 1; continue; }
      kept.push(attempt);
    }
    progress.accuracyAttempts = kept;
    progress.intervalIndex = index;
    progress.errorCount = Math.max(0, (progress.errorCount ?? 0) - errorsRemoved);
    const last = kept[kept.length - 1];
    progress.lastAttemptCorrect = last ? Boolean(last.correct) : progress.firstAttemptCorrect;
    progress.needsStrengthening = last ? !last.correct : false;
    const lastDay = [...kept].reverse().map(item => String(item.key).match(/(\d{4}-\d{2}-\d{2})$/)?.[1]).find(Boolean);
    progress.lastReviewedAt = lastDay && lastDay !== dayKey(progress.firstLearnedAt) ? `${lastDay}T12:00:00+08:00` : progress.firstLearnedAt;
    resyncSchedule(progress);
    return progress;
  });

  const before = (state.checkins ?? []).length;
  state.checkins = (state.checkins ?? []).filter(day => day !== RESET_DAY);
  report.checkinRemoved = state.checkins.length !== before;
  if (state.dailyMistakes) delete state.dailyMistakes[RESET_DAY];
  if (runningOnResetDay) state.sessions = [];
  state.migrations[REGULAR_MIGRATION] = now;
  return report;
}
