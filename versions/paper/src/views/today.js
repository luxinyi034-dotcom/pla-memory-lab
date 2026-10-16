import { esc, icon } from '../ui/dom.js';
import { todayKey, addDaysKey, nowMs } from '../core/time.js';
import {
  buildIndex, todayNewItems, todayReviewedItems, dueExpressions, dueGroups, sectionByGroup, masteryOf,
  streak, newLearningGroups, recommendGroups, dailyCategory, categoryLabel,
} from '../core/selectors.js';
import { isResumable, flowTotals } from '../core/study.js';
import { pageHead, segmented, masteryPill, progressBar, emptyState } from './common.js';

export function todayStats(state, ix) {
  const today = todayKey();
  const newDone = todayNewItems(ix, today);
  const reviewDone = todayReviewedItems(ix, today);
  const reviewPending = dueExpressions(ix, today);
  const session = state.sessions[0];
  let newPlanned = 0;
  if (isResumable(state, session) && session.type === 'new' && !session.repeat) {
    const { total } = flowTotals(session);
    newPlanned = Math.max(0, total - session.queue.flatMap(entry => entry.itemIDs).filter(id => newDone.some(item => item.id === id)).length);
  } else if (!newDone.length) {
    const category = dailyCategory(state, today);
    newPlanned = recommendGroups(newLearningGroups(ix, category), state.settings.newTarget ?? 20).reduce((sum, entry) => sum + entry.taskCount, 0);
  }
  const done = newDone.length + reviewDone.length;
  const total = done + newPlanned + reviewPending.length;
  const minutes = Math.ceil(newPlanned * 1.2 + reviewPending.length * 0.6);
  return { today, newDone, reviewDone, reviewPending, newPlanned, done, total, minutes };
}

function wordGroupList(ix, items, sectionKey, ui, { status } = {}) {
  const sections = sectionByGroup(ix, items);
  if (!sections.length) return '';
  return `<div class="fold-list">${sections.map(({ group, items: groupItems }) => {
    const key = `${sectionKey}:${group.id}`;
    const open = ui.open.includes(key);
    return `<section class="fold ${open ? 'is-open' : ''}">
      <button type="button" class="fold-head" data-action="toggle-fold" data-key="${esc(key)}" aria-expanded="${open}">
        <span class="chev">${icon('chevron')}</span>
        <span class="cat-dot is-${group.category}" title="${categoryLabel(group.category)}"></span><span class="fold-title">${esc(group.name)}</span>
        <span class="fold-meta">${groupItems.length} 条</span>
      </button>
      ${open ? `<div class="fold-body">${groupItems.map(item => `<a class="mini-row" href="#/detail/${item.id}?from=${encodeURIComponent('#/today')}">
          <span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span>
          ${status ? status(item) : ''}${masteryPill(masteryOf(ix, item.id))}</a>`).join('')}</div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

export const todayView = {
  area: 'today',
  title: '今日学习',
  initialUI: { tab: 'list', open: [] },
  render(ctx) {
    const { state, ui } = ctx;
    const ix = ctx.ix ?? buildIndex(state);
    const s = todayStats(state, ix);
    const checked = state.checkins.includes(s.today);
    const streakDays = streak(state.checkins, s.today);
    const session = state.sessions[0];
    const resumable = isResumable(state, session) ? session : null;
    const category = dailyCategory(state, s.today);
    const due = dueGroups(ix, s.today);
    const newRunning = resumable?.type === 'new';
    const reviewRunning = resumable?.type === 'review';
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    const arrow = '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

    const R = 46; const C = 2 * Math.PI * R;
    const week = Array.from({ length: 7 }, (_, i) => addDaysKey(s.today, i - 6));
    const head = `<header class="today-hero">
      <div class="hero-text">
        <div class="eyebrow">${englishDate(s.today)}</div>
        <h1>今日学习</h1>
        <p class="hero-greet">${greeting()}，${s.total - s.done > 0 ? `今天还有 <b>${s.total - s.done}</b> 条在等你` : '今天的任务都完成了'}${s.minutes ? `，大约 ${s.minutes} 分钟。` : '。'}</p>
        <a href="#/checkin" class="week-strip" aria-label="最近 7 天打卡">
          ${week.map(day => `<span class="wk ${state.checkins.includes(day) ? 'is-on' : ''} ${day === s.today ? 'is-today' : ''}"><i></i><small>${'日一二三四五六'[new Date(`${day}T12:00:00Z`).getUTCDay()]}</small></span>`).join('')}
          <span class="wk-note">${checked ? '今日已打卡' : '完成新学自动打卡'}<b>连续 ${streakDays} 天</b></span>
        </a>
      </div>
      <div class="hero-ring" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" class="ring-track"/><circle cx="60" cy="60" r="${R}" class="ring-fill" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 60 60)"/></svg>
        <div class="ring-center"><b>${pct}<small>%</small></b><span>${s.done} / ${s.total}</span></div>
      </div>
    </header>`;

    const resume = resumable ? `<a class="resume-line" href="#/study">
        <span class="resume-dot"></span>
        <span class="resume-text"><b>继续上次${resumable.type === 'new' ? '新学' : '复习'}${resumable.repeat ? '（再次巩固）' : ''}</b>第 ${resumable.gi + 1} / ${resumable.queue.length} 组 · 已默写 ${flowTotals(resumable).done} / ${flowTotals(resumable).total} 条，位置已保存</span>
        <span class="resume-go">继续 ${arrow}</span></a>` : '';

    const reviewCount = s.reviewPending.length;
    const reviewTask = `<article class="task is-review">
      <div class="task-label"><span>到期复习</span><span>${reviewRunning ? '进行中' : `${due.length} 组`}</span></div>
      <div class="task-num">${reviewRunning ? flowTotals(resumable).total - flowTotals(resumable).done : reviewCount || s.reviewDone.length}</div>
      <p class="task-sub">${reviewRunning ? '还剩这些没默写，退出时的位置已保存'
        : reviewCount ? '按最早学习时间排列，先认读，再整组默写'
        : s.reviewDone.length ? '今日复习已完成' : '今天没有到期复习，新学内容第 1 天开始复习'}</p>
      <div class="task-actions">${reviewRunning ? `<a class="btn btn-primary" href="#/study">继续复习 ${arrow}</a>`
        : reviewCount ? `<a class="btn btn-primary" href="#/review">开始复习 ${arrow}</a>`
        : '<a class="btn" href="#/quick">快速刷词</a>'}</div>
    </article>`;

    const newTask = `<article class="task is-new">
      <div class="task-label"><span>今日新学</span><span>${categoryLabel(category)}</span></div>
      <div class="task-num">${newRunning ? flowTotals(resumable).total : s.newDone.length || s.newPlanned}</div>
      <p class="task-sub">${newRunning ? `${resumable.queue.length} 组，已默写 ${flowTotals(resumable).done} 条`
        : s.newDone.length ? '今日新学已完成，已自动打卡' : `按最早导入顺序推荐完整分组 · 目标 ${state.settings.newTarget ?? 20} 条`}</p>
      <div class="task-actions">${newRunning ? `<a class="btn btn-primary" href="#/study">继续新学 ${arrow}</a><a class="text-link" href="#/new">重新选择</a>`
        : s.newDone.length ? '<a class="btn" href="#/new">再学一组</a>'
        : `<a class="btn ${reviewCount || reviewRunning ? '' : 'btn-primary'}" href="#/new">选择新学</a>`}</div>
    </article>`;

    const mistakes = (state.dailyMistakes[s.today] ?? []).filter(item => item?.expressionID && ix.exprById.has(item.expressionID));
    const tab = (value, label) => `<button type="button" class="text-tab ${ui.tab === value ? 'is-active' : ''}" data-action="today-tab" data-value="${value}">${label}</button>`;
    let body;
    if (ui.tab === 'wrong') {
      const sourceOf = new Map(mistakes.map(item => [item.expressionID, item.source]));
      const items = mistakes.map(item => ix.exprById.get(item.expressionID));
      body = items.length
        ? `<p class="hint">今日新学和今日复习中第一次默写没写对的内容。它们不会进入错词本。</p>${wordGroupList(ix, items, 'wrong', ui, { status: item => `<span class="row-note">${sourceOf.get(item.id) === 'review' ? '复习' : '新学'}</span>` })}`
        : emptyState('今天还没有默写错词', '保持下去。');
    } else {
      const reviewItems = [...s.reviewDone, ...s.reviewPending.filter(item => !s.reviewDone.includes(item))];
      const reviewedSet = new Set(s.reviewDone.map(item => item.id));
      body = `<div class="list-block">
          <div class="list-label"><span>今日新学</span><span>${s.newDone.length} 条</span></div>
          ${s.newDone.length ? wordGroupList(ix, s.newDone, 'new', ui) : '<p class="muted small list-empty">今天还没有新学记录。</p>'}
        </div>
        <div class="list-block">
          <div class="list-label"><span>今日复习</span><span>${s.reviewDone.length} / ${reviewItems.length} 条</span></div>
          ${reviewItems.length ? wordGroupList(ix, reviewItems, 'review', ui, { status: item => (reviewedSet.has(item.id) ? '<span class="row-note is-done">已复习</span>' : '<span class="row-note">待复习</span>') }) : '<p class="muted small list-empty">今天没有复习任务。</p>'}
        </div>`;
    }

    return `<div class="page page-today">
      ${head}
      ${resume}
      <section class="task-grid">${reviewTask}${newTask}</section>
      <section class="today-list">
        <div class="list-head"><h2>今日词表</h2>${tab('list', '全部')}${tab('wrong', `错词 ${mistakes.length}`)}
          <span class="spacer"></span>
          <button type="button" class="text-link" data-action="fold-all" data-value="${ui.open.length ? 'close' : 'open'}">${ui.open.length ? '全部收起' : '全部展开'}</button>
        </div>
        ${body}
      </section>
    </div>`;
  },
  actions: {
    'today-tab': (el, ctx) => { ctx.ui.tab = el.dataset.value; ctx.rerender(); },
    'toggle-fold': (el, ctx) => {
      const key = el.dataset.key;
      ctx.ui.open = ctx.ui.open.includes(key) ? ctx.ui.open.filter(item => item !== key) : [...ctx.ui.open, key];
      ctx.rerender();
    },
    'fold-all': (el, ctx) => {
      ctx.ui.open = el.dataset.value === 'open' ? [...document.querySelectorAll('[data-action="toggle-fold"]')].map(node => node.dataset.key) : [];
      ctx.rerender();
    },
  },
};

function greeting() {
  const hour = new Date(nowMs() + 8 * 3600 * 1000).getUTCHours();
  return hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
}

const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function englishDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS_EN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} · ${d} ${MONTHS_EN[m - 1]}`;
}
