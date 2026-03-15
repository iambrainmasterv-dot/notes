import type { DeadlineState } from './types';

const TIME_ONLY_RE = /^\d{2}:\d{2}$/;

/**
 * Parses a deadline string into a timestamp.
 * Handles ISO strings, local "YYYY-MM-DDTHH:mm", and time-only "HH:mm" (resolved to today).
 */
export function parseDeadline(deadline: string): number {
  if (TIME_ONLY_RE.test(deadline)) {
    const today = new Date();
    const [h, m] = deadline.split(':').map(Number);
    today.setHours(h, m, 0, 0);
    return today.getTime();
  }
  return new Date(deadline).getTime();
}

export function isTimeOnly(deadline?: string): boolean {
  return !!deadline && TIME_ONLY_RE.test(deadline);
}

/**
 * Returns a structured state object for a deadline.
 */
export function getDeadlineState(deadline: string, now: number): DeadlineState {
  const diff = parseDeadline(deadline) - now;

  if (diff <= 0) {
    return { label: 'Expired', expired: true, severity: 'expired' };
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  if (seconds < 60) {
    label = `${seconds}s`;
  } else if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    const rm = minutes % 60;
    label = rm > 0 ? `${hours}h ${rm}m` : `${hours}h`;
  } else {
    const rh = hours % 24;
    label = rh > 0 ? `${days}d ${rh}h` : `${days}d`;
  }

  let severity: DeadlineState['severity'];
  if (hours < 1) severity = 'urgent';
  else if (hours < 24) severity = 'soon';
  else severity = 'ok';

  return { label, expired: false, severity };
}

export function isExpired(deadline?: string, now?: number): boolean {
  if (!deadline) return false;
  return parseDeadline(deadline) < (now ?? Date.now());
}

export function nextCanvasPosition(existingCount: number): { x: number; y: number } {
  const cols = 3;
  const col = existingCount % cols;
  const row = Math.floor(existingCount / cols);
  return { x: 40 + col * 310, y: 40 + row * 230 };
}

export function toLocalInputValue(deadline: string): string {
  if (TIME_ONLY_RE.test(deadline)) return deadline;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
