import { parseDeadline, isTimeOnly } from '../utils';

/** Human-readable due date/time for notification copy (locale-aware). */
export function formatDeadlineForNotification(deadline: string): string {
  try {
    const t = parseDeadline(deadline);
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    if (isTimeOnly(deadline)) {
      return `${deadline} (today)`;
    }
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
