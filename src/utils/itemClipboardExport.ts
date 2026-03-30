import type { Note, Task } from '../types';
import { childrenOf, type ItemParentRef } from '../utils';
import { api } from '../api/client';

function byTitleNote(a: Note, b: Note): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function byTitleTask(a: Task, b: Task): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function linesForNote(n: Note, indent: string): string[] {
  const out: string[] = [`${indent}Note: ${n.title}`];
  if (n.description?.trim()) {
    const d = n.description.trim();
    out.push(`${indent}  Description: ${d.replace(/\n/g, `\n${indent}  `)}`);
  }
  if (n.deadline) out.push(`${indent}  Deadline: ${n.deadline}`);
  if (n.completed) out.push(`${indent}  Status: completed`);
  return out;
}

function linesForTask(t: Task, indent: string): string[] {
  const out: string[] = [`${indent}Task: ${t.title} (progress ${t.progress} / target ${t.target})`];
  if (t.description?.trim()) {
    const d = t.description.trim();
    out.push(`${indent}  Description: ${d.replace(/\n/g, `\n${indent}  `)}`);
  }
  if (t.deadline) out.push(`${indent}  Deadline: ${t.deadline}`);
  if (t.completed) out.push(`${indent}  Status: completed`);
  return out;
}

function walk(
  ref: ItemParentRef,
  item: Note | Task,
  depth: number,
  notes: Note[],
  tasks: Task[],
  out: string[],
): void {
  const ind = '  '.repeat(depth);
  if (ref.type === 'note') {
    out.push(...linesForNote(item as Note, ind));
  } else {
    out.push(...linesForTask(item as Task, ind));
  }
  const { childNotes, childTasks } = childrenOf(ref, notes, tasks);
  const sortedNotes = [...childNotes].sort(byTitleNote);
  const sortedTasks = [...childTasks].sort(byTitleTask);
  for (const cn of sortedNotes) {
    walk({ type: 'note', id: cn.id }, cn, depth + 1, notes, tasks, out);
  }
  for (const ct of sortedTasks) {
    walk({ type: 'task', id: ct.id }, ct, depth + 1, notes, tasks, out);
  }
}

export function buildPlainTextItemTree(
  rootType: 'note' | 'task',
  root: Note | Task,
  allNotes: Note[],
  allTasks: Task[],
): string {
  const out: string[] = [];
  walk({ type: rootType, id: root.id }, root, 0, allNotes, allTasks, out);
  return out.join('\n');
}

export async function writeTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through */
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('Clipboard copy is not supported in this browser.');
  } finally {
    document.body.removeChild(ta);
  }
}

export async function copyItemToClipboard(opts: {
  rootType: 'note' | 'task';
  root: Note | Task;
  allNotes: Note[];
  allTasks: Task[];
  jarvisReady: boolean;
}): Promise<void> {
  const plain = buildPlainTextItemTree(opts.rootType, opts.root, opts.allNotes, opts.allTasks);
  let text = plain;
  if (opts.jarvisReady) {
    const r = await api.aiFormatItemCopy(plain);
    text = typeof r.text === 'string' ? r.text : plain;
  }
  await writeTextToClipboard(text);
}
