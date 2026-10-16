import { esc, icon } from '../ui/dom.js';
import { masteryTone, categoryLabel } from '../core/selectors.js';
import { diffAnswer } from '../core/grading.js';

// The English word set in the serif display face beside each Chinese page title.
const DISPLAY_WORD = {
  LIBRARY: 'Library', 'MASTERY & PLAN': 'Plan', 'QUICK CHECK': 'Quick check', FAVORITES: 'Favourites',
  'CHECK-IN': 'Check-in', SETTINGS: 'Settings', VERSIONS: 'Versions', 'DUE REVIEW': 'Review',
  'NEW LEARNING': 'New words', EXPRESSION: 'Expression', EDIT: 'Edit', ADD: 'Add',
};

export function pageHead({ eyebrow, title, sub = '', actions = '', backHref = null, backLabel = '返回' }) {
  const word = eyebrow ? DISPLAY_WORD[eyebrow] ?? eyebrow : '';
  return `<header class="page-head">
    <div class="page-head-text">
      ${backHref ? `<a class="back-link" href="${esc(backHref)}">${icon('back')}<span>${esc(backLabel)}</span></a>` : ''}
      <h1>${word ? `<span class="h-en">${esc(word)}</span>` : ''}<span class="h-zh">${esc(title)}</span></h1>
      ${sub ? `<p class="page-sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-head-actions">${actions}</div>` : ''}
  </header>`;
}

export function segmented(items, active, action, extra = '') {
  return `<div class="segmented" role="tablist" ${extra}>${items.map(([value, label, count]) =>
    `<button type="button" role="tab" class="${value === active ? 'is-active' : ''}" aria-selected="${value === active}" data-action="${action}" data-value="${esc(value)}">${esc(label)}${count != null ? `<span class="seg-count">${count}</span>` : ''}</button>`).join('')}</div>`;
}

export const CATEGORY_TABS = [['all', '全部'], ['expression', '表达积累'], ['vocabulary', '词汇积累']];

export function masteryPill(value) {
  return `<span class="mastery is-${masteryTone(value)}" title="掌握度">${value == null ? '—' : `${value}%`}</span>`;
}

export function categoryBadge(category) {
  return `<span class="cat-badge is-${category}">${categoryLabel(category)}</span>`;
}

export function emptyState(title, text = '', action = '') {
  return `<div class="empty-state"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

/** Full information block for an expression (study detail + detail page). */
export function expressionInfo(expression, { large = false } = {}) {
  const rows = [
    ['例句', expression.example, 'is-example'],
    ['拓展 / 写作位置', expression.writingPosition, ''],
    ['备注与易错点', expression.notes, ''],
  ].filter(([, value]) => value);
  return `<div class="info ${large ? 'is-large' : ''}">
    <div class="info-english">${esc(expression.english)}</div>
    ${expression.phonetic ? `<div class="info-phonetic">${esc(expression.phonetic)}</div>` : ''}
    <div class="info-chinese">${esc(expression.chinese) || '<span class="muted">（暂无中文释义）</span>'}</div>
    ${rows.length ? `<dl class="info-rows">${rows.map(([label, value, cls]) => `<div class="info-row ${cls}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
  </div>`;
}

/** The learner's answer with wrong letters marked; correct answers stay calm green. */
export function answerReview(answer, expected, correct) {
  const shown = String(answer ?? '').trim();
  const mine = !shown ? '<span class="muted">（未填写）</span>'
    : correct ? `<span class="ans-ok">${esc(shown)}</span>`
    : diffAnswer(shown, expected).segments.map(seg => (seg.kind === 'wrong' ? `<mark class="ans-wrong">${esc(seg.text)}</mark>` : esc(seg.text))).join('');
  return `<div class="answer-review ${correct ? 'is-correct' : 'is-wrong'}">
    <div class="answer-line"><span class="answer-label">你的答案</span><span class="answer-text">${mine}</span></div>
    ${correct ? '' : `<div class="answer-line"><span class="answer-label">正确答案</span><span class="answer-text is-expected">${esc(expected)}</span></div>`}
  </div>`;
}

export function writingBox(id, value = '', placeholder = '写出英文表达（键盘或 Apple Pencil 手写）') {
  return `<textarea id="${id}" class="writing-box" rows="2" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" inputmode="text" enterkeyhint="done" placeholder="${esc(placeholder)}" data-input="draft">${esc(value)}</textarea>`;
}

export function wordRow(expression, { href, mastery = undefined, extra = '', cls = '' } = {}) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="word-row ${cls}" ${href ? `href="${esc(href)}"` : ''}>
    <span class="word-main"><span class="word-en">${esc(expression.english)}</span><span class="word-zh">${esc(expression.chinese)}</span></span>
    ${extra}${mastery !== undefined ? masteryPill(mastery) : ''}
  </${tag}>`;
}

export function progressBar(done, total) {
  const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  return `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
}
