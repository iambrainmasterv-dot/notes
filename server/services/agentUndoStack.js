import { pool } from '../db.js';

const MAX_STACK = 50;
/** @type {Map<string, object[]>} */
const stacks = new Map();

/**
 * @param {string} userId
 * @param {object} entry
 */
export function pushAgentUndo(userId, entry) {
  if (!userId || !entry?.type) return;
  if (!stacks.has(userId)) stacks.set(userId, []);
  const arr = stacks.get(userId);
  arr.push({ ...entry, pushedAt: Date.now() });
  while (arr.length > MAX_STACK) arr.shift();
}

/**
 * @param {string} userId
 * @param {number} limit
 */
export function formatUndoListForAgent(userId, limit = 12) {
  const arr = stacks.get(userId) || [];
  const slice = arr.slice(-limit);
  return slice.map((e, i) => ({
    index_from_last: slice.length - i,
    label: e.label || e.type,
    type: e.type,
  })).reverse();
}

async function bulkDeleteNotesTasks(userId, noteIds, taskIds) {
  const n = noteIds?.length ? noteIds : [];
  const t = taskIds?.length ? taskIds : [];
  if (t.length) await pool.query('DELETE FROM tasks WHERE id = ANY($1::uuid[]) AND user_id = $2', [t, userId]);
  if (n.length) await pool.query('DELETE FROM notes WHERE id = ANY($1::uuid[]) AND user_id = $2', [n, userId]);
}

/**
 * @param {object} n
 * @param {Set<string>} done
 * @param {Set<string>} noteIds
 * @param {Set<string>} taskIds
 */
function parentReadyForNote(n, done, noteIds, taskIds) {
  const pid = n.parent_id;
  if (!pid) return true;
  const pt = n.parent_type || 'note';
  if (pt === 'task') {
    if (taskIds.has(pid)) return done.has(pid);
    return true;
  }
  if (noteIds.has(pid)) return done.has(pid);
  return true;
}

/**
 * @param {object} t
 * @param {Set<string>} done
 * @param {Set<string>} noteIds
 * @param {Set<string>} taskIds
 */
function parentReadyForTask(t, done, noteIds, taskIds) {
  const pid = t.parent_id;
  if (!pid) return true;
  const pt = t.parent_type || 'note';
  if (pt === 'task') {
    if (taskIds.has(pid)) return done.has(pid);
    return true;
  }
  if (noteIds.has(pid)) return done.has(pid);
  return true;
}

/**
 * @param {string} userId
 * @param {object[]} notes
 * @param {object[]} tasks
 */
async function restoreNotesTasksGraph(userId, notes, tasks) {
  const noteIds = new Set(notes.map((n) => n.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const done = new Set();
  let guard = 0;
  while (done.size < notes.length + tasks.length && guard < 200) {
    guard += 1;
    let progressed = false;
    for (const n of notes) {
      if (done.has(n.id)) continue;
      if (n.user_id && n.user_id !== userId) throw new Error('undo: user mismatch');
      if (!parentReadyForNote(n, done, noteIds, taskIds)) continue;
      await pool.query(
        `INSERT INTO notes (id, user_id, title, description, completed, created_at, deadline, parent_id, parent_type, position_x, position_y, collapsed, daily, source_schedule_template_id, source_occurrence_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          n.id,
          userId,
          n.title,
          n.description ?? '',
          n.completed,
          n.created_at,
          n.deadline ?? null,
          n.parent_id ?? null,
          n.parent_type ?? null,
          n.position_x ?? null,
          n.position_y ?? null,
          n.collapsed ?? false,
          n.daily ?? false,
          n.source_schedule_template_id ?? null,
          n.source_occurrence_date ?? null,
        ],
      );
      done.add(n.id);
      progressed = true;
    }
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      if (t.user_id && t.user_id !== userId) throw new Error('undo: user mismatch');
      if (!parentReadyForTask(t, done, noteIds, taskIds)) continue;
      await pool.query(
        `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type, source_schedule_template_id, source_occurrence_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          t.id,
          userId,
          t.title,
          t.description ?? '',
          t.completed,
          t.created_at,
          t.deadline ?? null,
          t.target ?? 10,
          t.progress ?? 0,
          t.daily ?? false,
          t.parent_id ?? null,
          t.parent_type ?? null,
          t.source_schedule_template_id ?? null,
          t.source_occurrence_date ?? null,
        ],
      );
      done.add(t.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  if (done.size < notes.length + tasks.length) {
    throw new Error('Could not restore deleted items (parent order).');
  }
}

/**
 * @param {string} userId
 * @param {object} before
 */
async function restoreNoteRow(userId, before) {
  if (before.user_id && before.user_id !== userId) throw new Error('undo: user mismatch');
  await pool.query(
    `UPDATE notes SET title=$1, description=$2, completed=$3, created_at=$4, deadline=$5, parent_id=$6, parent_type=$7, position_x=$8, position_y=$9, collapsed=$10, daily=$11, source_schedule_template_id=$12, source_occurrence_date=$13
     WHERE id=$14 AND user_id=$15`,
    [
      before.title,
      before.description ?? '',
      before.completed,
      before.created_at,
      before.deadline ?? null,
      before.parent_id ?? null,
      before.parent_type ?? null,
      before.position_x ?? null,
      before.position_y ?? null,
      before.collapsed ?? false,
      before.daily ?? false,
      before.source_schedule_template_id ?? null,
      before.source_occurrence_date ?? null,
      before.id,
      userId,
    ],
  );
}

/**
 * @param {string} userId
 * @param {object} before
 */
async function restoreTaskRow(userId, before) {
  if (before.user_id && before.user_id !== userId) throw new Error('undo: user mismatch');
  await pool.query(
    `UPDATE tasks SET title=$1, description=$2, completed=$3, created_at=$4, deadline=$5, target=$6, progress=$7, daily=$8, parent_id=$9, parent_type=$10, source_schedule_template_id=$11, source_occurrence_date=$12
     WHERE id=$13 AND user_id=$14`,
    [
      before.title,
      before.description ?? '',
      before.completed,
      before.created_at,
      before.deadline ?? null,
      before.target ?? 10,
      before.progress ?? 0,
      before.daily ?? false,
      before.parent_id ?? null,
      before.parent_type ?? null,
      before.source_schedule_template_id ?? null,
      before.source_occurrence_date ?? null,
      before.id,
      userId,
    ],
  );
}

/**
 * @param {string} userId
 * @param {object} tpl
 * @param {object[]} items
 */
async function restoreScheduleTemplateState(userId, tpl, items) {
  if (tpl.user_id && tpl.user_id !== userId) throw new Error('undo: user mismatch');
  await pool.query('DELETE FROM schedule_template_items WHERE template_id = $1', [tpl.id]);
  await pool.query('DELETE FROM schedule_templates WHERE id = $1 AND user_id = $2', [tpl.id, userId]);
  const rulesJson = JSON.stringify(tpl.schedule_rules && typeof tpl.schedule_rules === 'object' ? tpl.schedule_rules : {});
  await pool.query(
    `INSERT INTO schedule_templates (id, user_id, name, description, schedule_kind, schedule_value, schedule_rules, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [
      tpl.id,
      userId,
      tpl.name,
      tpl.description ?? '',
      tpl.schedule_kind,
      tpl.schedule_value ?? null,
      rulesJson,
      tpl.created_at || new Date().toISOString(),
    ],
  );
  for (let j = 0; j < items.length; j++) {
    const it = items[j];
    await pool.query(
      `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [it.id, tpl.id, it.type, it.title, it.description ?? '', it.deadline_time ?? null, it.target ?? null, j],
    );
  }
}

/**
 * @param {string} userId
 * @param {object} entry
 */
async function applyUndoEntry(userId, entry) {
  switch (entry.type) {
    case 'restore_graph': {
      await restoreNotesTasksGraph(userId, entry.notes || [], entry.tasks || []);
      return { ok: true, message: entry.label || 'Restored deleted notes/tasks.' };
    }
    case 'delete_items': {
      await bulkDeleteNotesTasks(userId, entry.noteIds || [], entry.taskIds || []);
      return { ok: true, message: entry.label || 'Removed created items.' };
    }
    case 'restore_note_row': {
      await restoreNoteRow(userId, entry.before);
      return { ok: true, message: entry.label || 'Reverted note to previous version.' };
    }
    case 'restore_task_row': {
      await restoreTaskRow(userId, entry.before);
      return { ok: true, message: entry.label || 'Reverted task to previous version.' };
    }
    case 'restore_schedule_template': {
      await restoreScheduleTemplateState(userId, entry.template, entry.items || []);
      return { ok: true, message: entry.label || 'Restored schedule template.' };
    }
    case 'delete_template_ids': {
      const ids = entry.templateIds || [];
      if (ids.length) {
        await pool.query('DELETE FROM schedule_templates WHERE id = ANY($1::uuid[]) AND user_id = $2', [ids, userId]);
      }
      return { ok: true, message: entry.label || 'Removed created templates.' };
    }
    default:
      throw new Error(`Unknown undo entry: ${entry.type}`);
  }
}

/**
 * @param {string} userId
 * @param {number} count
 */
export async function undoAgentActions(userId, count = 1) {
  const arr = stacks.get(userId);
  if (!arr || arr.length === 0) {
    return { ok: false, message: 'Nothing to undo.', results: [] };
  }
  const n = Math.min(Math.max(1, count), 5, arr.length);
  const results = [];
  for (let i = 0; i < n; i++) {
    const entry = arr.pop();
    if (!entry) break;
    try {
      const r = await applyUndoEntry(userId, entry);
      results.push(r);
    } catch (e) {
      arr.push(entry);
      results.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
      break;
    }
  }
  return { ok: results.every((r) => r.ok !== false && !r.error), results };
}
