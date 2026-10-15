// Learning-day helpers.
//
// A learning day belongs to Asia/Shanghai (UTC+8, no daylight saving) and
// rolls over at 02:00 local time. So the business day of an instant is the
// calendar date of (instant + 8h - 2h) in UTC. Doing the arithmetic directly
// keeps this exact on any device time zone (e.g. an iPad set to Melbourne).

export const TIME_ZONE = 'Asia/Shanghai';
export const DAY_RESET_HOUR = 2;
const OFFSET_MS = (8 - DAY_RESET_HOUR) * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

let clockOverride = null;
/** Testing hook: freeze "now". Pass null to restore the real clock. */
export function setClock(value) { clockOverride = value == null ? null : new Date(value).getTime(); }
export function nowMs() { return clockOverride ?? Date.now(); }
export function nowISO() { return new Date(nowMs()).toISOString(); }

/** Business-day key (YYYY-MM-DD) for an instant. */
export function dayKey(value = nowMs()) {
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKey() { return dayKey(nowMs()); }

/** Add whole days to a YYYY-MM-DD key. */
export function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from key a to key b (b - a). */
export function diffDaysKey(a, b) {
  const toUTC = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** Midday (Beijing) instant of a business day, used for backfilled timestamps. */
export function middayISO(key) { return new Date(`${key}T12:00:00+08:00`).toISOString(); }

export function addDaysISO(iso, days) { return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString(); }

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
export function dayLabel(key = todayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}年${m}月${d}日 ${WEEKDAYS[weekday]}`;
}
export function shortDayLabel(key) {
  if (!key) return '—';
  const [, m, d] = key.split('-').map(Number);
  return `${m}月${d}日`;
}

/** Beijing-time timestamp with seconds, e.g. 2026/09/27 20:30:40. */
export function formatDateTime(value) {
  const ms = new Date(value ?? NaN).getTime();
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');
}
