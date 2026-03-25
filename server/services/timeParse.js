/**
 * Normalize deadline hints using the client's local offset (minutes from UTC).
 * Daily tasks use time-only "HH:mm" in app convention.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {string} phrase - e.g. "6 AM", "18:30", "before 6am"
 * @param {number} tzOffsetMinutes - Date.getTimezoneOffset() from browser (e.g. 300 for US Eastern)
 * @returns {{ timeHm: string } | null}
 */
export function parseTimePhraseToHm(phrase, tzOffsetMinutes) {
  if (!phrase || typeof phrase !== 'string') return null;
  const t = phrase.toLowerCase().trim();
  const m24 = t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const mm = m24[2];
    const ap = m24[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 0 || h > 23) return null;
    return { timeHm: `${pad2(h)}:${mm}` };
  }
  const m = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10);
    const ap = m[2];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 0 || h > 23) return null;
    return { timeHm: `${pad2(h)}:00` };
  }
  return null;
}

/**
 * @param {string} isoOrHm
 * @param {boolean} daily
 */
export function normalizeDeadlineForStorage(isoOrHm, daily) {
  if (!isoOrHm) return null;
  if (daily) {
    const s = String(isoOrHm).trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [hh, mm] = s.split(':');
      return `${pad2(parseInt(hh, 10))}:${pad2(parseInt(mm, 10))}`;
    }
    return s;
  }
  return String(isoOrHm).trim();
}
