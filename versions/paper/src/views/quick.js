// #/quick hub, #/quick-run/:source board and #/wrong-dictation.
import { esc, icon, toast, confirmDialog, onTap } from '../ui/dom.js';
import { todayKey } from '../core/time.js';
import { quickQueue, sectionByGroup, todayNewItems, todayReviewedItems } from '../core/selectors.js';
import { openQuickSession, decideQuick, toggleReveal, quickDone, openWrongDictation, submitWrongDictation, advanceWrongDictation } from '../core/drills.js';
import { removeFromWrongBook } from '../core/actions.js';
import { pageHead, emptyState, answerReview, writingBox, progressBar } from './common.js';
import { focusTop } from './study.js';

const SOURCES = { today: '今日内容', all: '全部已学' };

export const quickHubView = {
  area: 'quick',
  title: '快速刷词与错词本',
  initialUI: { revealed: [] },
  render(ctx) {
    const { state, ix, ui } = ctx;
    const today = todayKey();
    const counts = { today: quickQueue(ix, 'today', today).length, all: quickQueue(ix, 'all', today).length };
    const label = source => {
      const saved = state.quickReviewSessions[source];
      const decided = saved ? Object.keys(saved.decisions ?? saved.quickDecisions ?? {}).length : 0;
      return saved?.queue?.length && decided > 0 && decided < saved.queue.length ? `继续（${decided} / ${saved.queue.length}）` : '开始';
    };
    const wrong = state.wrongBook.map(entry => ix.exprById.get(entry.expressionID)).filter(Boolean);
    const dictation = state.wrongDictationSession;
    return `<div class="page page-quick">
      ${pageHead({ eyebrow: 'QUICK CHECK', title: '快速刷词与错词本', sub: '两个通道相互独立：快速刷词里标“不熟悉”的才会进入错词本；正常复习写错不会进入。两者都不改变掌握度和复习计划。' })}
      <section class="task-grid">
        <article class="task-card">
          <div class="task-card-top"><span class="task-kicker">${icon('quick')} 快速刷词</span></div>
          <h3>看中文想英文，左滑熟悉，右滑不熟悉</h3>
          <p>单击显示 / 隐藏英文，双击查看详情。退出会保存位置。</p>
          <div class="quick-sources">
            ${Object.entries(SOURCES).map(([source, name]) => `<a class="source-btn ${counts[source] ? '' : 'is-disabled'}" href="${counts[source] ? `#/quick-run/${source}` : '#/quick'}" ${counts[source] ? '' : 'aria-disabled="true"'}>
              <span><strong>${name}</strong><small>${counts[source] ? `${counts[source]} 条${source === 'today' ? ' · 先新学后复习' : ''}` : source === 'today' ? '今天还没有学习记录' : '还没有学过的内容'}</small></span>
              <span class="source-cta">${counts[source] ? label(source) : '—'} ${icon('chevron')}</span></a>`).join('')}
          </div>
        </article>
        <article class="task-card">
          <div class="task-card-top"><span class="task-kicker">${icon('pen')} 错词本</span><span class="count-badge">${wrong.length} 条</span></div>
          <h3>错词默写 · 写对一条移除一条</h3>
          <p>第一轮逐个写完全部；写错的按出错顺序进入下一轮，直到错词本清空。</p>
          <div class="task-actions">${wrong.length ? `<a class="btn btn-primary" href="#/wrong-dictation">${dictation ? `继续默写（第 ${dictation.pass} 轮）` : '开始默写'} ${icon('chevron')}</a>` : '<span class="muted">错词本是空的</span>'}</div>
        </article>
      </section>
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title">错词本 · ${wrong.length} 条</h2><span class="muted small">单击显示 / 隐藏英文，双击查看详情</span></div>
        ${wrong.length ? `<div class="quick-rows">${wrong.map(item => `<div class="quick-row is-static" data-tap="${item.id}">
            <span class="quick-zh">${esc(item.chinese)}</span>
            <span class="quick-en ${ui.revealed.includes(item.id) ? '' : 'is-hidden'}">${ui.revealed.includes(item.id) ? esc(item.english) : '点击显示英文'}</span>
            <button type="button" class="icon-btn" data-action="remove-wrong" data-id="${item.id}" title="移出错词本" aria-label="移出错词本">${icon('x')}</button>
          </div>`).join('')}</div>` : emptyState('错词本是空的', '在快速刷词中右滑“不熟悉”的表达会出现在这里。')}
      </section>
    </div>`;
  },
  mount(root, ctx) {
    root.querySelectorAll('[data-tap]').forEach(row => onTap(row, {
      single: () => {
        const id = row.dataset.tap;
        ctx.ui.revealed = ctx.ui.revealed.includes(id) ? ctx.ui.revealed.filter(item => item !== id) : [...ctx.ui.revealed, id];
        const en = row.querySelector('.quick-en');
        const shown = ctx.ui.revealed.includes(id);
        en.classList.toggle('is-hidden', !shown);
        en.textContent = shown ? ctx.ix.exprById.get(id)?.english ?? '' : '点击显示英文';
      },
      double: () => ctx.go(ctx.withFrom(`#/detail/${row.dataset.tap}`, '#/quick')),
    }));
  },
  actions: {
    'remove-wrong': async (el, ctx) => {
      ctx.commit(state => removeFromWrongBook(state, el.dataset.id));
      toast('已移出错词本');
    },
  },
};

// ---------- Quick board ----------

function sessionFor(ctx) {
  const source = ctx.route.params[0] === 'today' ? 'today' : 'all';
  const available = quickQueue(ctx.ix, source, todayKey());
  let session = ctx.state.quickReviewSessions[source];
  if (!session || ctx.ui.openedFor !== source) {
    session = ctx.store.commit(state => openQuickSession(state, source, available), { silent: true });
    ctx.ui.openedFor = source;
  }
  return { source, session };
}

function rowHTML(ctx, session, item) {
  const decision = session.decisions[item.id];
  const shown = decision === 'familiar' || session.revealed.includes(item.id);
  const current = session.queue[session.index] === item.id && !decision;
  return `<div class="quick-row ${decision ? `is-${decision}` : ''} ${current ? 'is-current' : ''}" data-quick="${item.id}">
    <span class="swipe-hint is-left">${icon('check')} 熟悉</span><span class="swipe-hint is-right">不熟悉 ${icon('x')}</span>
    <div class="quick-row-inner">
      <span class="quick-zh">${esc(item.chinese)}</span>
      <span class="quick-en ${shown ? '' : 'is-hidden'}">${shown ? esc(item.english) : '点击显示英文'}</span>
      <span class="quick-mark">${decision === 'familiar' ? '熟悉' : decision === 'unfamiliar' ? '已进错词本' : ''}</span>
      <span class="quick-buttons">
        <button type="button" class="icon-btn is-ok" data-decide="familiar" aria-label="熟悉">${icon('check')}</button>
        <button type="button" class="icon-btn is-no" data-decide="unfamiliar" aria-label="不熟悉">${icon('x')}</button>
      </span>
    </div>
  </div>`;
}

export const quickRunView = {
  area: 'quick',
  title: '快速刷词',
  initialUI: { openedFor: null },
  guard: ctx => (quickQueue(ctx.ix, ctx.route.params[0] === 'today' ? 'today' : 'all', todayKey()).length ? null : '#/quick'),
  render(ctx) {
    const { ix } = ctx;
    const { source, session } = sessionFor(ctx);
    const decided = Object.keys(session.decisions).length;
    const total = session.queue.length;
    const familiar = Object.values(session.decisions).filter(value => value === 'familiar').length;
    const head = pageHead({
      backHref: '#/quick', backLabel: '退出（已保存）', eyebrow: source === 'today' ? 'TODAY' : 'ALL LEARNED',
      title: source === 'today' ? '快速刷今日内容' : '快速刷全部已学',
      sub: `左滑 = 熟悉，右滑 = 不熟悉（进错词本）。单击显示英文，双击看详情。以最后一次操作为准。`,
      actions: `<div class="quick-progress"><span data-quick-progress>${decided} / ${total}</span>${progressBar(decided, total)}</div>`,
    });
    if (quickDone(session)) {
      return `<div class="page page-quick">${head}
        <section class="study-card is-complete">
          <div class="complete-mark">${icon('check')}</div>
          <h2>这一轮刷完了</h2>
          <div class="complete-stats"><div><strong>${familiar}</strong><span>熟悉</span></div><div><strong>${total - familiar}</strong><span>进了错词本</span></div></div>
          <div class="study-actions is-wrap">
            <button type="button" class="btn btn-ghost" data-action="restart">重新刷一轮</button>
            ${total - familiar ? '<a class="btn btn-ghost" href="#/wrong-dictation">去错词默写</a>' : ''}
            <button type="button" class="btn btn-primary" data-action="finish">完成</button>
          </div>
        </section>
        <p class="hint center">下面仍可修改：滑动任意一条会更新它的状态。</p>
        ${boardHTML(ctx, source, session)}
      </div>`;
    }
    return `<div class="page page-quick">${head}${boardHTML(ctx, source, session)}</div>`;
    function boardHTML() {
      const byID = id => ix.exprById.get(id);
      const blocks = source === 'today'
        ? [['今日新学', todayNewItems(ix).filter(item => session.queue.includes(item.id))], ['今日复习', todayReviewedItems(ix).filter(item => session.queue.includes(item.id))]]
        : [[null, session.queue.map(byID).filter(Boolean)]];
      return blocks.filter(([, items]) => items.length).map(([title, items]) => `${title ? `<div class="divider-title"><span>${title}</span><small>${items.length} 条</small></div>` : ''}
        ${sectionByGroup(ix, items).map(section => `<section class="quick-group"><h3 class="quick-group-title">${esc(section.group.name)}<small>${section.items.length} 条</small></h3>
          <div class="quick-rows">${section.items.map(item => rowHTML(ctx, session, item)).join('')}</div></section>`).join('')}`).join('');
    }
  },
  mount(root, ctx) {
    const source = ctx.route.params[0] === 'today' ? 'today' : 'all';
    const session = () => ctx.state.quickReviewSessions[source];
    const current = root.querySelector('.quick-row.is-current');
    if (current && !root.dataset.scrolled) { root.dataset.scrolled = '1'; current.scrollIntoView({ block: 'center' }); }

    const decide = (row, decision) => {
      const id = row.dataset.quick;
      const s = session();
      const wasDone = quickDone(s);
      ctx.store.commit(state => decideQuick(state, state.quickReviewSessions[source], id, decision), { silent: true });
      if (!wasDone && quickDone(s)) { ctx.rerender(); return; }
      // Update just this row so the rest of the board does not flash.
      const expression = ctx.ix.exprById.get(id);
      row.classList.remove('is-familiar', 'is-unfamiliar', 'is-current');
      row.classList.add(`is-${decision}`);
      const en = row.querySelector('.quick-en');
      const shown = decision === 'familiar' || s.revealed.includes(id);
      en.classList.toggle('is-hidden', !shown);
      en.textContent = shown ? expression.english : '点击显示英文';
      row.querySelector('.quick-mark').textContent = decision === 'familiar' ? '熟悉' : '已进错词本';
      root.querySelectorAll('.quick-row.is-current').forEach(node => node.classList.remove('is-current'));
      root.querySelector(`[data-quick="${CSS.escape(s.queue[s.index] ?? '')}"]`)?.classList.add('is-current');
      const done = Object.keys(s.decisions).length;
      const progress = root.querySelector('[data-quick-progress]');
      if (progress) progress.textContent = `${done} / ${s.queue.length}`;
      const bar = root.querySelector('.quick-progress .bar span');
      if (bar) bar.style.width = `${Math.round(done / s.queue.length * 100)}%`;
    };

    root.querySelectorAll('[data-quick]').forEach(row => {
      const inner = row.querySelector('.quick-row-inner');
      let start = null;
      row.addEventListener('pointerdown', event => {
        if (event.target.closest('button')) return;
        start = { x: event.clientX, y: event.clientY, swiping: false };
      });
      row.addEventListener('pointermove', event => {
        if (!start) return;
        const dx = event.clientX - start.x; const dy = event.clientY - start.y;
        if (!start.swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          start.swiping = true;
          try { row.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        }
        if (start.swiping) {
          event.preventDefault();
          inner.style.transition = 'none';
          inner.style.transform = `translateX(${Math.max(-110, Math.min(110, dx))}px)`;
          row.classList.toggle('show-left', dx < -30);
          row.classList.toggle('show-right', dx > 30);
        }
      });
      const end = event => {
        if (!start) return;
        const dx = event.clientX - start.x;
        const swiped = start.swiping;
        start = null;
        inner.style.transition = ''; inner.style.transform = '';
        row.classList.remove('show-left', 'show-right');
        if (swiped) {
          row.dataset.suppressClick = '1';
          if (Math.abs(dx) >= 60) decide(row, dx < 0 ? 'familiar' : 'unfamiliar');
          setTimeout(() => { row.dataset.suppressClick = ''; }, 50);
        }
      };
      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', () => { start = null; inner.style.transform = ''; row.classList.remove('show-left', 'show-right'); });
      row.querySelectorAll('[data-decide]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); decide(row, button.dataset.decide); }));
      onTap(row, {
        single: () => {
          const id = row.dataset.quick;
          ctx.store.commit(state => toggleReveal(state.quickReviewSessions[source], id), { silent: true });
          const s = session();
          const en = row.querySelector('.quick-en');
          const shown = s.decisions[id] === 'familiar' || s.revealed.includes(id);
          en.classList.toggle('is-hidden', !shown);
          en.textContent = shown ? ctx.ix.exprById.get(id)?.english ?? '' : '点击显示英文';
        },
        double: () => ctx.go(ctx.withFrom(`#/detail/${row.dataset.quick}`, ctx.here)),
      });
    });
  },
  actions: {
    restart: (el, ctx) => {
      const source = ctx.route.params[0] === 'today' ? 'today' : 'all';
      ctx.commit(state => { delete state.quickReviewSessions[source]; });
      ctx.ui.openedFor = null; ctx.rerender();
    },
    finish: (el, ctx) => {
      const source = ctx.route.params[0] === 'today' ? 'today' : 'all';
      ctx.commit(state => { delete state.quickReviewSessions[source]; }, { silent: true });
      ctx.ui.openedFor = null;
      ctx.go('#/quick');
    },
  },
  onLeave(ctx) { ctx.ui.openedFor = null; },
};

// ---------- Wrong-book dictation ----------

export const wrongDictationView = {
  area: 'quick',
  focus: true,
  title: '错词默写',
  initialUI: { session: null },
  render(ctx) {
    const { state, ix, ui } = ctx;
    if (!ui.session || (ui.session.phase !== 'complete' && state.wrongDictationSession !== ui.session)) {
      ui.session = ctx.store.commit(s => openWrongDictation(s), { silent: true });
    }
    let session = ui.session;
    // Something may have left the wrong book meanwhile (e.g. marked familiar in quick check).
    while (session.phase === 'writing' && session.queue.length && !state.wrongBook.some(entry => entry.expressionID === session.queue[session.index])) {
      ui.session = session = ctx.store.commit(s => { session.index -= 1; return advanceWrongDictation(s, session); }, { silent: true });
    }
    const remaining = state.wrongBook.length;
    const head = focusTop({
      exitHref: '#/quick', exitLabel: '退出',
      meta: `错词默写 · 第 ${session.pass} 轮 · <b>错词本剩余 ${remaining} 条</b>`,
      steps: session.retryQueue.length ? `<span>下一轮 ${session.retryQueue.length} 条</span>` : '',
      done: session.cleared ?? 0, total: session.totalAtStart || 1,
    });
    if (session.phase === 'complete' || !session.queue.length) {
      return `<div class="focus-page">${head}
        <section class="focus-stage is-wide">
          <div class="kicker">完成</div>
          <h2 class="focus-title">${session.totalAtStart ? '错词本已清空' : '错词本是空的'}</h2>
          <p class="focus-note">${session.totalAtStart ? `${session.totalAtStart} 条，共进行了 ${session.pass} 轮。` : '在快速刷词中右滑“不熟悉”的表达会进入错词本。'}</p>
          <div class="focus-actions"><button type="button" class="btn btn-primary btn-large" data-action="exit">返回</button></div>
        </section></div>`;
    }
    const id = session.queue[session.index];
    const expression = ix.exprById.get(id);
    const kicker = `本轮 ${session.index + 1} / ${session.queue.length}`;
    if (session.phase === 'result') {
      const last = session.index + 1 >= session.queue.length;
      return `<div class="focus-page">${head}
        <section class="focus-stage is-wide">
          <div class="kicker">${kicker}</div>
          <div class="focus-chinese">${esc(expression?.chinese ?? '')}</div>
          ${answerReview(session.answer, expression?.english ?? '', session.correct)}
          <div class="verdict ${session.correct ? 'is-ok' : ''}"><i></i>${session.correct ? '写对了，已从错词本移除' : '没写对，下一轮再来'}</div>
          <div class="focus-actions">
            <a class="btn btn-large" href="${ctx.withFrom(`#/detail/${id}`, '#/wrong-dictation')}">查看详情</a>
            <button type="button" class="btn btn-primary btn-large" data-action="next" data-autofocus>${last ? (session.retryQueue.length ? '进入下一轮' : '完成') : '下一条'}<kbd>↵</kbd></button>
          </div>
        </section></div>`;
    }
    return `<div class="focus-page">${head}
      <section class="focus-stage is-wide">
        <div class="kicker">${kicker} · 只用于消灭错词，不改变掌握度和复习计划</div>
        <div class="focus-chinese">${esc(expression?.chinese ?? '')}</div>
        <div class="answer-block">
          <div class="answer-label"><span>你的答案</span><span>忽略大小写与标点 · 回车提交</span></div>
          ${writingBox('answer', session.draft ?? '', '在这里写英文（键盘或 Apple Pencil）')}
        </div>
        <div class="focus-actions"><button type="button" class="btn btn-primary btn-large" data-action="submit">提交<kbd>↵</kbd></button></div>
      </section></div>`;
  },
  mount(root, ctx) {
    const box = root.querySelector('#answer');
    if (box) {
      setTimeout(() => box.focus({ preventScroll: true }), 30);
      box.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); wrongDictationView.actions.submit(null, ctx); } });
    } else root.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
  },
  inputs: { draft: (el, ctx) => { if (ctx.ui.session) { ctx.ui.session.draft = el.value; ctx.store.scheduleSave(); } } },
  actions: {
    submit: (el, ctx) => {
      const value = document.querySelector('#answer')?.value ?? '';
      if (!value.trim()) return;
      ctx.commit(state => submitWrongDictation(state, ctx.ui.session, value));
    },
    next: (el, ctx) => ctx.commit(state => advanceWrongDictation(state, ctx.ui.session)),
    exit: (el, ctx) => { ctx.ui.session = null; ctx.go('#/quick'); },
  },
  onLeave(ctx) { if (ctx.ui.session?.phase === 'complete') ctx.ui.session = null; },
};

export { confirmDialog };
