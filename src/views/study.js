// #/study — the running new-learning / review session, in full-screen focus mode.
import { esc, icon, speak } from '../ui/dom.js';
import { todayKey } from '../core/time.js';
import { masteryOf } from '../core/selectors.js';
import {
  currentGroup, currentItemID, flowTotals, recognize, nextAfterDetail, previousCard,
  submitAnswer, nextAfterResult, nextGroup, isResumable, repeatFlow,
} from '../core/study.js';
import { toggleFavorite } from '../core/actions.js';
import { expressionInfo, answerReview, writingBox, masteryPill } from './common.js';
import { bubbleArt } from '../ui/art.js';

const flowOf = state => state.sessions[0];
const ARROW = '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

/** Exit · where you are · steps, then a hairline progress track. */
export function focusTop({ exitHref, exitLabel = '退出', meta, steps = null, done = 0, total = 0 }) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<div class="focus-top">
    <a class="focus-exit" href="${exitHref}"><span class="exit-dot">${icon('x')}</span><span>${exitLabel}</span></a>
    <div class="focus-meta">${meta}</div>
    <div class="focus-steps">${steps ?? ''}</div>
  </div>
  <div class="focus-track"><i style="width:${pct}%"></i></div>`;
}

function stepsFor(flow) {
  const steps = [['认读', ['recognize', 'detail']], ['默写', ['dictation', 'result']], ['小结', ['groupDone']]];
  const active = steps.findIndex(([, list]) => list.includes(flow.phase));
  return steps.map(([label], index) => `<span class="${index === active ? 'is-active' : index < active ? 'is-done' : ''}">${label}</span>`).join('');
}

function top(ctx, flow) {
  const group = ctx.ix.groupById.get(currentGroup(flow)?.groupID);
  const { done, total } = flowTotals(flow);
  const label = flow.repeat ? '再次巩固' : flow.type === 'new' ? '新学' : '到期复习';
  return focusTop({
    exitHref: '#/today', exitLabel: '退出',
    meta: `${label} · 第 ${flow.gi + 1} / ${flow.queue.length} 组 · <b>${esc(group?.name ?? '')}</b>`,
    steps: stepsFor(flow), done, total,
  });
}

function tools(ctx, expression) {
  return `<div class="focus-tools">
    <button type="button" class="text-tool" data-action="speak">${icon('speaker')}发音</button>
    <button type="button" class="text-tool ${expression.isFavorite ? 'is-on' : ''}" data-action="favorite">${icon('star')}${expression.isFavorite ? '已收藏' : '收藏'}</button>
    <a class="text-tool" href="${ctx.withFrom(`#/edit/${expression.id}`, '#/study')}">${icon('edit')}编辑</a>
  </div>`;
}

function dots(entry, index) {
  return `<div class="focus-dots">${entry.itemIDs.map((_, i) => `<i class="${i < index ? 'is-done' : i === index ? 'is-current' : ''}"></i>`).join('')}</div>`;
}

export const studyView = {
  area: 'today',
  focus: true,
  title: ctx => (flowOf(ctx.state)?.type === 'review' ? '复习' : '新学'),
  guard(ctx) {
    const flow = flowOf(ctx.state);
    if (!flow || (flow.phase !== 'complete' && !isResumable(ctx.state, flow))) return '#/today';
    return null;
  },
  render(ctx) {
    const { state, ix } = ctx;
    const flow = flowOf(state);
    if (flow.phase === 'complete') return completeScreen(ctx, flow);
    const id = currentItemID(flow);
    const expression = ix.exprById.get(id);
    const head = top(ctx, flow);
    const entry = currentGroup(flow);

    if (flow.phase === 'groupDone') {
      const group = ix.groupById.get(entry.groupID);
      const last = flow.gi + 1 >= flow.queue.length;
      const right = entry.itemIDs.filter(itemID => flow.firstResult[itemID]).length;
      return `<div class="focus-page" data-phase="${flow.phase}">${head}
        <section class="focus-stage is-wide">
          <div class="kicker">本组完成</div>
          <h2 class="focus-title">${esc(group?.name ?? '')}</h2>
          <p class="focus-note">首次默写写对 ${right} / ${entry.itemIDs.length} 条</p>
          <div class="ruled-list">${entry.itemIDs.map(itemID => {
            const item = ix.exprById.get(itemID);
            if (!item) return '';
            const ok = flow.firstResult[itemID];
            return `<a class="ruled-row" href="${ctx.withFrom(`#/detail/${itemID}`, '#/study')}">
              <span class="mark ${ok ? 'is-ok' : 'is-wrong'}">${ok ? '✓' : '✕'}</span>
              <span class="ruled-en">${esc(item.english)}</span><span class="ruled-zh">${esc(item.chinese)}</span>
              ${flow.repeat ? '' : masteryPill(masteryOf(ix, itemID))}</a>`;
          }).join('')}</div>
          <div class="focus-actions"><button type="button" class="btn btn-primary btn-large" data-action="next-group" data-autofocus>${last ? (flow.type === 'new' ? '完成今日新学' : '完成复习') : '进入下一组'} ${ARROW}</button></div>
        </section></div>`;
    }

    if (!expression) return `<div class="focus-page" data-phase="${flow.phase}">${head}<section class="focus-stage"><p>这条表达已被删除。</p><button class="btn" data-action="skip-missing">跳过</button></section></div>`;

    if (flow.phase === 'recognize') {
      return `<div class="focus-page" data-phase="${flow.phase}">${head}
        <section class="focus-stage">
          <div class="kicker">${flow.ii + 1} / ${entry.itemIDs.length} · 看到英文，你认识吗？</div>
          <div class="focus-english">${esc(expression.english)}</div>
          ${expression.phonetic ? `<div class="focus-phonetic">${esc(expression.phonetic)}</div>` : ''}
          ${tools(ctx, expression)}
          <div class="focus-actions">
            <button type="button" class="btn btn-large" data-action="recognize" data-value="0">不认识<kbd>←</kbd></button>
            <button type="button" class="btn btn-primary btn-large" data-action="recognize" data-value="1" data-autofocus>认识<kbd>→</kbd></button>
          </div>
          ${dots(entry, flow.ii)}
          ${flow.ii > 0 ? '<button type="button" class="text-link focus-back" data-action="prev">上一条</button>' : ''}
        </section></div>`;
    }

    if (flow.phase === 'detail') {
      const last = flow.ii + 1 >= entry.itemIDs.length;
      const known = flow.recognized[id];
      return `<div class="focus-page" data-phase="${flow.phase}">${head}
        <section class="focus-stage is-wide">
          <div class="kicker ${known ? '' : 'is-accent'}">${flow.ii + 1} / ${entry.itemIDs.length} · ${known ? '你选择了认识' : '你选择了不认识，多看一眼'}</div>
          ${expressionInfo(expression, { large: true })}
          ${tools(ctx, expression)}
          <div class="focus-actions">
            <button type="button" class="btn btn-large" data-action="prev">上一步</button>
            <button type="button" class="btn btn-primary btn-large" data-action="next-detail" data-autofocus>${last ? '本组看完，开始默写' : '下一条'}<kbd>↵</kbd></button>
          </div>
          ${dots(entry, flow.ii)}
        </section></div>`;
    }

    if (flow.phase === 'dictation') {
      const retry = (flow.attempts[id] ?? 0) > 0;
      return `<div class="focus-page" data-phase="${flow.phase}">${head}
        <section class="focus-stage is-wide">
          <div class="kicker ${retry ? 'is-accent' : ''}">默写 ${Math.min(flow.di + 1, flow.dictQueue.length)} / ${flow.dictQueue.length}${retry ? ' · 再写一次，写对才算通过' : ''}</div>
          <div class="focus-chinese">${esc(expression.chinese)}</div>
          ${expression.writingPosition ? `<div class="focus-hint">${esc(expression.writingPosition)}</div>` : ''}
          <div class="answer-block">
            <div class="answer-label"><span>你的答案</span><span>忽略大小写与标点 · 回车提交</span></div>
            ${writingBox('answer', flow.draft ?? '', '在这里写英文（键盘或 Apple Pencil）')}
          </div>
          <div class="focus-actions"><button type="button" class="btn btn-primary btn-large" data-action="submit">提交<kbd>↵</kbd></button></div>
        </section></div>`;
    }

    // result
    const correct = flow.correct;
    const moreInQueue = flow.di + 1 < flow.dictQueue.length;
    return `<div class="focus-page" data-phase="${flow.phase}">${head}
      <section class="focus-stage is-wide">
        <div class="kicker">默写 ${Math.min(flow.di + 1, flow.dictQueue.length)} / ${flow.dictQueue.length}</div>
        <div class="focus-chinese">${esc(expression.chinese)}</div>
        ${answerReview(flow.answer, expression.english, correct)}
        <div class="verdict ${correct ? 'is-ok' : ''}"><i></i>${correct ? '写对了' : '这次没写对，本组最后会再写一次'}</div>
        ${expression.example ? `<dl class="focus-example"><dt>例句</dt><dd>${esc(expression.example)}</dd></dl>` : ''}
        <div class="focus-actions">
          <a class="btn btn-large" href="${ctx.withFrom(`#/detail/${id}`, '#/study')}">查看详情</a>
          <button type="button" class="btn btn-primary btn-large" data-action="next-result" data-autofocus>${moreInQueue ? '下一条' : '本组小结'}<kbd>↵</kbd></button>
        </div>
      </section></div>`;
  },
  mount(root, ctx) {
    const flow = flowOf(ctx.state);
    const box = root.querySelector('#answer');
    if (box) {
      setTimeout(() => box.focus({ preventScroll: true }), 30);
      box.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); studyView.actions.submit(null, ctx); }
      });
    } else {
      root.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    }
    // Keyboard: ← 不认识 / → 认识 while recognising; Enter or → to move on.
    document.onkeydown = event => {
      if (location.hash.split('?')[0] !== '#/study' || event.target.closest?.('textarea, input, .modal-backdrop')) return;
      const current = flowOf(ctx.state);
      if (!current) return;
      if (current.phase === 'recognize' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        ctx.commit(state => recognize(flowOf(state), event.key === 'ArrowRight'));
      } else if (current.phase === 'detail' && event.key === 'ArrowLeft') {
        event.preventDefault(); ctx.commit(state => previousCard(flowOf(state)));
      } else if (current.phase === 'detail' && event.key === 'ArrowRight') {
        event.preventDefault(); ctx.commit(state => nextAfterDetail(flowOf(state)));
      }
    };
    if (ctx.state.settings.autoPronunciationEnabled && flow && (flow.phase === 'recognize' || flow.phase === 'result')) {
      const expression = ctx.ix.exprById.get(currentItemID(flow));
      if (expression && root.dataset.spokenFor !== `${flow.phase}:${expression.id}`) {
        root.dataset.spokenFor = `${flow.phase}:${expression.id}`;
        speak(expression.english, ctx.state.settings.pronunciationLocale);
      }
    }
  },
  onLeave(ctx) {
    document.onkeydown = null;
    const flow = flowOf(ctx.state);
    if (flow?.phase === 'complete') ctx.commit(state => { state.sessions = []; }, { silent: true });
  },
  inputs: {
    draft: (el, ctx) => { const flow = flowOf(ctx.state); if (flow) { flow.draft = el.value; ctx.store.scheduleSave(); } },
  },
  actions: {
    speak: (el, ctx) => {
      const expression = ctx.ix.exprById.get(currentItemID(flowOf(ctx.state)));
      if (expression && !speak(expression.english, ctx.state.settings.pronunciationLocale)) throw new Error('当前浏览器不支持发音');
    },
    favorite: (el, ctx) => ctx.commit(state => toggleFavorite(state, currentItemID(flowOf(state)))),
    recognize: (el, ctx) => ctx.commit(state => recognize(flowOf(state), el.dataset.value === '1')),
    prev: (el, ctx) => ctx.commit(state => previousCard(flowOf(state))),
    'next-detail': (el, ctx) => ctx.commit(state => nextAfterDetail(flowOf(state))),
    submit: (el, ctx) => {
      const value = document.querySelector('#answer')?.value ?? '';
      if (!value.trim()) { document.querySelector('#answer')?.focus(); return; }
      ctx.commit(state => submitAnswer(state, flowOf(state), value));
    },
    'next-result': (el, ctx) => ctx.commit(state => nextAfterResult(flowOf(state))),
    'next-group': (el, ctx) => ctx.commit(state => {
      const flow = flowOf(state);
      nextGroup(state, flow);
      if (flow.phase === 'complete' && !flow.repeat) {
        state.lastStudyRound = { type: flow.type, day: todayKey(), queue: flow.queue, completedAt: flow.completedAt };
      }
    }),
    'skip-missing': (el, ctx) => ctx.commit(state => {
      const flow = flowOf(state);
      if (flow.phase === 'recognize' || flow.phase === 'detail') nextAfterDetail(flow); else nextAfterResult(flow);
    }),
    'repeat-round': (el, ctx) => ctx.commit(state => { state.sessions = [repeatFlow(flowOf(state))]; }),
    finish: (el, ctx) => { ctx.commit(state => { state.sessions = []; }, { silent: true }); ctx.go('#/today'); },
  },
};

function completeScreen(ctx, flow) {
  const { ix } = ctx;
  const { total } = flowTotals(flow);
  const correct = Object.values(flow.firstResult).filter(Boolean).length;
  const title = flow.repeat ? '再次巩固完成' : flow.type === 'new' ? '今日新学完成' : '今日复习完成';
  const note = flow.repeat ? '本轮不计入掌握度、错误次数和复习节点。'
    : flow.type === 'new' ? '已自动打卡。明天开始第一次复习。' : '复习已记录，下一个节点已经排好。';
  return `<div class="focus-page" data-phase="complete">
    ${focusTop({ exitHref: '#/today', exitLabel: '返回今日学习', meta: flow.type === 'new' ? '新学' : '到期复习', done: 1, total: 1 })}
    <section class="focus-stage is-wide">
      ${bubbleArt('done-art')}
      <div class="kicker">完成</div>
      <h2 class="focus-title">${title}</h2>
      <p class="focus-note">${note}</p>
      <div class="figures">
        <div><b>${total}</b><span>条</span></div>
        <div><b>${correct}</b><span>首次写对</span></div>
        <div><b class="${flow.errors.length ? 'is-accent' : ''}">${flow.errors.length}</b><span>首次写错</span></div>
      </div>
      ${flow.errors.length ? `<div class="ruled-list">${flow.errors.map(id => {
        const item = ix.exprById.get(id);
        return item ? `<a class="ruled-row" href="${ctx.withFrom(`#/detail/${id}`, '#/study')}"><span class="mark is-wrong">✕</span><span class="ruled-en">${esc(item.english)}</span><span class="ruled-zh">${esc(item.chinese)}</span></a>` : '';
      }).join('')}</div>` : ''}
      <div class="focus-actions">
        <button type="button" class="btn btn-large" data-action="repeat-round">再巩固一遍</button>
        <a class="btn btn-large" href="#/quick-run/today">快速刷今日内容</a>
        <button type="button" class="btn btn-primary btn-large" data-action="finish">返回今日学习</button>
      </div>
    </section>
  </div>`;
}
