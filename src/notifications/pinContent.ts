import type { Note, Task } from '../types';
import { formatDeadlineForNotification } from './deadlineFormat';

function dueFragment(deadline?: string): string {
  if (!deadline) return '';
  const d = formatDeadlineForNotification(deadline);
  return d ? ` · Due ${d}` : '';
}

/** Collapsed notification line (also used for pin signature / reschedule diff). */
export function pinBody(item: Note | Task): string {
  const due = dueFragment(item.deadline);
  if (item.type === 'task') {
    const main =
      item.target > 1 ? `Progress ${item.progress}/${item.target}` : item.description?.slice(0, 120) || 'Task';
    return `${main}${due}`;
  }
  const main = item.description?.slice(0, 200) || 'Note';
  return `${main}${due}`;
}

/** Expanded BigText on Android when there is a description (deadline is already in the collapsed line). */
export function pinLargeBody(item: Note | Task): string | undefined {
  if (!item.description?.trim()) return undefined;
  const lines = [item.description.trim()];
  if (item.deadline) {
    const d = formatDeadlineForNotification(item.deadline);
    if (d) lines.push(`Due: ${d}`);
  }
  return lines.join('\n\n');
}
