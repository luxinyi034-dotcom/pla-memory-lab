// Favorites, check-in calendar and settings.
import { esc, icon, toast, modal, confirmDialog, downloadFile, speak } from '../ui/dom.js';
import { todayKey, addDaysKey, formatDateTime, dayLabel } from '../core/time.js';
import { streak, makeupUsed, canMakeup, MAKEUP_LIMIT_PER_MONTH, masteryOf, categoryLabel, isLearned } from '../core/selectors.js';
import { claimMakeup, toggleFavorite } from '../core/actions.js';
import { buildExport, mergeImport, replaceImport, countState, contentHash, unwrapPayload, normalizeState } from '../core/model.js';
import { listSnapshots } from '../store.js';
import { pageHead, segmented, CATEGORY_TABS, masteryPill, emptyState } from './common.js';

// ---------- Favorites ----------

export const favoritesView = {
  area: 'favorites',
  title: '我的收藏',
  initialUI: { category: 'all' },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const items = state.expressions.filter(item => item.isFavorite && (ui.category === 'all' || ix.groupById.get(item.groupID)?.category === ui.category));
    return `<div class="page page-favorites">
      ${pageHead({ eyebrow: 'FAVORITES', title: '我的收藏', sub: `共 ${state.favorites.length} 条。在详情页或学习卡片上点星标收藏。` })}
      <div class="lib-toolbar">${segmented(CATEGORY_TABS, ui.category, 'set-category')}</div>
      ${items.length ? `<div class="result-list">${items.map(item => `<div class="word-row has-action">
          <a class="word-main" href="#/detail/${item.id}?from=${encodeURIComponent('#/favorites')}"><span class="word-en">${esc(item.english)}</span><span class="word-zh">${esc(item.chinese)}</span></a>
          <span class="tag">${esc(ix.groupById.get(item.groupID)?.name ?? '')}</span>
          ${isLearned(ix, item.id) ? masteryPill(masteryOf(ix, item.id)) : '<span class="tag is-soft">未学</span>'}
          <button type="button" class="icon-btn is-on" data-action="unfavorite" data-id="${item.id}" title="取消收藏" aria-label="取消收藏">${icon('star')}</button>
        </div>`).join('')}</div>` : emptyState('还没有收藏', '学习时点卡片右上角的星标，就会收进这里。')}
    </div>`;
  },
  actions: {
    'set-category': (el, ctx) => { ctx.ui.category = el.dataset.value; ctx.rerender(); },
    unfavorite: (el, ctx) => { ctx.commit(state => toggleFavorite(state, el.dataset.id)); toast('已取消收藏'); },
  },
};

// ---------- Check-in ----------

export const checkinView = {
  area: 'checkin',
  title: '打卡日历',
  initialUI: { month: null, selected: null },
  render(ctx) {
    const { state, ui } = ctx;
    const today = todayKey();
    ui.month ??= today.slice(0, 7);
    const [year, month] = ui.month.split('-').map(Number);
    const first = `${ui.month}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const checkins = new Set(state.checkins);
    const makeups = new Set(state.makeupCheckins.map(item => item.date));
    const used = makeupUsed(state, ui.month);
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push('<span class="cal-cell is-blank"></span>');
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = addDaysKey(first, d - 1);
      const checked = checkins.has(key);
      const missedPast = !checked && key < today;
      const classes = ['cal-cell', checked && 'is-checked', makeups.has(key) && 'is-makeup', key === today && 'is-today', key > today && 'is-future', missedPast && 'is-missed', ui.selected === key && 'is-selected'].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${classes}" ${missedPast ? `data-action="select" data-date="${key}"` : 'tabindex="-1"'} aria-label="${key}${checked ? ' 已打卡' : ''}">
        <span class="cal-num">${d}</span>${checked ? `<span class="cal-mark">${makeups.has(key) ? '补' : icon('check')}</span>` : ''}</button>`);
    }
    const selectedCheck = ui.selected ? canMakeup(state, ui.selected, today) : null;
    const panel = ui.selected
      ? `<div class="makeup-panel">
          <div><strong>${dayLabel(ui.selected)}</strong><p class="muted small">补打卡只会标记这一天，并把当天到期的复习视为已完成；不会生成新学内容。</p></div>
          ${selectedCheck.ok ? `<button type="button" class="btn btn-primary" data-action="claim">补打卡</button>` : `<span class="tag is-due">${esc(selectedCheck.reason)}</span>`}
        </div>`
      : `<div class="makeup-panel is-quiet"><p class="muted small">点击过去未打卡的日期可以补打卡，每月最多 ${MAKEUP_LIMIT_PER_MONTH} 次（本月已用 ${used} 次）。</p></div>`;
    return `<div class="page page-checkin">
      ${pageHead({ eyebrow: 'CHECK-IN', title: '打卡日历', sub: '完成当天的新学就会自动打卡。学习日按北京时间凌晨 2:00 切换。' })}
      <div class="checkin-layout">
        <section class="panel calendar">
          <div class="cal-head">
            <button type="button" class="icon-btn" data-action="month" data-value="-1" aria-label="上个月">${icon('back')}</button>
            <h2>${year} 年 ${month} 月</h2>
            <button type="button" class="icon-btn" data-action="month" data-value="1" aria-label="下个月">${icon('chevron')}</button>
          </div>
          <div class="cal-grid">${['一', '二', '三', '四', '五', '六', '日'].map(day => `<span class="cal-dow">${day}</span>`).join('')}${cells.join('')}</div>
          <div class="cal-legend"><span><i class="lg is-checked"></i>已打卡</span><span><i class="lg is-makeup"></i>补打卡</span><span><i class="lg is-today"></i>今天</span><span><i class="lg is-missed"></i>未打卡</span></div>
        </section>
        <aside class="checkin-side">
          <div class="stat is-primary"><div class="stat-label">连续打卡</div><div class="stat-value">${streak(state.checkins, today)}<span class="stat-total"> 天</span></div></div>
          <div class="stat"><div class="stat-label">累计打卡</div><div class="stat-value">${state.checkins.length}<span class="stat-total"> 天</span></div></div>
          <div class="stat"><div class="stat-label">本月补打卡</div><div class="stat-value">${used}<span class="stat-total"> / ${MAKEUP_LIMIT_PER_MONTH}</span></div></div>
          ${panel}
        </aside>
      </div>
    </div>`;
  },
  actions: {
    month: (el, ctx) => {
      const [y, m] = ctx.ui.month.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1 + Number(el.dataset.value), 1));
      ctx.ui.month = date.toISOString().slice(0, 7); ctx.ui.selected = null; ctx.rerender();
    },
    select: (el, ctx) => { ctx.ui.selected = ctx.ui.selected === el.dataset.date ? null : el.dataset.date; ctx.rerender(); },
    claim: async (el, ctx) => {
      const date = ctx.ui.selected;
      if (!await confirmDialog('确认补打卡？', `${dayLabel(date)} 会被标记为已打卡，当天到期的复习视为已完成。本月还剩 ${MAKEUP_LIMIT_PER_MONTH - makeupUsed(ctx.state, date.slice(0, 7))} 次。`)) return;
      const reviewed = ctx.commit(state => claimMakeup(state, date));
      ctx.ui.selected = null;
      toast(`已补打卡${reviewed ? `，${reviewed} 条复习标记为完成` : ''}`, 'success');
    },
  },
};

// ---------- Settings ----------

async function readJSONFile(file) {
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('文件不是有效的 JSON。'); }
}

/** One snapshot row: kind badge, readable name, contents, restore button. */
function snapshotRow(snap) {
  const [day, ...rest] = snap.day.split(' · ');
  const label = rest.join(' · ').replace(/ #\d+$/, '');
  const kind = label.startsWith('打开') ? ['is-version', '更新前'] : label ? ['is-migration', '整理前'] : ['is-daily', '每日'];
  const [, m, d] = day.split('-').map(Number);
  const time = snap.savedAt ? formatDateTime(snap.savedAt).slice(-8, -3) : '';
  return `<div class="snapshot">
    <span class="snap-kind ${kind[0]}">${kind[1]}</span>
    <span class="snap-name"><b>${m} 月 ${d} 日${label ? ` · ${esc(label)}` : ''}</b><small>${time ? `${time} · ` : ''}${snap.state?.expressions?.length ?? 0} 条 · 已学 ${(snap.state?.progress ?? []).filter(item => item.firstLearnedAt).length}</small></span>
    <button type="button" class="btn btn-small btn-ghost" data-action="restore-snapshot" data-day="${esc(snap.day)}">恢复这份</button>
  </div>`;
}

export const settingsView = {
  area: 'settings',
  title: '设置',
  initialUI: { hash: null, snapshots: null },
  render(ctx) {
    const { state, store, ui } = ctx;
    const counts = countState(state);
    const settings = state.settings;
    const lastExport = store.meta.lastExportAt;
    const daysSinceExport = lastExport ? Math.floor((Date.now() - Date.parse(lastExport)) / 86400000) : null;
    return `<div class="page page-settings">
      ${pageHead({ eyebrow: 'SETTINGS', title: '设置', sub: '所有数据保存在这台设备的浏览器里（离线可用）。换设备或清理浏览器前，请先导出备份。' })}
      <div class="settings-stats">
        ${[['分组', counts.groups, ''], ['表达', counts.expressions, ''], ['已学', counts.learned, `/ ${counts.progress}`], ['计分默写', counts.accuracyAttempts, '次'], ['打卡', counts.checkins, '天'], ['错词本 / 收藏', `${counts.wrongBook} / ${counts.favorites}`, '']]
          .map(([label, value, unit]) => `<div class="s-stat"><span>${label}</span><b>${value}${unit ? `<small>${unit}</small>` : ''}</b></div>`).join('')}
      </div>
      <p class="settings-meta">
        <span>最近保存 <b>${store.meta.savedAt ? formatDateTime(store.meta.savedAt) : '—'}</b></span>
        <span>内容校验 <b class="mono hash-value">${ui.hash ? `${ui.hash.slice(0, 16)}…` : '计算中…'}</b></span>
        ${store.meta.seededFrom ? `<span>初始数据 <b>备份 ${formatDateTime(store.meta.seededFrom)}</b></span>` : ''}
      </p>
      ${store.saveError ? '<p class="warn">⚠︎ 最近一次保存失败（存储空间可能不足），请立即导出备份。</p>' : ''}

      <section class="panel backup-panel">
        <div class="backup-side">
          <h2 class="panel-title">备份与恢复</h2>
          <p class="muted small">导出包含词库、分组、学习进度、打卡、收藏、错词本和未完成的学习位置。导入只恢复数据，不会改变网站的功能和界面。</p>
          ${daysSinceExport == null || daysSinceExport >= 7 ? `<p class="warn">${lastExport ? `距上次导出已经 ${daysSinceExport} 天` : '这台设备还没有导出过备份'}，建议现在导出一份，存到「文件」或 iCloud。</p>` : `<p class="export-ok">上次导出：${formatDateTime(lastExport)}</p>`}
          <div class="button-row">
            <button type="button" class="btn btn-primary" data-action="export">${icon('download')} 导出完整备份</button>
            <label class="btn file-btn">${icon('upload')} 导入备份…<input type="file" accept=".json,application/json" data-change="import" hidden /></label>
          </div>
        </div>
        <div class="snapshot-side">
          <div class="snapshot-head"><h3 class="panel-title">自动快照</h3><span class="muted small">${ui.snapshots ? `${ui.snapshots.length} 份` : ''}</span></div>
          <p class="muted small">每天打开网站自动存一份（保留 30 天）；更新到新版本或打开其他版本前，先存一份（保留最近 10 次）。</p>
          <div class="snapshot-list">${ui.snapshots == null ? '<p class="muted small">读取中…</p>'
            : ui.snapshots.length ? ui.snapshots.map(snapshotRow).join('')
            : '<p class="muted small">还没有快照。</p>'}</div>
        </div>
      </section>

      <div class="settings-grid">
        <section class="panel">
          <h2 class="panel-title">发音</h2>
          <label class="switch-row"><span><strong>自动发音</strong><small>认读卡片、默写结果和详情页打开时自动朗读英文</small></span>
            <input type="checkbox" class="switch" data-change="auto-speak" ${settings.autoPronunciationEnabled ? 'checked' : ''} /></label>
          <label class="field"><span>口音</span>
            <select class="input" data-change="locale">
              ${[['en-US', '美式 English (US)'], ['en-GB', '英式 English (UK)'], ['en-AU', '澳式 English (Australia)']].map(([value, label]) => `<option value="${value}" ${settings.pronunciationLocale === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select></label>
          <button type="button" class="btn btn-ghost" data-action="test-speak">${icon('speaker')} 试听</button>
        </section>

        <section class="panel">
          <h2 class="panel-title">Excel 导入格式</h2>
          <p class="muted small">在“表达库 → 导入 Excel”中使用。表头支持：<strong>单词/短语</strong>（必填）、（美）音标、简短中文释义、例句、拓展；可选“分组”和“类别”（表达积累 / 词汇积累）。按表格行顺序保存。</p>
          <button type="button" class="btn btn-ghost" data-action="template">${icon('download')} 下载 CSV 模板</button>
        </section>

        <section class="panel tips-panel">
          <h2 class="panel-title">使用小贴士</h2>
          <ul class="tips">
            <li>在 iPad Safari 里点“分享 → 添加到主屏幕”，就能像 App 一样全屏、离线使用，数据也不容易被系统清理。</li>
            <li>学习日每天北京时间凌晨 2:00 切换；复习节点为首次学习后的第 1、2、4、7、15、30 天。</li>
            <li>默写忽略大小写、空格和标点；sb. / sth. 这类缩写写不写点都算对。</li>
            <li>旧版本都存档在 <a class="text-link" href="#/versions">版本目录</a>，可以随时打开对比，学习数据是同一份。</li>
          </ul>
        </section>
      </div>
    </div>`;
  },
  mount(root, ctx) {
    if (!ctx.ui.hash) contentHash(ctx.state).then(hash => { ctx.ui.hash = hash; const node = root.querySelector('.hash-value'); if (node) node.textContent = `${hash.slice(0, 16)}…`; }).catch(() => {});
    if (ctx.ui.snapshots == null) listSnapshots().then(list => { ctx.ui.snapshots = list; ctx.rerender(); });
  },
  onLeave(ctx) { ctx.ui.hash = null; ctx.ui.snapshots = null; },
  changes: {
    'auto-speak': (el, ctx) => ctx.commit(state => { state.settings.autoPronunciationEnabled = el.checked; }),
    locale: (el, ctx) => ctx.commit(state => { state.settings.pronunciationLocale = el.value; }),
    import: async (el, ctx) => {
      const file = el.files?.[0]; el.value = '';
      if (!file) return;
      const payload = await readJSONFile(file);
      let incoming;
      try { incoming = normalizeState(unwrapPayload(structuredClone(payload))); } catch (error) { throw new Error(`无法导入：${error.message}`); }
      const counts = countState(incoming);
      const current = countState(ctx.state);
      const hashNote = payload.contentHash ? `<p class="muted small">文件校验：${(await contentHash(incoming)) === payload.contentHash ? '✓ 与导出时一致' : '⚠︎ 与导出时不一致（文件可能被修改过）'}</p>` : '';
      const { value } = await modal({
        title: '导入备份',
        wide: true,
        body: `<p class="modal-text">${esc(file.name)}${payload.exportedAt ? ` · 导出于 ${formatDateTime(payload.exportedAt)}` : ''}</p>
          <table class="compare"><thead><tr><th></th><th>当前设备</th><th>备份文件</th></tr></thead><tbody>
            ${[['分组', 'groups'], ['表达', 'expressions'], ['学习进度', 'progress'], ['打卡', 'checkins'], ['错词本', 'wrongBook'], ['收藏', 'favorites']].map(([label, key]) => `<tr><td>${label}</td><td>${current[key]}</td><td>${counts[key]}</td></tr>`).join('')}
          </tbody></table>
          ${hashNote}
          <p class="modal-text small"><strong>合并恢复</strong>：相同 ID 的记录用备份更新，新的记录追加，这台设备上多出来的内容保留。<br><strong>完全替换</strong>：这台设备上的数据变成和备份一模一样。</p>`,
        buttons: [{ label: '取消', value: null }, { label: '完全替换', value: 'replace', tone: 'danger' }, { label: '合并恢复', value: 'merge', tone: 'primary' }],
      });
      if (!value) return;
      if (value === 'replace' && !await confirmDialog('确定完全替换？', '这台设备上现有的数据会被备份覆盖。建议先导出一份当前数据。', { okLabel: '替换', tone: 'danger' })) return;
      try {
        if (value === 'merge') {
          const { state, report } = mergeImport(ctx.state, payload);
          ctx.store.replace(state);
          toast(`已合并：新增 ${report.expressionsAdded} 条、更新 ${report.expressionsUpdated} 条表达`, 'success');
        } else {
          ctx.store.replace(replaceImport(payload, ctx.state.settings));
          toast('已完全恢复为备份内容', 'success');
        }
        ctx.ui.hash = null;
      } catch (error) {
        throw new Error(`导入失败，数据未做任何改动：${error.message}`);
      }
    },
  },
  actions: {
    export: async (el, ctx) => {
      const payload = await buildExport(ctx.state);
      downloadFile(`PLA-Memory-Lab-backup-${todayKey()}.json`, JSON.stringify(payload, null, 2));
      ctx.store.setMeta({ lastExportAt: payload.exportedAt });
      toast('备份已导出', 'success');
      ctx.rerender();
    },
    'restore-snapshot': async (el, ctx) => {
      const snap = ctx.ui.snapshots?.find(item => item.day === el.dataset.day);
      if (!snap) return;
      if (!await confirmDialog(`恢复到 ${snap.day} 的快照？`, '当前数据会被这份快照替换。建议先导出一份当前数据。', { okLabel: '恢复', tone: 'danger' })) return;
      ctx.store.replace(replaceImport(snap.state, ctx.state.settings));
      toast('已恢复快照', 'success');
    },
    'test-speak': (el, ctx) => { if (!speak('The writer reframes the proposal as a threat to the community.', ctx.state.settings.pronunciationLocale)) toast('当前浏览器不支持发音', 'error'); },
    template: () => {
      const rows = [['单词/短语', '（美）音标', '简短中文释义', '例句', '拓展', '分组', '类别'],
        ['reframe A as B', '', '把A重新定义为B', 'The writer reframes the proposal as a threat rather than an opportunity.', 'BP分析（观点重构）', '改变观点', '表达积累'],
        ['human agency', '', '人的自主权', 'The writer warns that excessive automation may undermine human agency.', 'BP（AI与人类价值）', 'AI：human value 类', '词汇积累']];
      downloadFile('PLA-Memory-Lab-导入模板.csv', `﻿${rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')}`, 'text/csv');
    },
  },
};

export { categoryLabel };
