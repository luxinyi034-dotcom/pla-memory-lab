import { esc, icon } from '../ui/dom.js';
import { todayKey, dayLabel } from '../core/time.js';
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
        <span class="fold-title">${esc(group.name)}</span>
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

    const head = pageHead({
      eyebrow: 'TODAY',
      title: '今日学习',
      sub: `${dayLabel(s.today)} <span class="sep">·</span> 每天凌晨 2:00 切换学习日`,
      actions: `<a class="checkin-chip ${checked ? 'is-done' : ''}" href="#/checkin">
          <span class="checkin-chip-icon">${checked ? icon('check') : icon('flame')}</span>
          <span><strong>${checked ? '今日已打卡' : '今日未打卡'}</strong><small>连续 ${streakDays} 天 · 累计 ${state.checkins.length} 天</small></span>
        </a>`,
    });

    const stats = `<section class="stat-row">
      <div class="stat is-primary">
        <div class="stat-label">今日进度</div>
        <div class="stat-value">${s.done}<span class="stat-total"> / ${s.total}</span></div>
        ${progressBar(s.done, s.total)}
        <div class="stat-foot">新学 ${s.newDone.length} · 复习 ${s.reviewDone.length}${s.reviewPending.length ? ` · 待复习 ${s.reviewPending.length}` : ''}</div>
      </div>
      <div class="stat">
        <div class="stat-label">预计用时</div>
        <div class="stat-value">${s.minutes ? `约 ${s.minutes}` : '0'}<span class="stat-total"> 分钟</span></div>
        <div class="stat-foot">${s.minutes ? '按新学 1.2 分钟/条、复习 0.6 分钟/条估算' : '今天的任务都完成了'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">打卡</div>
        <div class="stat-value">${streakDays}<span class="stat-total"> 天连续</span></div>
        <div class="stat-foot">${checked ? '完成今日新学，已自动打卡' : '完成今日新学即自动打卡'}</div>
      </div>
    </section>`;

    const newCard = `<article class="task-card">
      <div class="task-card-top"><span class="task-kicker">${icon('layers')} 新学</span>${categoryBadgeLite(category)}</div>
      ${newRunning
        ? `<h3>继续今日新学</h3><p>${resumable.queue.length} 组 · 已默写 ${flowTotals(resumable).done} / ${flowTotals(resumable).total} 条，退出时的位置已保存。</p>
           <div class="task-actions"><a class="btn btn-primary" href="#/study">继续学习 ${icon('chevron')}</a><a class="btn btn-ghost" href="#/new">重新选择</a></div>`
        : s.newDone.length
          ? `<h3>今日新学已完成</h3><p>已学 ${s.newDone.length} 条。还想多学可以再选一组。</p>
             <div class="task-actions"><a class="btn" href="#/new">再学一组</a></div>`
          : `<h3>约 ${s.newPlanned} 条 · ${categoryLabel(category)}</h3><p>按最早导入顺序推荐完整分组，目标 ${state.settings.newTarget ?? 20} 条，可调整。</p>
             <div class="task-actions"><a class="btn btn-primary" href="#/new">选择今日新学 ${icon('chevron')}</a></div>`}
    </article>`;

    const reviewCount = s.reviewPending.length;
    const reviewCard = `<article class="task-card">
      <div class="task-card-top"><span class="task-kicker">${icon('clock')} 到期复习</span><span class="task-note">1 · 2 · 4 · 7 · 15 · 30 天</span></div>
      ${reviewRunning
        ? `<h3>继续今日复习</h3><p>已默写 ${flowTotals(resumable).done} / ${flowTotals(resumable).total} 条，退出时的位置已保存。</p>
           <div class="task-actions"><a class="btn btn-primary" href="#/study">继续复习 ${icon('chevron')}</a></div>`
        : reviewCount
          ? `<h3>${reviewCount} 条到期 · ${due.length} 组</h3><p>按最早学习时间排列，整组完成后才算该组复习完成。</p>
             <div class="task-actions"><a class="btn btn-primary" href="#/review">开始复习 ${icon('chevron')}</a></div>`
          : `<h3>${s.reviewDone.length ? '今日复习已完成' : '今天没有到期复习'}</h3><p>${s.reviewDone.length ? `已复习 ${s.reviewDone.length} 条。` : '新学内容会在第 1 天开始进入复习。'}</p>
             <div class="task-actions"><a class="btn" href="#/quick">快速刷词</a></div>`}
    </article>`;

    const mistakes = (state.dailyMistakes[s.today] ?? []).filter(item => item?.expressionID && ix.exprById.has(item.expressionID));
    const tabs = segmented([['list', '今日词表'], ['wrong', '今日错词', mistakes.length]], ui.tab, 'today-tab');
    let body;
    if (ui.tab === 'wrong') {
      const sourceOf = new Map(mistakes.map(item => [item.expressionID, item.source]));
      const items = mistakes.map(item => ix.exprById.get(item.expressionID));
      body = items.length
        ? `<p class="hint">今日新学和今日复习中第一次默写没有写对的内容（不进入错词本）。</p>${wordGroupList(ix, items, 'wrong', ui, { status: item => `<span class="tag">${sourceOf.get(item.id) === 'review' ? '复习' : '新学'}</span>` })}`
        : emptyState('今天还没有默写错词', '保持下去。');
    } else {
      const reviewItems = [...s.reviewDone, ...s.reviewPending.filter(item => !s.reviewDone.includes(item))];
      const reviewedSet = new Set(s.reviewDone.map(item => item.id));
      body = `<div class="list-block">
          <div class="list-block-head"><h3>今日新学</h3><span>${s.newDone.length} 条</span></div>
          ${s.newDone.length ? wordGroupList(ix, s.newDone, 'new', ui) : '<p class="muted small">今天还没有新学记录。</p>'}
        </div>
        <div class="list-block">
          <div class="list-block-head"><h3>今日复习</h3><span>${s.reviewDone.length} / ${reviewItems.length} 条</span></div>
          ${reviewItems.length ? wordGroupList(ix, reviewItems, 'review', ui, { status: item => (reviewedSet.has(item.id) ? '<span class="tag is-ok">已复习</span>' : '<span class="tag is-due">待复习</span>') }) : '<p class="muted small">今天没有复习任务。</p>'}
        </div>`;
    }

    return `<div class="page page-today">
      ${head}
      ${resumable ? `<a class="resume-banner" href="#/study"><span>${icon('play')}</span><span><strong>继续上次${resumable.type === 'new' ? '新学' : '复习'}${resumable.repeat ? '（再次巩固）' : ''}</strong><small>第 ${resumable.gi + 1} / ${resumable.queue.length} 组 · 已默写 ${flowTotals(resumable).done} 条</small></span>${icon('chevron')}</a>` : ''}
      ${stats}
      <section class="task-grid">${newCard}${reviewCard}</section>
      <section class="panel">
        <div class="panel-head">${tabs}
          <div class="panel-tools"><button type="button" class="btn btn-small btn-ghost" data-action="fold-all" data-value="open">全部展开</button><button type="button" class="btn btn-small btn-ghost" data-action="fold-all" data-value="close">全部收起</button></div>
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

function categoryBadgeLite(category) {
  return `<span class="cat-badge is-${category}">${categoryLabel(category)}</span>`;
}
