import type { Weekday } from '../types';

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const ALIASES: Record<string, Weekday> = {
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

export function normalizeWeekdayToken(raw: string): Weekday | null {
  const t = raw.trim().toLowerCase().replace(/\.$/, '');
  return ALIASES[t] ?? null;
}

export interface NormalizedScheduleRules {
  weekdays: Weekday[];
  monthDays: number[];
  yearlyDates: string[];
}

export function normalizeScheduleRules(rules: unknown): NormalizedScheduleRules {
  const out: NormalizedScheduleRules = { weekdays: [], monthDays: [], yearlyDates: [] };
  if (!rules || typeof rules !== 'object') return out;
  const r = rules as Record<string, unknown>;
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

export function normalizeYearlyDate(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mm = Math.min(12, Math.max(1, parseInt(m[1], 10)));
  const dd = Math.min(31, Math.max(1, parseInt(m[2], 10)));
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function dateStrToMmDd(dateStr: string): string {
  return dateStr.length >= 10 ? dateStr.slice(5, 10) : '';
}

export function templateMatchesOccurrence(
  row: { scheduleKind: string; scheduleRules: unknown; scheduleValue: string | null },
  dateStr: string,
): boolean {
  const kind = String(row.scheduleKind || 'none').toLowerCase();
  const rules = normalizeScheduleRules(row.scheduleRules);

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

  if (kind === 'weekday' && row.scheduleValue) {
    const d = new Date(`${dateStr}T12:00:00`);
    const wd = WEEKDAYS[d.getDay()];
    const want = normalizeWeekdayToken(row.scheduleValue);
    return want === wd;
  }
  if (kind === 'date' && row.scheduleValue) {
    const nv = normalizeYearlyDate(row.scheduleValue);
    return nv !== null && dateStrToMmDd(dateStr) === nv;
  }

  return false;
}
