// #/study — the running new-learning / review session.
import { esc, icon, speak } from '../ui/dom.js';
import { todayKey } from '../core/time.js';
import { masteryOf } from '../core/selectors.js';
import {
  currentGroup, currentItemID, flowTotals, recognize, nextAfterDetail, previousCard,
  submitAnswer, nextAfterResult, nextGroup, isResumable, repeatFlow,
} from '../core/study.js';
import { toggleFavorite } from '../core/actions.js';
import { expressionInfo, answerReview, writingBox, masteryPill, progressBar } from './common.js';

const flowOf = state => state.sessions[0];

function stepper(flow) {
  const steps = [['认读', ['recognize', 'detail']], ['默写', ['dictation', 'result']], ['小结', ['groupDone']]];
  return `<ol class="stepper">${steps.map(([label, phases], index) => {
    const activeIndex = steps.findIndex(([, list]) => list.includes(flow.phase));
    return `<li class="${index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : ''}">${label}</li>`;
  }).join('')}</ol>`;
}

function topBar(ctx, flow) {
  const group = ctx.ix.groupById.get(currentGroup(flow)?.groupID);
  const { done, total } = flowTotals(flow);
  const entry = currentGroup(flow);
  let position = '';
  if (flow.phase === 'recognize' || flow.phase === 'detail') position = `第 ${flow.ii + 1} / ${entry.itemIDs.length} 条`;
  else if (flow.phase === 'dictation' || flow.phase === 'result') position = `默写 ${Math.min(flow.di + 1, flow.dictQueue.length)} / ${flow.dictQueue.length}`;
  const label = flow.repeat ? '再次巩固' : flow.type === 'new' ? '新学' : '复习';
  return `<div class="study-top">
    <a class="btn btn-ghost btn-small" href="#/today">${icon('back')} 退出（位置已保存）</a>
    <div class="study-top-mid">
      <div class="study-kicker">${label} · 第 ${flow.gi + 1} / ${flow.queue.length} 组 · ${esc(group?.name ?? '')}</div>
      ${progressBar(done, total)}
    </div>
    <div class="study-top-right">${stepper(flow)}<span class="study-pos">${position}</span></div>
  </div>`;
}

function toolButtons(ctx, expression) {
  return `<div class="card-tools">
    <button type="button" class="icon-btn" data-action="speak" title="播放发音" aria-label="播放发音">${icon('speaker')}</button>
    <button type="button" class="icon-btn ${expression.isFavorite ? 'is-on' : ''}" data-action="favorite" title="收藏" aria-label="收藏">${icon('star')}</button>
    <a class="icon-btn" href="${ctx.withFrom(`#/edit/${expression.id}`, '#/study')}" title="编辑" aria-label="编辑">${icon('edit')}</a>
  </div>`;
}

export const studyView = {
  area: 'today',
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
    const top = topBar(ctx, flow);

    if (flow.phase === 'groupDone') {
      const entry = currentGroup(flow);
      const group = ix.groupById.get(entry.groupID);
      const last = flow.gi + 1 >= flow.queue.length;
      return `<div class="page page-study">${top}
        <section class="study-card is-summary">
          <div class="eyebrow">GROUP DONE</div>
          <h2>${esc(group?.name ?? '')} · 本组完成</h2>
          <p class="muted">首次默写正确 ${entry.itemIDs.filter(itemID => flow.firstResult[itemID]).length} / ${entry.itemIDs.length} 条</p>
          <div class="summary-list">${entry.itemIDs.map(itemID => {
            const item = ix.exprById.get(itemID);
            if (!item) return '';
            const ok = flow.firstResult[itemID];
            return `<a class="summary-row" href="${ctx.withFrom(`#/detail/${itemID}`, '#/study')}"><span class="result-dot ${ok ? 'is-ok' : 'is-wrong'}">${icon(ok ? 'check' : 'x')}</span><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span>${flow.repeat ? '' : masteryPill(masteryOf(ix, itemID))}</a>`;
          }).join('')}</div>
          <div class="study-actions"><button type="button" class="btn btn-primary btn-large" data-action="next-group" data-autofocus>${last ? (flow.type === 'new' ? '完成今日新学' : '完成复习') : '进入下一组'} ${icon('chevron')}</button></div>
        </section></div>`;
    }

    if (!expression) return `<div class="page page-study">${top}<p>这条表达已被删除。</p><button class="btn" data-action="skip-missing">跳过</button></div>`;

    if (flow.phase === 'recognize') {
      return `<div class="page page-study">${top}
        <section class="study-card is-recognize">
          ${toolButtons(ctx, expression)}
          <div class="prompt-label">看到英文，你认识吗？</div>
          <div class="prompt-english">${esc(expression.english)}</div>
          <div class="study-actions is-split">
            <button type="button" class="btn btn-large btn-soft" data-action="recognize" data-value="0">不认识</button>
            <button type="button" class="btn btn-large btn-primary" data-action="recognize" data-value="1" data-autofocus>认识</button>
          </div>
          ${flow.ii > 0 ? '<button type="button" class="link-btn" data-action="prev">上一条</button>' : ''}
        </section></div>`;
    }

    if (flow.phase === 'detail') {
      const entry = currentGroup(flow);
      const last = flow.ii + 1 >= entry.itemIDs.length;
      const known = flow.recognized[id];
      return `<div class="page page-study">${top}
        <section class="study-card is-detail">
          ${toolButtons(ctx, expression)}
          <div class="self-mark ${known ? 'is-known' : 'is-unknown'}">${known ? '你选择了：认识' : '你选择了：不认识，多看一眼'}</div>
          ${expressionInfo(expression, { large: true })}
          <div class="study-actions">
            <button type="button" class="btn btn-ghost" data-action="prev">上一步</button>
            <button type="button" class="btn btn-primary btn-large" data-action="next-detail" data-autofocus>${last ? '本组看完，开始默写' : '下一条'} ${icon('chevron')}</button>
          </div>
        </section></div>`;
    }

    if (flow.phase === 'dictation') {
      const retry = (flow.attempts[id] ?? 0) > 0;
      return `<div class="page page-study">${top}
        <section class="study-card is-dictation">
          <div class="prompt-label">${retry ? '再写一次 · 写对才算通过' : '根据中文写出英文表达'}</div>
          <div class="prompt-chinese">${esc(expression.chinese)}</div>
          ${expression.writingPosition ? `<div class="prompt-hint">${esc(expression.writingPosition)}</div>` : ''}
          <form class="dictation-form" data-action="noop">
            ${writingBox('answer', flow.draft ?? '')}
            <div class="study-actions"><button type="button" class="btn btn-primary btn-large" data-action="submit">提交答案</button></div>
          </form>
          <p class="muted small center">忽略大小写、空格和标点。按回车也可以提交。</p>
        </section></div>`;
    }

    // result
    const correct = flow.correct;
    const moreInQueue = flow.di + 1 < flow.dictQueue.length;
    return `<div class="page page-study">${top}
      <section class="study-card is-result ${correct ? 'is-correct' : 'is-wrong'}">
        <div class="result-banner ${correct ? 'is-ok' : 'is-wrong'}">${icon(correct ? 'check' : 'x')}<span>${correct ? '写对了' : '这次没写对，本组最后会再写一次'}</span></div>
        <div class="result-english">${esc(expression.english)}</div>
        <div class="meaning-box">${esc(expression.chinese)}</div>
        ${answerReview(flow.answer, expression.english, correct)}
        <div class="study-actions">
          <a class="btn btn-ghost" href="${ctx.withFrom(`#/detail/${id}`, '#/study')}">查看详情</a>
          <button type="button" class="btn btn-primary btn-large" data-action="next-result" data-autofocus>${moreInQueue ? '下一条' : '本组小结'} ${icon('chevron')}</button>
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
    if (ctx.state.settings.autoPronunciationEnabled && flow && (flow.phase === 'recognize' || (flow.phase === 'result'))) {
      const expression = ctx.ix.exprById.get(currentItemID(flow));
      if (expression && root.dataset.spokenFor !== `${flow.phase}:${expression.id}`) {
        root.dataset.spokenFor = `${flow.phase}:${expression.id}`;
        speak(expression.english, ctx.state.settings.pronunciationLocale);
      }
    }
  },
  onLeave(ctx) {
    const flow = flowOf(ctx.state);
    if (flow?.phase === 'complete') ctx.commit(state => { state.sessions = []; }, { silent: true });
  },
  inputs: {
    draft: (el, ctx) => { const flow = flowOf(ctx.state); if (flow) { flow.draft = el.value; ctx.store.scheduleSave(); } },
  },
  actions: {
    noop: () => {},
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
    : flow.type === 'new' ? '已自动打卡。明天开始第一次复习。' : '本次复习已记录，下一次节点已排好。';
  return `<div class="page page-study">
    <section class="study-card is-complete">
      <div class="complete-mark">${icon('check')}</div>
      <h2>${title}</h2>
      <p class="muted">${note}</p>
      <div class="complete-stats">
        <div><strong>${total}</strong><span>条</span></div>
        <div><strong>${correct}</strong><span>首次写对</span></div>
        <div><strong>${flow.errors.length}</strong><span>首次写错</span></div>
      </div>
      ${flow.errors.length ? `<div class="summary-list">${flow.errors.map(id => {
        const item = ix.exprById.get(id);
        return item ? `<a class="summary-row" href="${ctx.withFrom(`#/detail/${id}`, '#/study')}"><span class="result-dot is-wrong">${icon('x')}</span><span class="mini-en">${esc(item.english)}</span><span class="mini-zh">${esc(item.chinese)}</span></a>` : '';
      }).join('')}</div>` : ''}
      <div class="study-actions is-wrap">
        <button type="button" class="btn btn-ghost" data-action="repeat-round">再次巩固一遍</button>
        <a class="btn btn-ghost" href="#/quick-run/today" data-action="finish-quick">快速刷今日内容</a>
        <button type="button" class="btn btn-primary btn-large" data-action="finish">返回今日学习</button>
      </div>
    </section>
  </div>`;
}
