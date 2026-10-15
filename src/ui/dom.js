// Small DOM helpers: escaping, icons, toast and modal dialogs.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  library: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z"/><path d="M8 7h7M8 11h5"/>',
  plan: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  quick: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  favorites: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  checkin: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  play: '<path d="M7 5v14l11-7L7 5Z"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  expand: '<path d="m7 9 5 5 5-5"/>',
  collapse: '<path d="m7 15 5-5 5 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
};

export function icon(name, extraClass = '') {
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
}

// ---------- Toast ----------
let toastTimer = null;
export function toast(message, tone = 'default') {
  let node = $('#toast');
  if (!node) { node = document.createElement('div'); node.id = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.className = `toast is-${tone}`;
  node.textContent = message;
  requestAnimationFrame(() => node.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
}

// ---------- Modal ----------
/**
 * Open a modal. `body` is HTML. Buttons: [{label, value, tone}].
 * Resolves with { value, form } where form maps input names to values.
 */
export function modal({ title, body = '', buttons = [{ label: '取消', value: null }, { label: '确定', value: true, tone: 'primary' }], wide = false, onMount }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal ${wide ? 'is-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2 class="modal-title">${esc(title)}</h2>
      <form class="modal-body" novalidate>${body}</form>
      <div class="modal-actions">${buttons.map((button, index) => `<button type="button" class="btn ${button.tone ? `btn-${button.tone}` : ''}" data-modal-index="${index}">${esc(button.label)}</button>`).join('')}</div>
    </div>`;
    const form = backdrop.querySelector('form');
    const collect = () => Object.fromEntries([...form.elements].filter(el => el.name).map(el => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
    const close = value => {
      backdrop.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => backdrop.remove(), 180);
      resolve({ value, form: collect() });
    };
    const onKey = event => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
        const primary = buttons.findIndex(button => button.tone === 'primary' || button.tone === 'danger');
        if (primary >= 0) close(buttons[primary].value);
      }
    };
    backdrop.addEventListener('click', event => {
      const button = event.target.closest('[data-modal-index]');
      if (button) close(buttons[Number(button.dataset.modalIndex)].value);
      else if (event.target === backdrop) close(null);
    });
    form.addEventListener('submit', event => event.preventDefault());
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    onMount?.(backdrop, close);
    setTimeout(() => backdrop.querySelector('input:not([type=hidden]),textarea,select')?.focus(), 60);
  });
}

export async function confirmDialog(title, message, { okLabel = '确定', tone = 'primary' } = {}) {
  const { value } = await modal({ title, body: `<p class="modal-text">${message}</p>`, buttons: [{ label: '取消', value: false }, { label: okLabel, value: true, tone }] });
  return value === true;
}

export async function promptDialog(title, { label = '', value = '', placeholder = '' } = {}) {
  const result = await modal({ title, body: `<label class="field"><span>${esc(label)}</span><input name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" /></label>` });
  return result.value ? result.form.value.trim() : null;
}

// ---------- Popover menu ----------
/** Show a small menu next to `anchor`; resolves with the chosen value or null. */
export function openMenu(anchor, items) {
  document.querySelector('.popover')?.dispatchEvent(new Event('dismiss'));
  return new Promise(resolve => {
    const menu = document.createElement('div');
    menu.className = 'popover';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((item, index) => `<button type="button" role="menuitem" class="popover-item ${item.tone ? `is-${item.tone}` : ''}" data-index="${index}">${item.icon ? icon(item.icon) : ''}<span>${esc(item.label)}</span></button>`).join('');
    document.body.append(menu);
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth; const height = menu.offsetHeight;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    const top = rect.bottom + 6 + height > window.innerHeight - 12 ? rect.top - height - 6 : rect.bottom + 6;
    menu.style.left = `${left}px`; menu.style.top = `${Math.max(12, top)}px`;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    const done = value => {
      document.removeEventListener('pointerdown', outside, true);
      menu.remove();
      resolve(value);
    };
    const outside = event => { if (!menu.contains(event.target)) done(null); };
    menu.addEventListener('dismiss', () => done(null));
    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-index]');
      if (button) done(items[Number(button.dataset.index)].value);
    });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  });
}

/**
 * Distinguish single and double taps on touch and mouse alike
 * (iPad Safari does not fire dblclick reliably).
 */
export function onTap(element, { single, double, delay = 280 }) {
  let timer = null; let last = 0; let startX = 0; let startY = 0; let moved = false;
  element.addEventListener('pointerdown', event => { startX = event.clientX; startY = event.clientY; moved = false; });
  element.addEventListener('pointermove', event => { if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) moved = true; });
  element.addEventListener('click', event => {
    if (moved || element.dataset.suppressClick === '1') { element.dataset.suppressClick = ''; return; }
    if (event.target.closest('button, a, input, select, textarea') && event.target.closest('button, a, input, select, textarea') !== element) return;
    event.preventDefault();
    const now = Date.now();
    if (double && now - last < delay) { clearTimeout(timer); last = 0; double(event); return; }
    last = now;
    clearTimeout(timer);
    if (!double) { single?.(event); return; }
    timer = setTimeout(() => single?.(event), delay);
  });
}

export function speak(text, locale = 'en-US') {
  if (!text || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/\bsb\.?/g, 'somebody').replace(/\bsth\.?/g, 'something'));
  utterance.lang = locale;
  const voice = window.speechSynthesis.getVoices().find(item => item.lang === locale);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
