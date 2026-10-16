// #/plan — mastery & review plan by group or by word.
import { esc, icon, toast } from '../ui/dom.js';
import { todayKey, shortDayLabel } from '../core/time.js';
import {
  groupsByLearnedOrder, groupMastery, groupNodeStatus, groupNextReview, compareLearned, masteryOf,
  passesMasteryFilter, isLearned, categoryLabel, dueExpressions,
} from '../core/selectors.js';
import { REVIEW_INTERVALS, NODE_LABELS, nodeStatus, nodeDueDay } from '../core/srs.js';
import { createFlow } from '../core/study.js';
import { pageHead, segmented, CATEGORY_TABS, masteryPill, categoryBadge, emptyState } from './common.js';

const FILTERS = ['all', 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const filterSelect = (value, change) => `<select class="input input-small" data-change="${change}" aria-label="掌握度筛选">${FILTERS.map(option => `<option value="${option}" ${String(value) === String(option) ? 'selected' : ''}>${option === 'all' ? '全部掌握度' : `低于 ${option}%`}</option>`).join('')}</select>`;

function nodeCell(ix, group, node, today) {
  const status = groupNodeStatus(ix, group.id, node, today);
  const items = ix.exprsByGroup.get(group.id) ?? [];
  const dates = items.map(item => nodeDueDay(ix.progressById.get(item.id), node)).filter(Boolean).sort();
  const label = { done: '完成', today: '今日', overdue: '逾期', locked: '—' }[status] ?? (dates[0] ? shortDayLabel(dates[0]) : '未到');
  const clickable = status === 'today' || status === 'overdue';
  return `<td class="node-cell">${clickable
    ? `<button type="button" class="node-chip is-${status}" data-action="start-node" data-id="${group.id}" data-node="${node}" title="点击开始复习本组">${label}</button>`
    : `<span class="node-chip is-${status}">${status === 'done' ? icon('check') : ''}${label}</span>`}</td>`;
}

export const planView = {
  area: 'plan',
  title: '掌握与计划',
  initialUI: { mode: 'groups', category: 'all', groupFilter: 'all', wordFilter: 'all', open: [], highlight: null },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const today = todayKey();
    const inCategory = group => ui.category === 'all' || group.category === ui.category;
    const groups = groupsByLearnedOrder(ix, state.groups.filter(inCategory));
    const allItems = state.expressions.filter(item => inCategory(ix.groupById.get(item.groupID) ?? {}));
    const learnedItems = allItems.filter(item => isLearned(ix, item.id));
    const masteries = learnedItems.map(item => masteryOf(ix, item.id)).filter(value => value != null);
    const avg = masteries.length ? Math.round(masteries.reduce((a, b) => a + b, 0) / masteries.length) : null;
    const due = dueExpressions(ix, today).filter(item => inCategory(ix.groupById.get(item.groupID) ?? {})).length;
    const finished = learnedItems.filter(item => (ix.progressById.get(item.id)?.intervalIndex ?? 0) >= REVIEW_INTERVALS.length).length;

    const summary = `<section class="stat-row is-compact">
      <div class="stat"><div class="stat-label">已学</div><div class="stat-value">${learnedItems.length}<span class="stat-total"> / ${allItems.length}</span></div></div>
      <div class="stat"><div class="stat-label">平均掌握度</div><div class="stat-value">${avg == null ? '—' : `${avg}%`}</div></div>
      <div class="stat"><div class="stat-label">今日到期</div><div class="stat-value">${due}<span class="stat-total"> 条</span></div></div>
      <div class="stat"><div class="stat-label">六个节点全部完成</div><div class="stat-value">${finished}<span class="stat-total"> 条</span></div></div>
    </section>`;

    const tools = `<div class="lib-toolbar">
      ${segmented([['groups', '按分组查看'], ['words', '按单词筛选']], ui.mode, 'set-mode')}
      ${segmented(CATEGORY_TABS, ui.category, 'set-category')}
      <label class="inline-label">${ui.mode === 'groups' ? '分组掌握度' : '单词掌握度'}${filterSelect(ui.mode === 'groups' ? ui.groupFilter : ui.wordFilter, ui.mode === 'groups' ? 'group-filter' : 'word-filter')}</label>
      <span class="toolbar-gap"></span>
      ${ui.mode === 'groups' ? `<button type="button" class="btn btn-small btn-ghost" data-action="fold-all">${ui.open.length ? `${icon('collapse')} 全部收起` : `${icon('expand')} 全部展开`}</button>` : ''}
    </div>`;

    let body;
    if (ui.mode === 'groups') {
      const rows = groups.filter(group => passesMasteryFilter(groupMastery(ix, group.id), ui.groupFilter)).map(group => {
        const items = [...(ix.exprsByGroup.get(group.id) ?? [])].sort(compareLearned(ix));
        const learned = items.filter(item => isLearned(ix, item.id)).length;
        const open = ui.open.includes(group.id);
        const next = groupNextReview(ix, group.id, today);
        return `<tbody class="plan-group ${open ? 'is-open' : ''} ${ui.highlight === group.id ? 'is-highlight' : ''}" id="plan-${group.id}">
          <tr class="plan-row">
            <th scope="row"><button type="button" class="plan-title" data-action="toggle" data-id="${group.id}" aria-expanded="${open}">
              <span class="chev">${icon('chevron')}</span>
              <span><strong>${esc(group.name)}</strong><small>${categoryBadge(group.category)} ${items.length} 条 · 已学 ${learned}</small></span>
            </button></th>
            <td class="center">${masteryPill(groupMastery(ix, group.id))}</td>
            ${REVIEW_INTERVALS.map((_, node) => nodeCell(ix, group, node, today)).join('')}
            <td class="center"><span class="next-review tone-${next.tone}">${next.label}</span>${next.sub ? `<small class="next-sub">${next.sub}</small>` : ''}</td>
          </tr>
          ${open ? `<tr class="plan-detail"><td colspan="${REVIEW_INTERVALS.length + 3}"><div class="plan-words">${items.map(item => `<a class="mini-row" href="#/detail/${item.id}?from=${encodeURIComponent('#/plan')}"><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span>${masteryPill(masteryOf(ix, item.id))}</a>`).join('')}</div></td></tr>` : ''}
        </tbody>`;
      }).join('');
      body = rows ? `<div class="table-wrap"><table class="plan-table">
          <thead><tr><th scope="col">分组 / 内容</th><th scope="col">掌握度</th>${NODE_LABELS.map(label => `<th scope="col">${label}</th>`).join('')}<th scope="col">下一复习</th></tr></thead>
          ${rows}
        </table></div>` : emptyState('当前筛选下没有分组');
    } else {
      const words = allItems.filter(item => passesMasteryFilter(masteryOf(ix, item.id), ui.wordFilter)).sort(compareLearned(ix));
      body = words.length ? `<div class="word-table">
          <div class="word-table-head"><span>单词</span><span>中文</span><span class="center">掌握度</span><span class="center">所属分组</span></div>
          ${words.map(item => {
            const group = ix.groupById.get(item.groupID);
            return `<div class="word-table-row">
              <a class="wt-en" href="#/detail/${item.id}?from=${encodeURIComponent('#/plan')}">${esc(item.english)}</a>
              <span class="wt-zh">${esc(item.chinese)}</span>
              <span class="center">${masteryPill(masteryOf(ix, item.id))}</span>
              <span class="center"><button type="button" class="group-tag" data-action="jump" data-id="${group.id}">${esc(group.name)} ${icon('chevron')}</button></span>
            </div>`;
          }).join('')}</div>` : emptyState('当前筛选下没有单词');
    }

    return `<div class="page page-plan">
      ${pageHead({ eyebrow: 'MASTERY & PLAN', title: '掌握与计划', sub: '掌握度 = 每次计分默写中写对的比例。复习节点按组显示，组内全部完成才算完成。' })}
      ${summary}${tools}
      <div class="fade-in" data-fade="${ui.mode}-${ui.category}">${body}</div>
    </div>`;
  },
  mount(root, ctx) {
    if (ctx.ui.highlight) {
      const node = root.querySelector(`#plan-${CSS.escape(ctx.ui.highlight)}`);
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const id = ctx.ui.highlight;
      setTimeout(() => { if (ctx.ui.highlight === id) { ctx.ui.highlight = null; node?.classList.remove('is-highlight'); } }, 1800);
    }
  },
  changes: {
    'group-filter': (el, ctx) => { ctx.ui.groupFilter = el.value; ctx.rerender(); },
    'word-filter': (el, ctx) => { ctx.ui.wordFilter = el.value; ctx.rerender(); },
  },
  actions: {
    'set-mode': (el, ctx) => { ctx.ui.mode = el.dataset.value; ctx.rerender(); },
    'set-category': (el, ctx) => { ctx.ui.category = el.dataset.value; ctx.rerender(); },
    toggle: (el, ctx) => {
      const id = el.dataset.id;
      ctx.ui.open = ctx.ui.open.includes(id) ? ctx.ui.open.filter(item => item !== id) : [...ctx.ui.open, id];
      ctx.rerender();
    },
    'fold-all': (el, ctx) => {
      ctx.ui.open = ctx.ui.open.length ? [] : [...document.querySelectorAll('.plan-title')].map(node => node.dataset.id);
      ctx.rerender();
    },
    jump: (el, ctx) => {
      const id = el.dataset.id;
      Object.assign(ctx.ui, { mode: 'groups', groupFilter: 'all', highlight: id, open: [...new Set([...ctx.ui.open, id])] });
      const group = ctx.ix.groupById.get(id);
      if (ctx.ui.category !== 'all' && group.category !== ctx.ui.category) ctx.ui.category = 'all';
      ctx.rerender();
    },
    'start-node': (el, ctx) => {
      const { ix } = ctx;
      const today = todayKey();
      const node = Number(el.dataset.node);
      const items = [...(ix.exprsByGroup.get(el.dataset.id) ?? [])].sort(compareLearned(ix))
        .filter(item => ['today', 'overdue'].includes(nodeStatus(ix.progressById.get(item.id), node, today)));
      if (!items.length) { toast('这个节点没有需要复习的内容'); return; }
      ctx.commit(state => { state.sessions = [createFlow('review', [{ groupID: el.dataset.id, itemIDs: items.map(item => item.id) }])]; });
      ctx.go('#/study');
    },
  },
};

export { categoryLabel };
