// Detail, edit, add and single-item practice pages. All carry ?from= so
// "返回" goes back to wherever the user came from.
import { esc, icon, speak, toast, confirmDialog } from '../ui/dom.js';
import { formatDateTime, shortDayLabel, todayKey } from '../core/time.js';
import { masteryOf, categoryLabel, reviewLabel } from '../core/selectors.js';
import { REVIEW_INTERVALS, NODE_LABELS, nodeStatus, nodeDueDay, nextDueDay } from '../core/srs.js';
import { gradeAnswer } from '../core/grading.js';
import { toggleFavorite, updateExpression, deleteExpression, addExpression, createGroup } from '../core/actions.js';
import { pageHead, expressionInfo, masteryPill, answerReview, writingBox, segmented, categoryBadge } from './common.js';

const fromOf = (ctx, fallback = '#/library') => ctx.route.query.get('from') || fallback;
const fromLabel = from => {
  const name = from.replace(/^#\//, '').split(/[/?]/)[0];
  return ({ today: '今日学习', library: '表达库', plan: '掌握与计划', quick: '快速刷词', 'quick-run': '快速刷词', 'wrong-dictation': '错词默写', favorites: '我的收藏', study: '回到学习', detail: '详情', checkin: '打卡日历' })[name] ?? '返回';
};

export const detailView = {
  area: 'library',
  title: '表达详情',
  guard: ctx => (ctx.ix.exprById.has(ctx.route.params[0]) ? null : fromOf(ctx)),
  render(ctx) {
    const { ix } = ctx;
    const id = ctx.route.params[0];
    const expression = ix.exprById.get(id);
    const group = ix.groupById.get(expression.groupID);
    const progress = ix.progressById.get(id);
    const from = fromOf(ctx);
    const today = todayKey();
    const mastery = masteryOf(ix, id);
    const next = reviewLabel(nextDueDay(progress), today);
    const here = ctx.here;
    const track = REVIEW_INTERVALS.map((days, node) => {
      const status = nodeStatus(progress, node, today);
      const due = nodeDueDay(progress, node);
      return `<li class="node is-${status}"><span class="node-name">${NODE_LABELS[node]}</span><span class="node-date">${due ? shortDayLabel(due) : '—'}</span><span class="node-state">${({ done: '完成', today: '今日', overdue: '逾期', future: '未到', locked: '—' })[status]}</span></li>`;
    }).join('');
    const attempts = (progress?.accuracyAttempts ?? []).slice().reverse().slice(0, 12).map(item => {
      const [kind, a, b] = String(item.key).split(':');
      const label = kind === 'new' ? `新学 ${a}` : `${NODE_LABELS[Number(a)] ?? '复习'} ${b ?? ''}`;
      return `<li><span class="result-dot ${item.correct ? 'is-ok' : 'is-wrong'}">${icon(item.correct ? 'check' : 'x')}</span>${esc(label)}</li>`;
    }).join('');
    return `<div class="page page-detail">
      ${pageHead({
        backHref: from, backLabel: fromLabel(from), eyebrow: 'EXPRESSION', title: group?.name ?? '表达详情',
        sub: `${categoryBadge(group?.category)} <span class="sep">·</span> 本组第 ${(ix.exprsByGroup.get(expression.groupID) ?? []).indexOf(expression) + 1} / ${(ix.exprsByGroup.get(expression.groupID) ?? []).length} 条`,
        actions: `<button type="button" class="btn" data-action="speak">${icon('speaker')} 播放发音</button>
          <button type="button" class="btn ${expression.isFavorite ? 'is-fav' : ''}" data-action="favorite">${icon('star')} ${expression.isFavorite ? '已收藏' : '收藏'}</button>
          <a class="btn" href="${ctx.withFrom(`#/practice/${id}`, here)}">${icon('pen')} 默写练习</a>
          <a class="btn" href="${ctx.withFrom(`#/edit/${id}`, here)}">${icon('edit')} 编辑</a>`,
      })}
      <div class="detail-grid">
        <article class="panel detail-main">${expressionInfo(expression, { large: true })}</article>
        <aside class="detail-side">
          <div class="panel">
            <div class="side-stats">
              <div><span>掌握度</span>${masteryPill(mastery)}</div>
              <div><span>下一复习</span><strong class="tone-${next.tone}">${progress?.firstLearnedAt ? next.label : '尚未学习'}</strong></div>
              <div><span>首次学习</span><strong>${progress?.firstLearnedAt ? formatDateTime(progress.firstLearnedAt) : '—'}</strong></div>
              <div><span>错误次数</span><strong>${progress?.errorCount ?? 0}</strong></div>
            </div>
            <ol class="node-track">${track}</ol>
          </div>
          ${attempts ? `<div class="panel"><h3 class="panel-title">最近默写记录</h3><ul class="attempt-list">${attempts}</ul></div>` : ''}
        </aside>
      </div>
    </div>`;
  },
  mount(root, ctx) {
    if (ctx.state.settings.autoPronunciationEnabled) {
      const expression = ctx.ix.exprById.get(ctx.route.params[0]);
      speak(expression?.english, ctx.state.settings.pronunciationLocale);
    }
  },
  actions: {
    speak: (el, ctx) => { if (!speak(ctx.ix.exprById.get(ctx.route.params[0])?.english, ctx.state.settings.pronunciationLocale)) throw new Error('当前浏览器不支持发音'); },
    favorite: (el, ctx) => {
      const on = ctx.commit(state => toggleFavorite(state, ctx.route.params[0]));
      toast(on ? '已加入收藏' : '已取消收藏');
    },
  },
};

// ---------- Edit / add form ----------

function groupOptions(ix, category, selectedID) {
  return [...ix.state.groups].filter(group => group.category === category).sort((a, b) => a.sortOrder - b.sortOrder)
    .map(group => `<option value="${group.id}" ${group.id === selectedID ? 'selected' : ''}>${esc(group.name)}（${(ix.exprsByGroup.get(group.id) ?? []).length}）</option>`).join('');
}

function formFields(values) {
  const field = (name, label, { multiline = false, required = false, hint = '' } = {}) => `<label class="field">
      <span>${label}${required ? ' <em>*</em>' : ''}${hint ? `<small>${hint}</small>` : ''}</span>
      ${multiline ? `<textarea name="${name}" rows="2" autocapitalize="none" autocorrect="off" spellcheck="false">${esc(values[name] ?? '')}</textarea>`
        : `<input name="${name}" value="${esc(values[name] ?? '')}" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" ${required ? 'required' : ''} />`}
    </label>`;
  return `<div class="form-grid">
    ${field('english', '单词 / 短语', { required: true })}
    ${field('phonetic', '（美）音标')}
    ${field('chinese', '简短中文释义', { required: true })}
    ${field('example', '例句', { multiline: true })}
    ${field('writingPosition', '拓展 / 写作位置', { multiline: true })}
    ${field('notes', '备注与易错点', { multiline: true })}
  </div>`;
}

function readForm(root) {
  const form = root.querySelector('form.expr-form');
  return Object.fromEntries(new FormData(form).entries());
}

export const editView = {
  area: 'library',
  title: '编辑表达',
  initialUI: {},
  guard: ctx => (ctx.ix.exprById.has(ctx.route.params[0]) ? null : fromOf(ctx)),
  render(ctx) {
    const { ix, ui } = ctx;
    const id = ctx.route.params[0];
    const expression = ix.exprById.get(id);
    if (ui.id !== id) { ui.id = id; ui.category = ix.groupById.get(expression.groupID)?.category ?? 'expression'; ui.groupID = expression.groupID; }
    return `<div class="page page-form">
      ${pageHead({ backHref: fromOf(ctx), backLabel: '取消', eyebrow: 'EDIT', title: '编辑表达', sub: '修改会同步到表达库、今日词表、复习队列、错词本和详情；学习进度保持不变。' })}
      <form class="panel expr-form" autocomplete="off">
        <div class="form-row">
          <div class="control"><span class="control-label">大类</span>${segmented([['expression', '表达积累'], ['vocabulary', '词汇积累']], ui.category, 'set-category')}</div>
          <label class="field field-inline"><span>分组</span><select name="groupID" class="input" data-change="group">${groupOptions(ix, ui.category, ui.groupID)}</select></label>
        </div>
        ${formFields(expression)}
        <div class="form-actions">
          <button type="button" class="btn btn-danger-ghost" data-action="delete">${icon('trash')} 删除这条</button>
          <span class="spacer"></span>
          <a class="btn btn-ghost" href="${esc(fromOf(ctx))}">取消</a>
          <button type="button" class="btn btn-primary" data-action="save">保存</button>
        </div>
      </form>
    </div>`;
  },
  actions: {
    'set-category': (el, ctx) => {
      ctx.ui.category = el.dataset.value;
      const first = [...ctx.state.groups].filter(group => group.category === ctx.ui.category).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      ctx.ui.groupID = first?.id ?? null;
      preserveForm(ctx);
    },
    save: (el, ctx) => {
      const values = readForm(document);
      if (!values.groupID) throw new Error('请选择分组');
      if (!values.english?.trim()) throw new Error('请填写单词 / 短语');
      ctx.commit(state => updateExpression(state, ctx.route.params[0], values));
      ctx.ui.id = null;
      toast('已保存');
      ctx.go(fromOf(ctx));
    },
    delete: async (el, ctx) => {
      const expression = ctx.ix.exprById.get(ctx.route.params[0]);
      if (!await confirmDialog('删除这条表达？', `「${esc(expression.english)}」及其学习记录会一并删除，无法撤销。`, { okLabel: '删除', tone: 'danger' })) return;
      const from = fromOf(ctx);
      ctx.commit(state => deleteExpression(state, expression.id));
      toast('已删除');
      ctx.go(from.includes(`/detail/${expression.id}`) ? '#/library' : from);
    },
  },
  changes: { group: (el, ctx) => { ctx.ui.groupID = el.value; } },
};

/** Re-render while keeping what the user already typed. */
function preserveForm(ctx) {
  const values = readForm(document);
  ctx.rerender();
  const form = document.querySelector('form.expr-form');
  if (!form) return;
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements[name];
    if (input && name !== 'groupID') input.value = value;
  }
}

export const addView = {
  area: 'library',
  title: '添加表达',
  initialUI: { category: null, groupID: null },
  render(ctx) {
    const { ix, ui, route } = ctx;
    const presetGroup = ix.groupById.get(route.query.get('group'));
    if (presetGroup && ui.preset !== presetGroup.id) { ui.preset = presetGroup.id; ui.category = presetGroup.category; ui.groupID = presetGroup.id; }
    ui.category ??= 'expression';
    const options = groupOptions(ix, ui.category, ui.groupID);
    return `<div class="page page-form">
      ${pageHead({ backHref: fromOf(ctx), backLabel: '返回', eyebrow: 'ADD', title: '添加表达', sub: '先选大类，再选该大类下的分组。' })}
      <form class="panel expr-form" autocomplete="off">
        <div class="form-row">
          <div class="control"><span class="control-label">大类</span>${segmented([['expression', '表达积累'], ['vocabulary', '词汇积累']], ui.category, 'set-category')}</div>
          <label class="field field-inline"><span>分组</span>
            <select name="groupID" class="input" data-change="group">
              <option value="" ${ui.groupID ? '' : 'selected'} disabled>选择分组…</option>
              ${options}
              <option value="__new">＋ 新建分组…</option>
            </select>
          </label>
          ${ui.groupID === '__new' ? `<label class="field field-inline"><span>新分组名称</span><input name="newGroupName" class="input" placeholder="例如：描写作者语气" /></label>` : ''}
        </div>
        ${formFields({})}
        <div class="form-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="save" data-value="more">保存并继续添加</button>
          <button type="button" class="btn btn-primary" data-action="save" data-value="done">保存</button>
        </div>
      </form>
    </div>`;
  },
  actions: {
    'set-category': (el, ctx) => { ctx.ui.category = el.dataset.value; ctx.ui.groupID = null; preserveForm(ctx); },
    save: (el, ctx) => {
      const values = readForm(document);
      if (!values.english?.trim()) throw new Error('请填写单词 / 短语');
      let groupID = values.groupID;
      if (!groupID) throw new Error('请选择分组');
      const created = ctx.commit(state => {
        if (groupID === '__new') {
          const name = (values.newGroupName ?? '').trim();
          if (!name) throw new Error('请填写新分组名称');
          groupID = createGroup(state, { name, category: ctx.ui.category }).id;
        }
        return addExpression(state, groupID, values);
      });
      ctx.ui.groupID = groupID;
      toast(`已添加「${created.english}」`);
      if (el.dataset.value === 'more') {
        ctx.rerender();
        const form = document.querySelector('form.expr-form');
        form?.elements.english?.focus();
      } else {
        ctx.ui.preset = null;
        ctx.go(fromOf(ctx));
      }
    },
  },
  changes: { group: (el, ctx) => { ctx.ui.groupID = el.value; if (el.value === '__new') preserveForm(ctx); } },
};

// ---------- Practice (does not touch progress) ----------

export const practiceView = {
  area: 'library',
  title: '默写练习',
  initialUI: { id: null, phase: 'writing', answer: '', correct: null },
  guard: ctx => (ctx.ix.exprById.has(ctx.route.params[0]) ? null : fromOf(ctx)),
  render(ctx) {
    const { ix, ui } = ctx;
    const id = ctx.route.params[0];
    if (ui.id !== id) Object.assign(ui, { id, phase: 'writing', answer: '', correct: null });
    const expression = ix.exprById.get(id);
    const from = fromOf(ctx);
    return `<div class="page page-study">
      ${pageHead({ backHref: from, backLabel: fromLabel(from), eyebrow: 'PRACTICE', title: '默写练习', sub: '只用于巩固，不改变掌握度、复习计划或错词本。' })}
      <section class="study-card ${ui.phase === 'result' ? (ui.correct ? 'is-correct' : 'is-wrong') : 'is-dictation'}">
        <div class="prompt-label">根据中文写出英文表达</div>
        <div class="prompt-chinese">${esc(expression.chinese)}</div>
        ${ui.phase === 'result'
          ? `<div class="result-banner ${ui.correct ? 'is-ok' : 'is-wrong'}">${icon(ui.correct ? 'check' : 'x')}<span>${ui.correct ? '写对了' : '再看一眼'}</span></div>
             ${answerReview(ui.answer, expression.english, ui.correct)}
             <div class="study-actions"><button type="button" class="btn btn-ghost" data-action="retry">再练一次</button><a class="btn btn-primary" href="${esc(from)}">完成</a></div>`
          : `${writingBox('answer', ui.answer)}<div class="study-actions"><button type="button" class="btn btn-primary btn-large" data-action="submit">提交</button></div>`}
      </section>
    </div>`;
  },
  mount(root, ctx) {
    const box = root.querySelector('#answer');
    if (!box) return;
    setTimeout(() => box.focus({ preventScroll: true }), 30);
    box.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); practiceView.actions.submit(null, ctx); } });
  },
  inputs: { draft: (el, ctx) => { ctx.ui.answer = el.value; } },
  actions: {
    submit: (el, ctx) => {
      const expression = ctx.ix.exprById.get(ctx.route.params[0]);
      const answer = document.querySelector('#answer')?.value ?? '';
      if (!answer.trim()) return;
      Object.assign(ctx.ui, { phase: 'result', answer, correct: gradeAnswer(answer, expression.english) });
      ctx.rerender();
    },
    retry: (el, ctx) => { Object.assign(ctx.ui, { phase: 'writing', answer: '', correct: null }); ctx.rerender(); },
  },
};

export { categoryLabel };
