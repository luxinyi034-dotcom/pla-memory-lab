// #/versions — every released version of the site, all kept online.
// All versions share the same learning data (same browser storage), so
// switching between them never loses progress.
import { icon } from '../ui/dom.js';
import { pageHead } from './common.js';

// Which version this copy of the code is.
const SELF = 'minimal';

export const VERSIONS = [
  { id: 'paper', name: 'v2 纸本版', date: '2026-10-16', path: '', notes: ['暖白纸面 + 砖红、赭黄、青苔绿、梅紫的低饱和配色', '学习页全屏专注；首页有问候、7 天打卡条和完成度圆环'] },
  { id: 'minimal', name: 'v3 简约版', date: '2026-10-16', path: 'versions/minimal/', notes: ['更克制的纸本风格：只用一个砖红点缀，几乎没有色块', '功能和 v2 完全相同'] },
  { id: 'foundation', name: 'v1 地基版', date: '2026-10-15', path: 'versions/foundation/', notes: ['最初按重建规范做的版本（米白 + 陶土红卡片）', '不认识“休息日”，复习到期日按原来的算法'] },
];

// Links are relative to the site root, whichever version we are inside.
const root = location.pathname.includes('/versions/') ? '../../' : './';

export const versionsView = {
  area: 'settings',
  title: '版本目录',
  render() {
    return `<div class="page page-versions">
      ${pageHead({ eyebrow: 'VERSIONS', title: '版本目录', sub: '每次大改版的网站都完整保留在这里，可以随时打开使用和对比。所有版本共用同一份学习数据。' })}
      <div class="result-list">
        ${VERSIONS.map(version => {
          const body = `<span class="word-main" style="flex-direction:column;gap:2px;align-items:flex-start"><span class="word-en">${version.name} <small class="muted">· ${version.date}</small></span>${version.notes.map(note => `<span class="word-zh">${note}</span>`).join('')}</span>`;
          return version.id === SELF
            ? `<div class="word-row">${body}<span class="tag is-ok">当前</span></div>`
            : `<a class="word-row" href="${root}${version.path}">${body}<span class="btn btn-small btn-ghost">打开 ${icon('chevron')}</span></a>`;
        }).join('')}
      </div>
      ${SELF === 'paper' ? '' : `<p class="hint"><a class="text-link" href="${root}">← 回到最新版</a></p>`}
    </div>`;
  },
};
