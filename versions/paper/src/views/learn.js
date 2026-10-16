// New-learning selection (#/new) and review preview (#/review).
import { esc, icon, toast } from '../ui/dom.js';
import { todayKey, formatDateTime } from '../core/time.js';
import { newLearningGroups, recommendGroups, dailyCategory, dueGroups, categoryLabel, masteryOf } from '../core/selectors.js';
import { createFlow, isResumable, flowTotals } from '../core/study.js';
import { pageHead, segmented, masteryPill, emptyState } from './common.js';

const TARGETS = ['20', '40', '60', '100', 'custom'];

function currentTarget(state, ui) {
  const mode = ui.targetMode ?? state.settings.newTargetMode ?? String(state.settings.newTarget ?? 20);
  if (mode === 'custom') return Math.max(1, Number(ui.customTarget ?? state.settings.newTarget ?? 20) || 20);
  return Number(mode);
}

function startStudy(ctx, flow) {
  ctx.commit(state => { state.sessions = [flow]; });
  ctx.go('#/study');
}

export const newView = {
  area: 'today',
  title: '新学内容',
  initialUI: { category: null, targetMode: null, customTarget: null, selected: null, mode: 'select', open: [] },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const today = todayKey();
    ui.category ??= dailyCategory(state, today);
    ui.targetMode ??= state.settings.newTargetMode ?? String(state.settings.newTarget ?? 20);
    const target = currentTarget(state, ui);
    const entries = newLearningGroups(ix, ui.category);
    const recommended = recommendGroups(entries, target).map(entry => entry.group.id);
    const selected = new Set(ui.selected ?? recommended);
    const chosen = entries.filter(entry => selected.has(entry.group.id));
    const selectedCount = chosen.reduce((sum, entry) => sum + entry.taskCount, 0);
    const recommendedCount = entries.filter(entry => recommended.includes(entry.group.id)).reduce((sum, entry) => sum + entry.taskCount, 0);
    const session = state.sessions[0];
    const running = isResumable(state, session) && session.type === 'new' ? session : null;
    const otherCategory = ui.category === 'expression' ? 'vocabulary' : 'expression';

    const controls = `<div class="control-bar">
      <div class="control"><span class="control-label">类别</span>${segmented([['expression', '表达积累'], ['vocabulary', '词汇积累']], ui.category, 'set-category')}</div>
      <div class="control"><span class="control-label">今日目标</span>
        <div class="chips">${TARGETS.map(value => `<button type="button" class="chip ${ui.targetMode === value ? 'is-active' : ''}" data-action="set-target" data-value="${value}">${value === 'custom' ? '自定义' : `${value} 条`}</button>`).join('')}
        ${ui.targetMode === 'custom' ? `<input class="input input-small" type="number" min="1" max="500" inputmode="numeric" value="${esc(ui.customTarget ?? target)}" data-change="custom-target" aria-label="自定义数量" />` : ''}</div>
      </div>
    </div>`;

    const tools = `<div class="selection-bar">
      <span class="selection-summary">已选 <strong>${chosen.length}</strong> 组 · <strong>${selectedCount}</strong> 条 <span class="muted">（推荐 ${recommended.length} 组 · ${recommendedCount} 条，完整分组不拆分）</span></span>
      <span class="selection-tools">
        <button type="button" class="btn btn-small btn-ghost" data-action="recommend">恢复推荐</button>
        <button type="button" class="btn btn-small btn-ghost" data-action="select-all">全部选择</button>
        <button type="button" class="btn btn-small btn-ghost" data-action="clear" ${selected.size ? '' : 'disabled'}>一键取消</button>
      </span>
    </div>`;

    let list;
    if (!entries.length) {
      list = emptyState(`${categoryLabel(ui.category)}已经全部学完`, `可以切换到${categoryLabel(otherCategory)}，或在表达库导入新内容。`, `<button type="button" class="btn" data-action="set-category" data-value="${otherCategory}">切换到${categoryLabel(otherCategory)}</button>`);
    } else if (ui.mode === 'preview') {
      list = chosen.length ? `<div class="preview-list">${chosen.map(entry => `<section class="preview-group">
          <div class="preview-head"><h3>${esc(entry.group.name)}</h3><span>${entry.taskCount} 条</span></div>
          <ol class="preview-words">${entry.unlearned.map(item => `<li><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span></li>`).join('')}</ol>
        </section>`).join('')}</div>` : emptyState('还没有选择分组');
    } else {
      list = `<div class="pick-list">${entries.map(entry => {
        const on = selected.has(entry.group.id);
        const open = ui.open.includes(entry.group.id);
        const partial = entry.taskCount < entry.items.length;
        return `<div class="pick ${on ? 'is-on' : ''} ${open ? 'is-open' : ''}">
          <button type="button" class="pick-main" data-action="toggle-group" data-id="${entry.group.id}" aria-pressed="${on}">
            <span class="checkbox">${on ? icon('check') : ''}</span>
            <span class="pick-text"><strong>${esc(entry.group.name)}</strong><small>${entry.taskCount} 条${partial ? `（共 ${entry.items.length} 条，${entry.items.length - entry.taskCount} 条已学）` : ''} · 导入于 ${formatDateTime(entry.group.createdAt)}</small></span>
            ${recommended.includes(entry.group.id) ? '<span class="tag is-soft">推荐</span>' : ''}
          </button>
          <button type="button" class="icon-btn pick-peek" data-action="peek" data-id="${entry.group.id}" aria-label="查看本组单词" aria-expanded="${open}">${icon('chevron')}</button>
          ${open ? `<ol class="pick-words">${entry.unlearned.map(item => `<li><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span></li>`).join('')}</ol>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    return `<div class="page page-new">
      ${pageHead({
        eyebrow: 'NEW LEARNING', title: '新学内容', backHref: '#/today', backLabel: '今日学习',
        sub: `今日推荐类别按日期交替：今天是<strong>${categoryLabel(dailyCategory(state, today))}</strong>。`,
        actions: `<button type="button" class="btn btn-primary btn-large" data-action="start" ${selectedCount ? '' : 'disabled'}>开始学习 · ${selectedCount} 条 ${icon('chevron')}</button>`,
      })}
      ${running ? `<a class="resume-banner" href="#/study"><span>${icon('play')}</span><span><strong>有未完成的新学</strong><small>已默写 ${flowTotals(running).done} / ${flowTotals(running).total} 条，点此继续；重新开始会替换它。</small></span>${icon('chevron')}</a>` : ''}
      ${controls}
      ${entries.length ? `<div class="list-toolbar">${segmented([['select', '选择分组'], ['preview', `预览所选（${selectedCount}）`]], ui.mode, 'set-mode')}${tools}</div>` : ''}
      ${list}
    </div>`;
  },
  actions: {
    'set-category': (el, ctx) => {
      ctx.ui.category = el.dataset.value; ctx.ui.selected = null; ctx.ui.open = [];
      ctx.commit(state => { state.categoryRotation = { date: todayKey(), category: el.dataset.value }; });
    },
    'set-target': (el, ctx) => {
      ctx.ui.targetMode = el.dataset.value; ctx.ui.selected = null;
      const target = currentTarget(ctx.state, ctx.ui);
      ctx.commit(state => { state.settings.newTargetMode = el.dataset.value; state.settings.newTarget = target; });
    },
    'set-mode': (el, ctx) => { ctx.ui.mode = el.dataset.value; ctx.rerender(); },
    'toggle-group': (el, ctx) => {
      const entries = newLearningGroups(ctx.ix, ctx.ui.category);
      const current = new Set(ctx.ui.selected ?? recommendGroups(entries, currentTarget(ctx.state, ctx.ui)).map(entry => entry.group.id));
      if (current.has(el.dataset.id)) current.delete(el.dataset.id); else current.add(el.dataset.id);
      ctx.ui.selected = [...current]; ctx.rerender();
    },
    peek: (el, ctx) => {
      const id = el.dataset.id;
      ctx.ui.open = ctx.ui.open.includes(id) ? ctx.ui.open.filter(item => item !== id) : [...ctx.ui.open, id];
      ctx.rerender();
    },
    recommend: (el, ctx) => { ctx.ui.selected = null; ctx.rerender(); },
    'select-all': (el, ctx) => { ctx.ui.selected = newLearningGroups(ctx.ix, ctx.ui.category).map(entry => entry.group.id); ctx.rerender(); },
    clear: (el, ctx) => { ctx.ui.selected = []; ctx.rerender(); },
    start: (el, ctx) => {
      const { state, ix, ui } = ctx;
      const entries = newLearningGroups(ix, ui.category);
      const selected = new Set(ui.selected ?? recommendGroups(entries, currentTarget(state, ui)).map(entry => entry.group.id));
      const groups = entries.filter(entry => selected.has(entry.group.id)).map(entry => ({ groupID: entry.group.id, itemIDs: entry.unlearned.map(item => item.id) }));
      if (!groups.length) { toast('请先选择分组'); return; }
      ctx.ui.selected = null; ctx.ui.mode = 'select';
      // Remember today's category so tomorrow alternates from it.
      ctx.commit(s => { s.categoryRotation = { date: todayKey(), category: ui.category }; }, { silent: true });
      startStudy(ctx, createFlow('new', groups));
    },
  },
  changes: {
    'custom-target': (el, ctx) => {
      const value = Math.max(1, Math.min(500, Number(el.value) || 20));
      ctx.ui.customTarget = value; ctx.ui.selected = null;
      ctx.commit(state => { state.settings.newTarget = value; state.settings.newTargetMode = 'custom'; });
    },
  },
};

export const reviewView = {
  area: 'today',
  title: '到期复习',
  initialUI: { open: [] },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const today = todayKey();
    const groups = dueGroups(ix, today);
    const total = groups.reduce((sum, entry) => sum + entry.items.length, 0);
    const session = state.sessions[0];
    const running = isResumable(state, session) && session.type === 'review' ? session : null;
    const last = state.lastStudyRound;
    const canRepeat = last?.type === 'review' && last.day === today;
    const reviewMistakes = (state.dailyMistakes[today] ?? []).filter(item => item?.source === 'review').length;
    return `<div class="page page-review">
      ${pageHead({
        eyebrow: 'DUE REVIEW', title: '到期复习', backHref: '#/today', backLabel: '今日学习',
        sub: groups.length ? `${groups.length} 组 · ${total} 条，按最早学习时间排列。每条先认读，再整组默写。` : '今天没有到期的复习。',
        actions: running ? `<a class="btn btn-primary btn-large" href="#/study">继续复习 ${icon('chevron')}</a>`
          : groups.length ? `<button type="button" class="btn btn-primary btn-large" data-action="start-review">开始今日复习 · ${total} 条 ${icon('chevron')}</button>` : '',
      })}
      ${reviewMistakes ? `<a class="inline-note" href="#/today" data-action="goto-mistakes">今日复习第一次默写错了 ${reviewMistakes} 条 · 查看今日错词 ${icon('chevron')}</a>` : ''}
      ${!groups.length && canRepeat ? `<div class="panel center"><p>今天的复习已经完成。想再巩固一遍吗？本轮不计入掌握度和复习节点。</p><button type="button" class="btn btn-primary" data-action="repeat-last">再次巩固上一轮</button></div>` : ''}
      ${groups.length ? `<div class="fold-list">${groups.map(({ group, items }) => {
        const open = ui.open.includes(group.id);
        return `<section class="fold ${open ? 'is-open' : ''}">
          <button type="button" class="fold-head" data-action="toggle" data-id="${group.id}" aria-expanded="${open}">
            <span class="chev">${icon('chevron')}</span><span class="fold-title">${esc(group.name)}</span>
            <span class="fold-meta">${items.length} 条</span>
          </button>
          ${open ? `<div class="fold-body">${items.map(item => `<div class="mini-row"><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span>${masteryPill(masteryOf(ix, item.id))}</div>`).join('')}</div>` : ''}
        </section>`;
      }).join('')}</div>` : (!canRepeat ? emptyState('今天没有到期复习', '新学的内容会在第 1、2、4、7、15、30 天进入复习。', '<a class="btn" href="#/quick">去快速刷词</a>') : '')}
    </div>`;
  },
  actions: {
    toggle: (el, ctx) => {
      const id = el.dataset.id;
      ctx.ui.open = ctx.ui.open.includes(id) ? ctx.ui.open.filter(item => item !== id) : [...ctx.ui.open, id];
      ctx.rerender();
    },
    'start-review': (el, ctx) => {
      const groups = dueGroups(ctx.ix, todayKey()).map(({ group, items }) => ({ groupID: group.id, itemIDs: items.map(item => item.id) }));
      if (!groups.length) { toast('今天没有到期复习'); return; }
      startStudy(ctx, createFlow('review', groups));
    },
    'repeat-last': (el, ctx) => {
      const last = ctx.state.lastStudyRound;
      if (!last?.queue?.length) return;
      const ids = new Set(ctx.state.expressions.map(item => item.id));
      const groups = last.queue.map(entry => ({ groupID: entry.groupID, itemIDs: entry.itemIDs.filter(id => ids.has(id)) }));
      startStudy(ctx, createFlow('review', groups, { repeat: true }));
    },
    'goto-mistakes': (el, ctx) => {
      ctx.uiFor('today').tab = 'wrong';
      ctx.go('#/today');
    },
  },
};

export { startStudy };
