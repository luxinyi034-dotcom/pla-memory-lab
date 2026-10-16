// App shell: routing, sidebar, rendering and event delegation.
import { store } from './store.js';
import { $, esc, icon, toast } from './ui/dom.js';
import { todayKey } from './core/time.js';
import { dueExpressions, streak } from './core/selectors.js';
import { views } from './views/index.js';
import { LOGO } from './ui/art.js';
import { APP_VERSION } from './version.js';

export { APP_VERSION };

const NAV = [
  ['today', '今日学习', 'today', '#/today'],
  ['library', '表达库', 'library', '#/library'],
  ['plan', '掌握与计划', 'plan', '#/plan'],
  ['quick', '快速刷词', 'quick', '#/quick'],
  ['favorites', '我的收藏', 'favorites', '#/favorites'],
  ['checkin', '打卡日历', 'checkin', '#/checkin'],
  ['settings', '设置', 'settings', '#/settings'],
];

const uiState = {};
const scrollMemory = new Map();
let current = null; // { view, route }
let lastDay = null;

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [path, queryString = ''] = clean.split('?');
  const [name = 'today', ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: views[name] ? name : 'today', params, query: new URLSearchParams(queryString), hash: `#/${clean || 'today'}` };
}

export function go(hash, { replace = false } = {}) {
  if (hash === location.hash) { render(); return; }
  if (replace) { history.replaceState(null, '', hash); render(); }
  else location.hash = hash;
}

/** href that carries an explicit return context. */
export function withFrom(hash, from = current?.route.hash ?? '#/today') {
  return `${hash}${hash.includes('?') ? '&' : '?'}from=${encodeURIComponent(from)}`;
}

export function back(fallback = '#/today') {
  const from = current?.route.query.get('from');
  go(from || fallback);
}

function ctxFor(route, view) {
  const key = view.uiKey ?? route.name;
  uiState[key] ??= structuredClone(view.initialUI ?? {});
  return {
    store, state: store.state, ix: store.ix, route, ui: uiState[key],
    go, back, withFrom,
    uiFor: name => (uiState[name] ??= structuredClone(views[name]?.initialUI ?? {})),
    here: route.hash,
    rerender: () => render({ keepScroll: true }),
    commit: (fn, options) => store.commit(fn, options),
  };
}

function renderNav(activeArea) {
  const today = todayKey();
  const due = dueExpressions(store.ix, today).length;
  const wrong = store.state.wrongBook.length;
  const checked = store.state.checkins.includes(today);
  $('#nav').innerHTML = NAV.map(([area, label, iconName, href]) => {
    const badge = area === 'today' && due ? `<small class="nav-count is-accent" title="今日待复习">${due}</small>`
      : area === 'library' ? `<small class="nav-count">${store.state.expressions.length}</small>`
      : area === 'quick' && wrong ? `<small class="nav-count" title="错词本">${wrong}</small>`
      : area === 'favorites' && store.state.favorites.length ? `<small class="nav-count">${store.state.favorites.length}</small>` : '';
    return `<a href="${href}" class="nav-item ${activeArea === area ? 'is-active' : ''}" ${activeArea === area ? 'aria-current="page"' : ''}><span class="nav-label">${label}</span>${badge}</a>`;
  }).join('');
  const foot = $('#side-foot');
  if (foot) foot.innerHTML = `<a class="side-streak ${checked ? 'is-done' : ''}" href="#/checkin"><b>${streak(store.state.checkins, today)}</b><span>天连续打卡</span><small>${checked ? '今日已打卡' : '今日还没打卡'} · 累计 ${store.state.checkins.length} 天</small></a><a class="side-versions" href="#/versions">版本目录 · ${APP_VERSION}</a>`;
  const brand = $('#brand');
  if (brand && !brand.dataset.ready) { brand.insertAdjacentHTML('afterbegin', LOGO); brand.dataset.ready = '1'; }
}

export function render({ keepScroll = false } = {}) {
  const main = $('#main');
  const route = parseHash();
  const view = views[route.name];
  if (current && current.route.hash !== route.hash) {
    scrollMemory.set(current.route.hash, main.scrollTop);
    current.view.onLeave?.(current.ctx);
  }
  const sameRoute = current?.route.hash === route.hash;
  const previousScroll = main.scrollTop;
  const ctx = ctxFor(route, view);
  if (view.guard) {
    const redirect = view.guard(ctx);
    if (redirect) { go(redirect, { replace: true }); return; }
  }
  current = { view, route, ctx };
  document.body.classList.toggle('is-focus', Boolean(view.focus));
  renderNav(view.area ?? route.name);
  let html;
  try { html = view.render(ctx); }
  catch (error) {
    console.error(error);
    html = `<div class="page"><div class="empty-state"><h2>页面出错了</h2><p>${esc(error.message)}</p><a class="btn" href="#/today">返回今日学习</a></div></div>`;
  }
  main.innerHTML = html;
  main.dataset.view = route.name;
  document.title = view.title ? `${typeof view.title === 'function' ? view.title(ctx) : view.title} · PLA Memory Lab` : 'PLA Memory Lab';
  view.mount?.(main, ctx);
  if (keepScroll || sameRoute) main.scrollTop = previousScroll;
  else main.scrollTop = scrollMemory.get(route.hash) ?? 0;
}

function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target || !current) return;
  if (target.closest('.modal-backdrop')) return;
  const name = target.dataset.action;
  const handler = current.view.actions?.[name];
  if (!handler) return;
  if (target.tagName === 'A' || target.type === 'submit') event.preventDefault();
  Promise.resolve(handler(target, current.ctx, event)).catch(error => { console.error(error); toast(error.message || '操作失败', 'error'); });
}

function handleChange(event) {
  const target = event.target.closest('[data-change]');
  if (!target || !current) return;
  const handler = current.view.changes?.[target.dataset.change];
  if (handler) Promise.resolve(handler(target, current.ctx, event)).catch(error => { console.error(error); toast(error.message || '操作失败', 'error'); });
}

function handleInput(event) {
  const target = event.target.closest('[data-input]');
  if (!target || !current) return;
  current.view.inputs?.[target.dataset.input]?.(target, current.ctx, event);
}

async function boot() {
  await store.load(APP_VERSION);
  lastDay = todayKey();
  if (!location.hash) history.replaceState(null, '', '#/today');
  const main = $('#main');
  main.addEventListener('click', handleAction);
  main.addEventListener('change', handleChange);
  main.addEventListener('input', handleInput);
  window.addEventListener('hashchange', () => render());
  store.subscribe(() => render({ keepScroll: true }));
  // Persist right away when the app goes to the background (iPad home button, tab switch).
  const flush = () => { current?.view.onLeave?.(current.ctx); store.saveNow(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else if (todayKey() !== lastDay) { lastDay = todayKey(); render({ keepScroll: true }); } });
  window.addEventListener('pagehide', flush);
  // Roll over to the next learning day at 02:00 even if the app stays open.
  setInterval(() => { if (todayKey() !== lastDay) { lastDay = todayKey(); render({ keepScroll: true }); toast('已切换到新的学习日'); } }, 30000);
  render();
  if (store.source === 'seed') toast('已载入内置的学习数据备份（2026-10-15）');
  if (store.source === 'snapshot') toast('本地数据损坏，已从自动快照恢复', 'error');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new release takes over, reload once so it shows straight away.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      flush();
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) registration.update().catch(() => {}); });
    }).catch(() => {});
  }
}

boot();
