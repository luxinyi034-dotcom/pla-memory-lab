// Dictation grading. Case, spaces and punctuation are ignored, so
// "Reframe A as B." matches "reframe A as B" and "sb." matches "sb".

export function gradingText(value) {
  return String(value ?? '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

export function gradeAnswer(answer, expected) {
  const got = gradingText(answer);
  return got.length > 0 && got === gradingText(expected);
}

/**
 * Align the learner's answer with the expected text (longest common
 * subsequence over letters/digits) and return segments:
 *   { text, kind: 'ok' | 'wrong' | 'plain' }       for the answer
 *   and a list of expected letters that were missing.
 * Using LCS means one missing letter no longer marks the rest of the word red.
 */
export function diffAnswer(answer, expected) {
  const raw = String(answer ?? '');
  const a = [];
  for (let i = 0; i < raw.length; i += 1) if (/[a-z0-9]/i.test(raw[i])) a.push(i);
  const exp = gradingText(expected);
  const aLetters = a.map(i => raw[i].toLowerCase());
  const n = aLetters.length; const m = exp.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = aLetters[i] === exp[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Set();
  const missing = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (aLetters[i] === exp[j]) { matched.add(a[i]); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else { missing.push(exp[j]); j += 1; }
  }
  while (j < m) { missing.push(exp[j]); j += 1; }
  const letterSet = new Set(a);
  const segments = [];
  for (let k = 0; k < raw.length; k += 1) {
    const kind = !letterSet.has(k) ? 'plain' : matched.has(k) ? 'ok' : 'wrong';
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += raw[k];
    else segments.push({ text: raw[k], kind });
  }
  return { segments, missingCount: missing.length };
}
