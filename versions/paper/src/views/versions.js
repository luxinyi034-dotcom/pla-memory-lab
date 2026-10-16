// #/versions — every released version of the site, all kept online.
// All versions share the same learning data (same browser storage), so
// switching between them never loses progress (each switch is snapshotted).
// This file is identical in every copy except SELF.
import { icon, toast } from '../ui/dom.js';
import { pageHead } from './common.js';

// Which version this copy of the code is.
const SELF = 'paper';

export const VERSIONS = [
  { id: 'latest', name: 'v4.2.1 奶油版', date: '2026-10-17', path: '', notes: ['当前最新版：设置里的版本列表默认收起，需要时再展开'] },
  { id: 'v4.2.0', name: 'v4.2.0 奶油版', date: '2026-10-16', path: 'versions/v4.2.0/', notes: ['复习日期按首次学习规整；10 月 16 日重新开始；设置里可以打开或改用任何旧版本'] },
  { id: 'v4.1.1', name: 'v4.1.1 奶油版', date: '2026-10-16', path: 'versions/v4.1.1/', notes: ['奶油底 + 珊瑚红，左侧导航；设置页新排版，自动快照与每周导出提醒', '规整复习日期之前的版本'] },
  { id: 'minimal', name: 'v3 简约版', date: '2026-10-16', path: 'versions/minimal/', notes: ['更克制的纸本风格：只用一个砖红点缀，几乎没有色块'] },
  { id: 'paper', name: 'v2 纸本版', date: '2026-10-16', path: 'versions/paper/', notes: ['暖白纸面 + 砖红、赭黄、青苔绿、梅紫的低饱和配色'] },
  { id: 'foundation', name: 'v1 地基版', date: '2026-10-15', path: 'versions/foundation/', notes: ['最初按重建规范做的版本；不认识“休息日”，只适合查看'], noDefault: true },
];

// The version the site opens by default on this device ('' = latest).
export const PREFERRED_KEY = 'pla-preferred-version';
const root = location.pathname.includes('/versions/') ? '../../' : './';
function preferred() { try { return localStorage.getItem(PREFERRED_KEY) || ''; } catch { return ''; } }
function setPreferred(path) { try { if (path) localStorage.setItem(PREFERRED_KEY, path); else localStorage.removeItem(PREFERRED_KEY); } catch { /* ignore */ } }

/** The version list (used by #/versions and the settings page). */
export function versionList() {
  const pref = preferred();
  return `<div class="result-list version-list">${VERSIONS.map(version => {
    const isSelf = version.id === SELF;
    const isDefault = (pref || '') === version.path;
    const badges = `${isSelf ? '<span class="tag is-ok">正在使用</span>' : ''}${isDefault ? '<span class="tag is-soft">默认打开</span>' : ''}`;
    const actions = `${isSelf ? '' : `<a class="btn btn-small btn-ghost" href="${root}${version.path}${version.path ? '' : '?latest'}">打开 ${icon('chevron')}</a>`}
      ${!isDefault && !version.noDefault ? `<button type="button" class="btn btn-small" data-action="set-default-version" data-path="${version.path}">${version.path ? '设为默认' : '恢复默认用最新版'}</button>` : ''}`;
    return `<div class="word-row version-row">
      <span class="word-main" style="flex-direction:column;gap:2px;align-items:flex-start"><span class="word-en">${version.name} <small class="muted">· ${version.date}</small> ${badges}</span>${version.notes.map(note => `<span class="word-zh">${note}</span>`).join('')}</span>
      <span class="version-actions">${actions}</span>
    </div>`;
  }).join('')}</div>`;
}

export const versionActions = {
  'set-default-version': (el, ctx) => {
    const path = el.dataset.path ?? '';
    setPreferred(path);
    toast(path ? '已设为默认：以后打开网站会直接进入这个版本，学习数据不变' : '已恢复默认使用最新版', 'success');
    ctx.rerender();
  },
};

export const versionsView = {
  area: 'settings',
  title: '版本目录',
  render() {
    return `<div class="page page-versions">
      ${pageHead({ eyebrow: 'VERSIONS', title: '版本目录', sub: '每次更新的网站都完整保留在这里，可以随时打开，或设为默认打开的版本。所有版本共用同一份学习数据，切换前会自动存快照。' })}
      ${versionList()}
      ${SELF === VERSIONS[0].id ? '' : `<p class="hint"><a class="text-link" href="${root}?latest">← 回到最新版（并改回默认用最新版）</a></p>`}
    </div>`;
  },
  actions: versionActions,
};
