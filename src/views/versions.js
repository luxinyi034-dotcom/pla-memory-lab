// #/versions — archived versions of the site. All versions share the same
// learning data (same browser storage), so switching never loses progress.
import { icon } from '../ui/dom.js';
import { pageHead } from './common.js';

export const VERSIONS = [
  {
    id: 'foundation', name: 'v1 地基版', date: '2026-10-15', href: './versions/foundation/',
    notes: ['按重建规范完成全部功能：今日学习、新学 / 复习、表达库、掌握与计划、快速刷词与错词本、收藏、打卡、设置', '原规范配色（米白 + 陶土红）'],
  },
];

export const versionsView = {
  area: 'settings',
  title: '版本目录',
  render() {
    return `<div class="page page-versions">
      ${pageHead({ eyebrow: 'VERSIONS', title: '版本目录', sub: '每次大改版前都会把当时的网站完整存档在这里，可以随时打开使用和对比。所有版本共用同一份学习数据。' })}
      <div class="result-list">
        <div class="word-row"><span class="word-main"><span class="word-en">最新版</span><span class="word-zh">正在使用的版本</span></span><span class="tag is-ok">当前</span></div>
        ${VERSIONS.map(version => `<a class="word-row" href="${version.href}">
          <span class="word-main" style="flex-direction:column;gap:2px"><span class="word-en">${version.name} <small class="muted">· ${version.date} 存档</small></span>
          ${version.notes.map(note => `<span class="word-zh">${note}</span>`).join('')}</span>
          <span class="btn btn-small btn-ghost">打开 ${icon('chevron')}</span></a>`).join('')}
      </div>
    </div>`;
  },
};
