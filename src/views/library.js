// #/library — groups in two aligned columns, search, Excel import, manage mode,
// double-tap rename and long-press drag reordering.
import { esc, icon, toast, modal, confirmDialog, promptDialog, openMenu, onTap } from '../ui/dom.js';
import { formatDateTime } from '../core/time.js';
import { searchExpressions, categoryLabel, masteryOf, isLearned } from '../core/selectors.js';
import { renameGroup, setGroupsCategory, deleteGroups, reorderGroups, deleteExpression, importRecords } from '../core/actions.js';
import { readSpreadsheet, rowsToRecords } from '../core/xlsx.js';
import { pageHead, segmented, CATEGORY_TABS, masteryPill, categoryBadge, emptyState } from './common.js';

function visibleGroups(state, ui) {
  let groups = state.groups.filter(group => ui.category === 'all' || group.category === ui.category);
  const byCreated = (a, b) => (Date.parse(a.createdAt ?? '') || 0) - (Date.parse(b.createdAt ?? '') || 0) || a.sortOrder - b.sortOrder;
  if (ui.sort === 'oldest') groups = groups.sort(byCreated);
  else if (ui.sort === 'newest') groups = groups.sort((a, b) => -byCreated(a, b));
  else groups = groups.sort((a, b) => a.sortOrder - b.sortOrder);
  return groups;
}

function groupCard(ctx, group, index) {
  const { ix, ui } = ctx;
  const items = ix.exprsByGroup.get(group.id) ?? [];
  const learned = items.filter(item => isLearned(ix, item.id)).length;
  const open = ui.open.includes(group.id);
  const selected = ui.selected.includes(group.id);
  return `<article class="group-card is-${group.category} ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''}" data-group-id="${group.id}" style="--learned:${items.length ? Math.round(learned / items.length * 100) : 0}%">
    <div class="group-head" data-drag-handle>
      ${ui.manage ? `<button type="button" class="checkbox-btn" data-action="select" data-id="${group.id}" aria-pressed="${selected}"><span class="checkbox">${selected ? icon('check') : ''}</span></button>` : ''}
      <button type="button" class="group-toggle" data-action="toggle" data-id="${group.id}" aria-expanded="${open}"><span class="chev">${icon('chevron')}</span></button>
      <div class="group-title">
        <div class="group-name" data-rename="${group.id}" title="双击改名">${esc(group.name)}</div>
        <div class="group-meta">${categoryBadge(group.category)}<span>${items.length} 条${learned ? ` · 已学 ${learned}` : ''}</span><span class="muted">${formatDateTime(group.createdAt)}</span></div>
      </div>
      <span class="group-index">${index + 1}</span>
      <button type="button" class="icon-btn" data-action="group-menu" data-id="${group.id}" aria-label="分组操作">${icon('more')}</button>
    </div>
    ${open ? `<ol class="group-items">${items.length ? items.map((item, i) => `<li class="item-row">
        <a class="item-main" href="#/detail/${item.id}?from=${encodeURIComponent('#/library')}">
          <span class="item-no">${i + 1}</span>
          <span class="item-text"><span class="item-en">${esc(item.english)}</span><span class="item-zh">${esc(item.chinese)}</span></span>
          ${masteryPill(masteryOf(ix, item.id))}
        </a>
        <span class="capsule"><button type="button" class="capsule-btn" data-action="item-menu" data-id="${item.id}" aria-label="更多操作">${icon('more')}</button></span>
      </li>`).join('') : '<li class="muted small item-empty">这个分组还没有内容</li>'}
      <li class="item-add"><a href="#/add?group=${group.id}&from=${encodeURIComponent('#/library')}">${icon('plus')} 添加到本组</a></li>
    </ol>` : ''}
  </article>`;
}

export const libraryView = {
  area: 'library',
  title: '表达库',
  initialUI: { category: 'all', query: '', sort: 'default', open: [], manage: false, selected: [] },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const groups = visibleGroups(state, ui);
    const groupIDs = new Set(groups.map(group => group.id));
    const expressions = state.expressions.filter(item => groupIDs.has(item.groupID));
    const learned = expressions.filter(item => isLearned(ix, item.id)).length;
    const counts = Object.fromEntries(CATEGORY_TABS.map(([value]) => [value, state.groups.filter(group => value === 'all' || group.category === value).length]));

    const toolbar = `<div class="lib-toolbar">
      ${segmented(CATEGORY_TABS.map(([value, label]) => [value, label, counts[value]]), ui.category, 'set-category')}
      <label class="search">${icon('search')}<input type="search" placeholder="搜索英文或中文" value="${esc(ui.query)}" data-input="search" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
      <select class="input input-small" data-change="sort" aria-label="排序">
        <option value="default" ${ui.sort === 'default' ? 'selected' : ''}>默认自排</option>
        <option value="oldest" ${ui.sort === 'oldest' ? 'selected' : ''}>最早创建</option>
        <option value="newest" ${ui.sort === 'newest' ? 'selected' : ''}>最新创建</option>
      </select>
      <span class="toolbar-gap"></span>
      <button type="button" class="btn btn-small btn-ghost" data-action="fold-all">${ui.open.length ? `${icon('collapse')} 全部收起` : `${icon('expand')} 全部展开`}</button>
      <label class="btn btn-small btn-ghost file-btn">${icon('upload')} 导入 Excel<input type="file" accept=".xlsx,.csv,.tsv,.txt" data-change="import" hidden /></label>
      <a class="btn btn-small btn-ghost" href="#/add?from=${encodeURIComponent('#/library')}">${icon('plus')} 添加表达</a>
      <button type="button" class="btn btn-small ${ui.manage ? 'btn-primary' : 'btn-ghost'}" data-action="manage">${ui.manage ? '完成管理' : '管理分组'}</button>
    </div>`;

    const manageBar = ui.manage ? `<div class="manage-bar">
      <span>已选 <strong>${ui.selected.length}</strong> 组</span>
      <button type="button" class="btn btn-small btn-ghost" data-action="select-all">${ui.selected.length === groups.length && groups.length ? '取消全选' : '全选当前'}</button>
      <span class="toolbar-gap"></span>
      <button type="button" class="btn btn-small btn-ghost" data-action="bulk-category" data-value="expression" ${ui.selected.length ? '' : 'disabled'}>改为表达积累</button>
      <button type="button" class="btn btn-small btn-ghost" data-action="bulk-category" data-value="vocabulary" ${ui.selected.length ? '' : 'disabled'}>改为词汇积累</button>
      <button type="button" class="btn btn-small btn-danger" data-action="bulk-delete" ${ui.selected.length ? '' : 'disabled'}>${icon('trash')} 删除分组</button>
    </div>` : '';

    let body;
    if (ui.query.trim()) {
      const results = searchExpressions(ix, ui.query).filter(item => groupIDs.has(item.groupID));
      body = results.length ? `<p class="hint">找到 ${results.length} 条</p><div class="result-list">${results.slice(0, 200).map(item => `<a class="word-row" href="#/detail/${item.id}?from=${encodeURIComponent('#/library')}">
          <span class="word-main"><span class="word-en">${esc(item.english)}</span><span class="word-zh">${esc(item.chinese)}</span></span>
          <span class="tag">${esc(ix.groupById.get(item.groupID)?.name ?? '')}</span>${masteryPill(masteryOf(ix, item.id))}</a>`).join('')}</div>`
        : emptyState('没有找到匹配的表达', '试试更短的关键词，或切换到“全部”。');
    } else if (!groups.length) {
      body = emptyState('这里还没有分组', '可以导入 Excel，或手动添加表达。');
    } else {
      body = `<div class="group-grid ${ui.sort === 'default' && !ui.manage ? 'can-drag' : ''}">${groups.map((group, index) => groupCard(ctx, group, index)).join('')}</div>
        ${ui.sort === 'default' && !ui.manage ? '<p class="hint center">长按分组标题可拖动换位 · 双击分组名称改名</p>' : ''}`;
    }

    return `<div class="page page-library">
      ${pageHead({ eyebrow: 'LIBRARY', title: '表达库', sub: `${ui.category === 'all' ? '全部' : categoryLabel(ui.category)} · ${groups.length} 组 · ${expressions.length} 条 · 已学 ${learned} 条` })}
      ${toolbar}${manageBar}
      <div class="lib-body fade-in" data-fade="${ui.category}">${body}</div>
    </div>`;
  },
  mount(root, ctx) {
    root.querySelectorAll('[data-rename]').forEach(node => onTap(node, {
      single: () => toggleGroup(ctx, node.dataset.rename),
      double: () => rename(ctx, node.dataset.rename),
    }));
    const grid = root.querySelector('.group-grid');
    if (grid) layoutGroupGrid(grid);
    if (ctx.ui.sort === 'default' && !ctx.ui.manage && !ctx.ui.query.trim()) setupDrag(root, ctx);
  },
  inputs: {
    search: (el, ctx) => {
      ctx.ui.query = el.value;
      clearTimeout(ctx.ui.searchTimer);
      ctx.ui.searchTimer = setTimeout(() => {
        const pos = el.selectionStart;
        ctx.rerender();
        const input = document.querySelector('.search input');
        input?.focus(); try { input?.setSelectionRange(pos, pos); } catch { /* ignore */ }
      }, 160);
    },
  },
  changes: {
    sort: (el, ctx) => { ctx.ui.sort = el.value; ctx.rerender(); },
    import: async (el, ctx) => { const file = el.files?.[0]; el.value = ''; if (file) await importSpreadsheet(ctx, file); },
  },
  actions: {
    'set-category': (el, ctx) => { ctx.ui.category = el.dataset.value; ctx.ui.selected = []; ctx.rerender(); },
    toggle: (el, ctx) => toggleGroup(ctx, el.dataset.id),
    'fold-all': (el, ctx) => {
      ctx.ui.open = ctx.ui.open.length ? [] : visibleGroups(ctx.state, ctx.ui).map(group => group.id);
      ctx.rerender();
    },
    manage: (el, ctx) => { ctx.ui.manage = !ctx.ui.manage; ctx.ui.selected = []; ctx.rerender(); },
    select: (el, ctx) => {
      const id = el.dataset.id;
      ctx.ui.selected = ctx.ui.selected.includes(id) ? ctx.ui.selected.filter(item => item !== id) : [...ctx.ui.selected, id];
      ctx.rerender();
    },
    'select-all': (el, ctx) => {
      const all = visibleGroups(ctx.state, ctx.ui).map(group => group.id);
      ctx.ui.selected = ctx.ui.selected.length === all.length ? [] : all;
      ctx.rerender();
    },
    'bulk-category': (el, ctx) => {
      const count = ctx.ui.selected.length;
      ctx.commit(state => setGroupsCategory(state, ctx.ui.selected, el.dataset.value));
      toast(`已将 ${count} 组改为${categoryLabel(el.dataset.value)}`);
    },
    'bulk-delete': async (el, ctx) => {
      const ids = ctx.ui.selected;
      const total = ids.reduce((sum, id) => sum + (ctx.ix.exprsByGroup.get(id)?.length ?? 0), 0);
      if (!await confirmDialog(`删除 ${ids.length} 个分组？`, `将同时删除其中的 ${total} 条表达和它们的学习记录，无法撤销。建议先到设置里导出备份。`, { okLabel: '删除', tone: 'danger' })) return;
      ctx.ui.selected = [];
      ctx.commit(state => deleteGroups(state, ids));
      toast('已删除');
    },
    'group-menu': async (el, ctx) => {
      const id = el.dataset.id;
      const group = ctx.ix.groupById.get(id);
      const other = group.category === 'expression' ? 'vocabulary' : 'expression';
      const choice = await openMenu(el, [
        { label: '重命名', value: 'rename', icon: 'edit' },
        { label: '添加表达到本组', value: 'add', icon: 'plus' },
        { label: `改为${categoryLabel(other)}`, value: 'category', icon: 'swap' },
        { label: '删除分组', value: 'delete', icon: 'trash', tone: 'danger' },
      ]);
      if (choice === 'rename') rename(ctx, id);
      if (choice === 'add') ctx.go(`#/add?group=${id}&from=${encodeURIComponent('#/library')}`);
      if (choice === 'category') { ctx.commit(state => setGroupsCategory(state, [id], other)); toast(`已改为${categoryLabel(other)}`); }
      if (choice === 'delete') {
        const count = ctx.ix.exprsByGroup.get(id)?.length ?? 0;
        if (await confirmDialog(`删除分组「${esc(group.name)}」？`, `其中 ${count} 条表达和学习记录会一并删除，无法撤销。`, { okLabel: '删除', tone: 'danger' })) {
          ctx.commit(state => deleteGroups(state, [id]));
          toast('已删除分组');
        }
      }
    },
    'item-menu': async (el, ctx) => {
      const id = el.dataset.id;
      const expression = ctx.ix.exprById.get(id);
      const choice = await openMenu(el, [
        { label: '编辑', value: 'edit', icon: 'edit' },
        { label: '默写练习', value: 'practice', icon: 'pen' },
        { label: '删除', value: 'delete', icon: 'trash', tone: 'danger' },
      ]);
      if (choice === 'edit') ctx.go(`#/edit/${id}?from=${encodeURIComponent('#/library')}`);
      if (choice === 'practice') ctx.go(`#/practice/${id}?from=${encodeURIComponent('#/library')}`);
      if (choice === 'delete' && await confirmDialog('删除这条表达？', `「${esc(expression.english)}」及其学习记录会一并删除。`, { okLabel: '删除', tone: 'danger' })) {
        ctx.commit(state => deleteExpression(state, id));
        toast('已删除');
      }
    },
  },
};

function toggleGroup(ctx, id) {
  ctx.ui.open = ctx.ui.open.includes(id) ? ctx.ui.open.filter(item => item !== id) : [...ctx.ui.open, id];
  ctx.rerender();
}

async function rename(ctx, id) {
  const group = ctx.ix.groupById.get(id);
  const name = await promptDialog('分组改名', { label: '分组名称', value: group.name });
  if (name && name !== group.name) { ctx.commit(state => renameGroup(state, id, name)); toast('已改名'); }
}

// ---------- Excel import ----------

async function importSpreadsheet(ctx, file) {
  let parsed;
  try { parsed = rowsToRecords(await readSpreadsheet(file)); }
  catch (error) { toast(`导入失败：${error.message}`, 'error'); return; }
  const { records, mapping } = parsed;
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const hasGroup = mapping.group != null; const hasCategory = mapping.category != null;
  const groupNames = [...new Set(records.map(record => record.group || baseName))];
  const columns = Object.keys(mapping).map(key => ({ english: '单词/短语', phonetic: '音标', chinese: '中文释义', example: '例句', writingPosition: '拓展', notes: '备注', group: '分组', category: '类别' })[key]).join('、');
  const defaultCategory = ctx.ui.category === 'vocabulary' ? 'vocabulary' : 'expression';
  const result = await modal({
    title: '导入 Excel',
    wide: true,
    body: `<p class="modal-text">读取到 <strong>${records.length}</strong> 条，${groupNames.length} 个分组。识别到的列：${esc(columns)}。</p>
      ${hasGroup ? '' : `<label class="field"><span>分组名称 <small>表格里没有“分组”列，全部放入这个分组</small></span><input name="groupName" value="${esc(baseName)}" /></label>`}
      <label class="field"><span>大类 ${hasCategory ? '<small>表格里有“类别”列，空白行使用这里的设置</small>' : ''}</span>
        <select name="category" class="input"><option value="expression" ${defaultCategory === 'expression' ? 'selected' : ''}>表达积累</option><option value="vocabulary" ${defaultCategory === 'vocabulary' ? 'selected' : ''}>词汇积累</option></select></label>
      <div class="import-preview">${records.slice(0, 6).map((record, index) => `<div><span class="item-no">${index + 1}</span><span class="mini-en">${esc(record.english)}</span><span class="mini-zh">${esc(record.chinese)}</span></div>`).join('')}${records.length > 6 ? `<div class="muted small">…以及另外 ${records.length - 6} 条（按表格行顺序保存）</div>` : ''}</div>`,
    buttons: [{ label: '取消', value: null }, { label: `导入 ${records.length} 条`, value: true, tone: 'primary' }],
  });
  if (!result.value) return;
  const fallbackGroupName = (result.form.groupName || baseName).trim() || baseName;
  const summary = ctx.commit(state => importRecords(state, records, { defaultCategory: result.form.category, fallbackGroupName }));
  ctx.ui.open = [...new Set([...ctx.ui.open, ...summary.groupIDs])];
  toast(`已导入 ${summary.added} 条${summary.groupsCreated ? `，新建 ${summary.groupsCreated} 个分组` : ''}`, 'success');
}

// ---------- Two independent columns ----------
// Cards are dealt left, right, left, right… into two columns, and each column
// stacks its cards tightly, so a short card never leaves a hole beside a tall one.

const NARROW = typeof matchMedia === 'function' ? matchMedia('(max-width: 860px)') : null;
const columnCount = () => (NARROW?.matches ? 1 : 2);

function layoutGroupGrid(grid, order = null) {
  const list = order ?? [...grid.querySelectorAll('.group-card')].sort((a, b) => (Number(a.dataset.order ?? 0) - Number(b.dataset.order ?? 0)) || 0);
  if (!order && !grid.querySelector('.group-col')) list.forEach((card, index) => { card.dataset.order = index; });
  const count = columnCount();
  let cols = [...grid.children].filter(node => node.classList.contains('group-col'));
  if (cols.length !== count) {
    cols = Array.from({ length: count }, () => Object.assign(document.createElement('div'), { className: 'group-col' }));
    list.forEach((card, index) => cols[index % count].append(card));
    grid.querySelectorAll('.group-col').forEach(col => col.remove());
    grid.append(...cols);
  } else {
    list.forEach((card, index) => cols[index % count].append(card));
  }
  list.forEach((card, index) => { card.dataset.order = index; });
  return list;
}

NARROW?.addEventListener?.('change', () => {
  const grid = document.querySelector('.group-grid');
  if (grid && !document.body.classList.contains('is-reordering')) layoutGroupGrid(grid);
});

// ---------- Long-press drag reordering ----------

function setupDrag(root, ctx) {
  const grid = root.querySelector('.group-grid');
  if (!grid) return;
  const main = document.querySelector('#main');
  const sidebar = document.querySelector('.sidebar');
  let press = null; let drag = null;

  const preventTouch = event => { if (drag) event.preventDefault(); };
  const ordered = () => [...grid.querySelectorAll('.group-card')].sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  const inside = (rect, x, y) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  grid.addEventListener('pointerdown', event => {
    const head = event.target.closest('[data-drag-handle]');
    if (!head || event.target.closest('button:not([data-rename]), a, input') || event.button > 0) return;
    const card = head.closest('.group-card');
    press = { card, x: event.clientX, y: event.clientY, id: event.pointerId, timer: setTimeout(() => begin(event), 420) };
  });

  function begin() {
    if (!press) return;
    const { card } = press;
    const rect = card.getBoundingClientRect();
    const order = ordered();
    // Where every other card sits when nothing is moving. Hit-testing uses these
    // resting positions, never the in-flight animated ones, so cards can't bounce.
    const slots = new Map(order.filter(node => node !== card).map(node => [node, node.getBoundingClientRect()]));
    drag = { card, order, slots, pointerId: press.id, offsetX: press.x - rect.left, offsetY: press.y - rect.top, mainScroll: main.scrollTop, sideScroll: sidebar?.scrollTop ?? 0, lastHit: null, lastMove: null };
    press = null;
    try { card.setPointerCapture(drag.pointerId); } catch { /* ignore */ }
    document.body.classList.add('is-reordering');
    card.classList.add('is-dragging');
    document.addEventListener('touchmove', preventTouch, { passive: false });
    navigator.vibrate?.(10);
    window.getSelection?.()?.removeAllRanges();
    const name = card.querySelector('[data-rename]');
    if (name) name.dataset.suppressClick = '1';
  }

  function place(clientX, clientY) {
    const { card } = drag;
    card.style.transform = 'none';
    const natural = card.getBoundingClientRect();
    card.style.transform = `translate(${clientX - drag.offsetX - natural.left}px, ${clientY - drag.offsetY - natural.top}px) scale(1.02)`;
  }

  function flip(mutate) {
    const others = drag.order.filter(card => card !== drag.card);
    const before = new Map(others.map(card => [card, card.getBoundingClientRect()]));
    others.forEach(card => { card.style.transition = 'none'; card.style.transform = ''; });
    mutate();
    others.forEach(card => {
      const b = card.getBoundingClientRect();
      drag.slots.set(card, b);
      const a = before.get(card);
      const dx = a.left - b.left; const dy = a.top - b.top;
      if (!dx && !dy) return;
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => { card.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'; card.style.transform = ''; });
    });
  }

  grid.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
    if (!drag) return;
    event.preventDefault();
    main.scrollTop = drag.mainScroll;
    if (sidebar) sidebar.scrollTop = drag.sideScroll;
    const x = event.clientX; const y = event.clientY;
    const hit = drag.order.find(card => card !== drag.card && inside(drag.slots.get(card), x, y)) ?? null;
    const movedEnough = !drag.lastMove || Math.hypot(x - drag.lastMove.x, y - drag.lastMove.y) > 14;
    if (hit && hit !== drag.lastHit && movedEnough) {
      const from = drag.order.indexOf(drag.card); const to = drag.order.indexOf(hit);
      drag.order.splice(from, 1);
      drag.order.splice(to, 0, drag.card);
      flip(() => layoutGroupGrid(grid, drag.order));
      drag.lastMove = { x, y };
    }
    drag.lastHit = hit;
    place(x, y);
  });

  const finish = () => {
    if (press) { clearTimeout(press.timer); press = null; }
    if (!drag) return;
    const { card, order } = drag;
    document.removeEventListener('touchmove', preventTouch);
    card.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    card.style.transform = '';
    const ids = order.map(node => node.dataset.groupId);
    drag = null;
    setTimeout(() => {
      card.classList.remove('is-dragging');
      card.style.transition = '';
      document.body.classList.remove('is-reordering');
      ctx.commit(state => reorderGroups(state, ids));
    }, 230);
  };
  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', finish);
  grid.addEventListener('contextmenu', event => { if (press || drag) event.preventDefault(); });
}
