import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayKey, setClock, addDaysKey, setPausedDays, addActiveDays } from '../src/core/time.js';
import { blankProgress, recordNew, recordReview, nodeStatus, isDue, nextDueDay, mastery, completeReviewsForDay } from '../src/core/srs.js';
import { applyMigrations, applyUndoCatchup, UNDO_MIGRATION, applyGapMigration, GAP_MIGRATION, normalizeState, mergeImport, replaceImport, validateState, buildExport, countState, contentHash } from '../src/core/model.js';
import { buildIndex, recommendGroups, newLearningGroups, dueGroups, streak, canMakeup, groupNodeStatus } from '../src/core/selectors.js';
import { gradeAnswer, diffAnswer } from '../src/core/grading.js';
import { claimMakeup, addToWrongBook, deleteGroups, reorderGroups, importRecords } from '../src/core/actions.js';
import { createFlow, recognize, nextAfterDetail, submitAnswer, nextAfterResult, nextGroup, currentItemID } from '../src/core/study.js';
import { openQuickSession, decideQuick, openWrongDictation, submitWrongDictation, advanceWrongDictation } from '../src/core/drills.js';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url)));
const fresh = () => normalizeState(seed.state);

test('learning day switches at 02:00 Beijing time', () => {
  assert.equal(dayKey('2026-10-15T17:59:59Z'), '2026-10-15'); // 01:59:59 on the 16th, Beijing
  assert.equal(dayKey('2026-10-15T18:00:00Z'), '2026-10-16'); // 02:00 on the 16th, Beijing
  assert.equal(dayKey('2026-10-15T15:59:00Z'), '2026-10-15'); // 23:59 Beijing
  assert.equal(addDaysKey('2026-12-30', 3), '2027-01-02');
});

test('review nodes follow 1/2/4/7/15/30 days and same-day due is "today", not 0', () => {
  setClock('2026-10-01T04:00:00Z');
  const p = blankProgress('x');
  recordNew(p, true);
  assert.equal(nextDueDay(p), '2026-10-02');
  setClock('2026-10-02T23:00:00Z'); // 07:00 on the 3rd Beijing -> business day 10-03
  assert.equal(nodeStatus(p, 0, '2026-10-02'), 'today');
  assert.equal(isDue(p, '2026-10-02'), true);
  setClock('2026-10-02T03:00:00Z');
  recordReview(p, true);
  assert.equal(p.intervalIndex, 1);
  assert.equal(nextDueDay(p), '2026-10-03');
  // Wrong answer keeps the node, a correct retry passes it but counts once.
  setClock('2026-10-03T03:00:00Z');
  recordReview(p, false);
  assert.equal(p.intervalIndex, 1);
  recordReview(p, true);
  assert.equal(p.intervalIndex, 2);
  assert.equal(p.accuracyAttempts.length, 3);
  assert.equal(mastery(p), 67);
  setClock(null);
});

test('a late review folds in nodes whose date already passed', () => {
  setClock('2026-09-27T04:00:00Z');
  const p = blankProgress('y'); recordNew(p, true);
  setClock('2026-10-10T04:00:00Z');
  recordReview(p, true);
  assert.equal(nextDueDay(p), '2026-10-12');
  setClock(null);
});

test('imports the latest backup with identical IDs and counts', () => {
  const state = fresh();
  validateState(state);
  const counts = countState(state);
  assert.equal(counts.groups, 135);
  assert.equal(counts.expressions, 546);
  assert.equal(counts.progress, 232);
  assert.equal(counts.checkins, 11);
  assert.equal(counts.favorites, 3);
  assert.equal(state.state, undefined, 'nested stale backup removed');
  assert.deepEqual(state.groups.map(g => g.id), seed.state.groups.map(g => g.id));
  assert.deepEqual(state.expressions.map(e => e.id), seed.state.expressions.map(e => e.id));
  assert.equal(state.groups[0].name, '改变观点');
  assert.equal(state.expressions[0].english, 'reframe A as B');
  // unknown fields survive
  assert.ok(state.lastReviewRound && state.categoryRotation && state.migrations);
});

test('merge import updates by ID, appends new, keeps unknown fields, and is atomic', async () => {
  const current = fresh();
  current.myCustomField = { keep: true };
  const payload = await buildExport(current);
  payload.state.expressions[0].chinese = '改过的释义';
  payload.state.expressions.push({ id: 'new-1', groupID: payload.state.groups[0].id, english: 'new one', chinese: '新' });
  payload.state.futureField = 42;
  const { state, report } = mergeImport(current, payload);
  assert.equal(state.expressions.length, 547);
  assert.equal(state.expressions[0].chinese, '改过的释义');
  assert.equal(report.expressionsAdded, 1);
  assert.equal(state.myCustomField.keep, true);
  assert.equal(state.futureField, 42);
  const broken = structuredClone(payload);
  broken.state.expressions.push({ id: 'bad', groupID: 'missing', english: 'x' });
  assert.throws(() => mergeImport(current, broken));
});

test('export → import round-trips counts and hash', async () => {
  const state = fresh();
  const payload = await buildExport(state);
  const restored = replaceImport(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(countState(restored), payload.counts);
  assert.equal(await contentHash(restored), payload.contentHash);
});

test('new learning recommends whole groups, oldest import first, close to target', () => {
  const state = fresh();
  const ix = buildIndex(state);
  const entries = newLearningGroups(ix, 'expression');
  assert.ok(entries.length > 0);
  for (const target of [20, 40, 60, 100]) {
    const picked = recommendGroups(entries, target);
    const total = picked.reduce((s, e) => s + e.taskCount, 0);
    assert.deepEqual(picked.map(e => e.group.id), entries.slice(0, picked.length).map(e => e.group.id));
    assert.ok(Math.abs(total - target) <= Math.max(...entries.map(e => e.taskCount)));
  }
});

test('due review groups exist for the backup and plan node status is per group', () => {
  const state = fresh();
  const ix = buildIndex(state);
  const groups = dueGroups(ix, '2026-10-16');
  assert.ok(groups.length > 0);
  const status = groupNodeStatus(ix, state.groups[0].id, 0, '2026-10-16');
  assert.equal(status, 'done');
});

test('grading ignores case/punctuation and diff marks only wrong letters', () => {
  assert.ok(gradeAnswer('Dissuade sb from', 'dissuade sb. from'));
  assert.ok(!gradeAnswer('', 'x'));
  const { segments } = diffAnswer('reframe a az b', 'reframe A as B');
  const wrong = segments.filter(s => s.kind === 'wrong').map(s => s.text).join('');
  assert.equal(wrong, 'z');
});

test('make-up check-in: max 2 per month, completes that day\'s reviews only', () => {
  const state = fresh();
  const today = '2026-10-16';
  assert.equal(canMakeup(state, '2026-10-16', today).ok, false);
  assert.equal(canMakeup(state, '2026-10-01', today).ok, false); // already checked in
  const before = state.progress.filter(p => p.firstLearnedAt).length;
  claimMakeup(state, '2026-10-07', today);
  claimMakeup(state, '2026-10-08', today);
  assert.equal(canMakeup(state, '2026-10-09', today).ok, false);
  assert.throws(() => claimMakeup(state, '2026-10-09', today));
  assert.ok(state.checkins.includes('2026-10-07'));
  assert.equal(state.progress.filter(p => p.firstLearnedAt).length, before, 'no new learning created');
  assert.equal(streak(['2026-10-14', '2026-10-15'], '2026-10-16'), 2);
});

test('study flow: wrong answers retry at the end; new learning checks in; review mistakes stay out of wrong book', () => {
  setClock('2026-10-16T04:00:00Z');
  const state = fresh();
  const ix = buildIndex(state);
  const entry = newLearningGroups(ix, 'vocabulary')[0];
  const ids = entry.unlearned.map(e => e.id);
  const flow = createFlow('new', [{ groupID: entry.group.id, itemIDs: ids }]);
  ids.forEach(() => { recognize(flow, true); nextAfterDetail(flow); });
  assert.equal(flow.phase, 'dictation');
  const english = id => state.expressions.find(e => e.id === id).english;
  submitAnswer(state, flow, 'wrong'); // first item wrong
  const firstID = ids[0];
  nextAfterResult(flow);
  for (let i = 1; i < ids.length; i += 1) { submitAnswer(state, flow, english(currentItemID(flow))); nextAfterResult(flow); }
  assert.equal(currentItemID(flow), firstID, 'wrong item comes back');
  submitAnswer(state, flow, english(firstID)); nextAfterResult(flow);
  assert.equal(flow.phase, 'groupDone');
  nextGroup(state, flow);
  assert.equal(flow.phase, 'complete');
  assert.ok(state.checkins.includes('2026-10-16'));
  assert.equal(state.wrongBook.length, 0);
  const p = state.progress.find(x => x.expressionID === firstID);
  assert.equal(p.firstAttemptCorrect, false);
  assert.equal(state.dailyMistakes['2026-10-16'].length, 1);
  setClock(null);
});

test('quick check: unfamiliar enters wrong book, later familiar removes; dictation empties book', () => {
  const state = fresh();
  const ids = state.progress.slice(0, 3).map(p => p.expressionID);
  const session = openQuickSession(state, 'all', ids);
  decideQuick(state, session, ids[0], 'unfamiliar');
  decideQuick(state, session, ids[1], 'unfamiliar');
  assert.equal(state.wrongBook.length, 2);
  decideQuick(state, session, ids[1], 'familiar');
  assert.deepEqual(state.wrongBook.map(w => w.expressionID), [ids[0]]);
  addToWrongBook(state, ids[2]);
  const before = JSON.stringify(state.progress);
  const d = openWrongDictation(state);
  submitWrongDictation(state, d, 'nope'); advanceWrongDictation(state, d);
  const english = id => state.expressions.find(e => e.id === id).english;
  submitWrongDictation(state, d, english(d.queue[d.index])); advanceWrongDictation(state, d);
  assert.equal(d.pass, 2);
  assert.equal(state.wrongBook.length, 1);
  submitWrongDictation(state, d, english(d.queue[d.index])); advanceWrongDictation(state, d);
  assert.equal(d.phase, 'complete');
  assert.equal(state.wrongBook.length, 0);
  assert.equal(state.wrongDictationSession, null);
  assert.equal(JSON.stringify(state.progress), before, 'dictation does not touch progress');
});

test('group delete cascades; reorder within subset keeps others', () => {
  const state = fresh();
  const vocab = state.groups.filter(g => g.category === 'vocabulary').sort((a, b) => a.sortOrder - b.sortOrder).map(g => g.id);
  const expr = state.groups.filter(g => g.category === 'expression').sort((a, b) => a.sortOrder - b.sortOrder).map(g => g.id);
  reorderGroups(state, [...vocab].reverse());
  const sorted = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(sorted.filter(g => g.category === 'expression').map(g => g.id), expr);
  assert.deepEqual(sorted.filter(g => g.category === 'vocabulary').map(g => g.id), [...vocab].reverse());
  const removed = deleteGroups(state, [state.groups[0].id]);
  assert.equal(removed, 4);
  validateState(state);
  const res = importRecords(state, [{ english: 'a', group: 'G' }, { english: 'b', group: 'G' }, { english: 'c', group: 'H', category: 'vocabulary' }]);
  assert.equal(res.groupsCreated, 2);
  assert.equal(res.added, 3);
});

test('paused days do not count towards due dates', () => {
  setPausedDays(['2026-10-07', '2026-10-08', '2026-10-09']);
  assert.equal(addActiveDays('2026-10-06', 1), '2026-10-10');
  assert.equal(addActiveDays('2026-10-05', 4), '2026-10-12'); // 06, 10, 11, 12
  assert.equal(addActiveDays('2026-10-01', 2), '2026-10-03');
  setPausedDays([]);
  assert.equal(addActiveDays('2026-10-05', 4), '2026-10-09');
});

test('gap migration fills check-ins, pauses the break, keeps learning records, is idempotent', () => {
  const state = normalizeState(seed.state);
  const before = JSON.stringify(state.progress.map(p => [p.expressionID, p.firstLearnedAt, p.intervalIndex, p.errorCount, p.accuracyAttempts]));
  const learnedBefore = state.progress.filter(p => p.firstLearnedAt).length;
  setPausedDays([]);
  const overdueBefore = state.progress.filter(p => { const d = nextDueDay(p); return d && d <= '2026-10-15'; }).length;
  const result = applyGapMigration(state, { now: '2026-10-15T14:00:00Z' });
  assert.equal(result.checkinsAdded, 8);
  assert.equal(state.checkins.length, 19);
  assert.deepEqual(state.pausedDays, ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
  assert.equal(streak(state.checkins, '2026-10-15'), 19);
  assert.equal(state.makeupCheckins.length, 0, 'does not use the monthly make-up quota');
  assert.equal(JSON.stringify(state.progress.map(p => [p.expressionID, p.firstLearnedAt, p.intervalIndex, p.errorCount, p.accuracyAttempts])), before);
  assert.equal(state.progress.filter(p => p.firstLearnedAt).length, learnedBefore);
  setPausedDays(state.pausedDays);
  const dueAfter = state.progress.filter(p => { const d = nextDueDay(p); return d && d <= '2026-10-15'; }).length;
  assert.ok(dueAfter < overdueBefore, `due today should drop (${overdueBefore} -> ${dueAfter})`);
  assert.equal(applyGapMigration(state), null, 'second run does nothing');
  assert.ok(state.migrations[GAP_MIGRATION]);
  setPausedDays([]);
});

test('undoing the 2026-10-15 one-click catch-up: removes only those records, no overdue, normal first day', () => {
  const state = normalizeState(seed.state);
  setPausedDays([]);
  const attemptsBefore = state.progress.reduce((n, p) => n + p.accuracyAttempts.length, 0);
  const learned = state.progress.filter(p => p.firstLearnedAt).length;
  const errors = state.progress.reduce((n, p) => n + p.errorCount, 0);
  const result = applyMigrations(state, { now: '2026-10-16T01:00:00Z' }); // morning of the 16th, Beijing
  assert.equal(result.undo.undone, 232);
  assert.equal(result.undo.kept, 0);
  const attemptsAfter = state.progress.reduce((n, p) => n + p.accuracyAttempts.length, 0);
  assert.equal(attemptsBefore - attemptsAfter, 232);
  assert.equal(state.progress.filter(p => p.firstLearnedAt).length, learned);
  assert.equal(state.progress.reduce((n, p) => n + p.errorCount, 0), errors, 'error counts untouched');
  assert.ok(state.progress.every(p => !p.accuracyAttempts.some(a => a.key.endsWith(':2026-10-15'))));
  assert.ok(state.pausedDays.includes('2026-10-15'), 'idle day since the catch-up is paused');
  setPausedDays(state.pausedDays);
  const today = '2026-10-16'; const counts = {};
  state.progress.forEach(p => { const d = nextDueDay(p); if (d) counts[d] = (counts[d] ?? 0) + 1; });
  const overdue = Object.entries(counts).filter(([d]) => d < today).reduce((n, [, c]) => n + c, 0);
  assert.equal(overdue, 0, 'nothing overdue');
  assert.equal(counts[today], 89, 'first day back = the usual 89');
  assert.equal(applyUndoCatchup(state), null, 'idempotent');
  setPausedDays([]);
});
