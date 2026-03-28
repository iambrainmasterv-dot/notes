/** @typedef {'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'} Weekday */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const WEEKDAY_ALIASES = {
  sun: 'sunday',
  sunday: 'sunday',
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
};

/**
 * @param {unknown} raw
 * @returns {Weekday | null}
 */
export function normalizeWeekdayToken(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase().replace(/\.$/, '');
  return WEEKDAY_ALIASES[t] || null;
}

/**
 * @param {unknown} rules
 * @returns {{ weekdays: string[], monthDays: number[], yearlyDates: string[] }}
 */
export function normalizeScheduleRules(rules) {
  const out = { weekdays: [], monthDays: [], yearlyDates: [] };
  if (!rules || typeof rules !== 'object') return out;
  const r = /** @type {Record<string, unknown>} */ (rules);
  if (Array.isArray(r.weekdays)) {
    for (const w of r.weekdays) {
      const n = normalizeWeekdayToken(String(w));
      if (n && !out.weekdays.includes(n)) out.weekdays.push(n);
    }
  }
  if (Array.isArray(r.monthDays)) {
    for (const d of r.monthDays) {
      const n = Number(d);
      if (Number.isInteger(n) && n >= 1 && n <= 31 && !out.monthDays.includes(n)) out.monthDays.push(n);
    }
    out.monthDays.sort((a, b) => a - b);
  }
  if (Array.isArray(r.yearlyDates)) {
    for (const y of r.yearlyDates) {
      const s = normalizeYearlyDate(String(y));
      if (s && !out.yearlyDates.includes(s)) out.yearlyDates.push(s);
    }
    out.yearlyDates.sort();
  }
  return out;
}

/**
 * @param {string} s
 * @returns {string | null} MM-DD
 */
export function normalizeYearlyDate(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mm = Math.min(12, Math.max(1, parseInt(m[1], 10)));
  const dd = Math.min(31, Math.max(1, parseInt(m[2], 10)));
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} MM-DD
 */
export function dateStrToMmDd(dateStr) {
  return dateStr.length >= 10 ? dateStr.slice(5, 10) : '';
}

/**
 * @param {{ schedule_kind?: string, schedule_rules?: unknown, schedule_value?: string | null }} row
 * @param {string} dateStr YYYY-MM-DD (calendar date in user's app-day sense; client sends app date string)
 */
export function templateMatchesOccurrence(row, dateStr) {
  const kind = String(row.schedule_kind || 'none').toLowerCase();
  const rules = normalizeScheduleRules(row.schedule_rules);

  if (kind === 'none') return false;
  if (kind === 'daily') return true;

  if (kind === 'weekdays') {
    if (rules.weekdays.length === 0) return false;
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    const wd = WEEKDAYS[d.getDay()];
    return rules.weekdays.includes(wd);
  }

  if (kind === 'dates') {
    if (rules.monthDays.length === 0) return false;
    const dom = parseInt(dateStr.slice(8, 10), 10);
    if (!Number.isFinite(dom)) return false;
    return rules.monthDays.includes(dom);
  }

  if (kind === 'more') {
    if (rules.yearlyDates.length === 0) return false;
    const mmdd = dateStrToMmDd(dateStr);
    return rules.yearlyDates.includes(mmdd);
  }

  // Legacy rows (should be migrated)
  if (kind === 'weekday' && row.schedule_value) {
    const d = new Date(`${dateStr}T12:00:00`);
    const wd = WEEKDAYS[d.getDay()];
    const want = normalizeWeekdayToken(row.schedule_value);
    return want === wd;
  }
  if (kind === 'date' && row.schedule_value) {
    return dateStrToMmDd(dateStr) === normalizeYearlyDate(row.schedule_value);
  }

  return false;
}

/**
 * Whether materialized rows from this template should be removed at end of occurrence day.
 * @param {{ schedule_kind?: string }} templateRow
 */
export function templateKindGetsEndOfDayCleanup(templateRow) {
  const kind = String(templateRow.schedule_kind || 'none').toLowerCase();
  return kind !== 'none';
}

/**
 * @param {{ deadline_time?: string | null }[]} items
 */
export function templateItemsHaveAnyTime(items) {
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    const t = it?.deadline_time;
    return typeof t === 'string' && t.trim() !== '';
  });
}
