import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { collectDescendantIds } from './agentHierarchy.js';
import { mergeWorkContext, toolWorkContext, userWantsMondayThroughFridaySchedule } from './intentPolicy.js';
import { normalizeDeadlineForStorage, parseTimePhraseToHm } from './timeParse.js';
import { APP_CAPABILITIES_MARKDOWN } from './appCapabilities.js';

function summarizeNote(n) {
  return {
    id: n.id,
    title: n.title,
    description: (n.description || '').slice(0, 500),
    completed: n.completed,
    daily: n.daily,
    deadline: n.deadline,
    parent_id: n.parent_id,
    parent_type: n.parent_type,
  };
}

function summarizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    description: (t.description || '').slice(0, 500),
    completed: t.completed,
    daily: t.daily,
    deadline: t.deadline,
    target: t.target,
    progress: t.progress,
    parent_id: t.parent_id,
    parent_type: t.parent_type,
  };
}

async function loadUserGraph(userId) {
  const [notesRes, tasksRes] = await Promise.all([
    pool.query('SELECT * FROM notes WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM tasks WHERE user_id = $1', [userId]),
  ]);
  return { notes: notesRes.rows, tasks: tasksRes.rows };
}

async function assertNoteOwned(userId, id) {
  const { rows } = await pool.query('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

async function assertTaskOwned(userId, id) {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

function cascadeSets(rootType, rootId, notes, tasks) {
  const { noteIds, taskIds } = collectDescendantIds(rootType, rootId, notes, tasks);
  if (rootType === 'note') {
    return { noteIds: [...noteIds, rootId], taskIds };
  }
  return { noteIds, taskIds: [...taskIds, rootId] };
}

/**
 * @param {string} userId
 * @param {{ noteIds: string[], taskIds: string[] }} sets
 */
async function deleteNoteAndTaskIds(userId, sets) {
  if (sets.taskIds.length) {
    await pool.query('DELETE FROM tasks WHERE id = ANY($1::uuid[]) AND user_id = $2', [sets.taskIds, userId]);
  }
  if (sets.noteIds.length) {
    await pool.query('DELETE FROM notes WHERE id = ANY($1::uuid[]) AND user_id = $2', [sets.noteIds, userId]);
  }
}

function pushPending(arr, tool, args, summary) {
  const id = randomUUID();
  arr.push({ id, tool, arguments: args, summary });
  return id;
}

/** @param {{ dirty?: { notes: boolean; tasks: boolean; templates: boolean } }} ctx */
function markNotesDirty(ctx) {
  if (ctx?.dirty) ctx.dirty.notes = true;
}

/** @param {{ dirty?: { notes: boolean, tasks: boolean, templates: boolean } }} ctx */
function markTasksDirty(ctx) {
  if (ctx?.dirty) ctx.dirty.tasks = true;
}

/** @param {{ dirty?: { notes: boolean, tasks: boolean, templates: boolean } }} ctx */
function markTemplatesDirty(ctx) {
  if (ctx?.dirty) ctx.dirty.templates = true;
}

const WEEKDAY_SET = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);

function normalizeWeekdayToken(s) {
  const t = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (WEEKDAY_SET.has(t)) return t;
  const abbrevs = {
    sun: 'sunday',
    mon: 'monday',
    tue: 'tuesday',
    tues: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    thur: 'thursday',
    thurs: 'thursday',
    fri: 'friday',
    sat: 'saturday',
  };
  return abbrevs[t] || null;
}

function collectWeekdaysFromArgs(args) {
  const preset = String(args?.weekday_preset || '').toLowerCase();
  if (preset === 'monday_to_friday' || preset === 'weekdays' || preset === 'weekdays_only') {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }
  if (Array.isArray(args?.weekdays)) {
    const out = [];
    for (const w of args.weekdays) {
      const n = normalizeWeekdayToken(w);
      if (n) out.push(n);
    }
    return [...new Set(out)];
  }
  if (typeof args?.weekdays_csv === 'string') {
    const parts = args.weekdays_csv
      .split(/[,\s;]+/)
      .map((x) => normalizeWeekdayToken(x))
      .filter(Boolean);
    return [...new Set(parts)];
  }
  return [];
}

function normalizeScheduleTemplateItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const type = it.type === 'note' ? 'note' : 'task';
    out.push({
      id: randomUUID(),
      type,
      title: String(it.title || '').trim() || 'Untitled',
      description: String(it.description ?? ''),
      deadline_time: it.deadline_time != null && String(it.deadline_time).trim() !== '' ? String(it.deadline_time) : null,
      target: type === 'task' ? (Number(it.target) >= 0 ? Number(it.target) : 10) : null,
      sort_order: i,
    });
  }
  return out;
}

async function insertScheduleTemplateRow(userId, { name, description, schedule_kind, schedule_value, itemRows }) {
  const templateId = randomUUID();
  await pool.query(
    `INSERT INTO schedule_templates (id, user_id, name, description, schedule_kind, schedule_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [templateId, userId, name, description ?? '', schedule_kind, schedule_value ?? null],
  );
  for (let i = 0; i < itemRows.length; i++) {
    const it = itemRows[i];
    await pool.query(
      `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [it.id, templateId, it.type, it.title, it.description, it.deadline_time, it.target, i],
    );
  }
  const { rows: items2 } = await pool.query(
    'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
    [templateId],
  );
  const {
    rows: [tpl],
  } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1', [templateId]);
  return { template: tpl, items: items2 };
}

function summarizeScheduleTemplateRow(tpl, items) {
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    schedule_kind: tpl.schedule_kind,
    schedule_value: tpl.schedule_value,
    items: items.map((it) => ({
      type: it.type,
      title: it.title,
      description: (it.description || '').slice(0, 200),
      deadline_time: it.deadline_time,
      target: it.target,
    })),
  };
}

async function executeScheduleTemplateCreates(userId, args) {
  const baseName = String(args?.name || '').trim() || 'Template';
  const description = String(args?.description ?? '');
  const wd = collectWeekdaysFromArgs(args);
  const created = [];

  if (wd.length > 0) {
    for (const day of wd) {
      const itemRows = normalizeScheduleTemplateItems(args?.items);
      if (itemRows.length === 0) throw new Error('items array must have at least one entry');
      const templateName =
        wd.length > 1 ? `${baseName} (${day.charAt(0).toUpperCase() + day.slice(1)})` : baseName;
      const r = await insertScheduleTemplateRow(userId, {
        name: templateName,
        description,
        schedule_kind: 'weekday',
        schedule_value: day,
        itemRows,
      });
      created.push(summarizeScheduleTemplateRow(r.template, r.items));
    }
    return created;
  }

  let schedule_kind = args.schedule_kind ?? 'none';
  if (!['weekday', 'date', 'none'].includes(schedule_kind)) schedule_kind = 'none';
  let schedule_value = args.schedule_value != null && String(args.schedule_value).trim() !== '' ? String(args.schedule_value) : null;
  if (schedule_kind === 'weekday' && schedule_value) {
    const n = normalizeWeekdayToken(schedule_value);
    schedule_value = n || schedule_value.toLowerCase();
  }
  if (schedule_kind === 'date' && schedule_value && !/^\d{1,2}-\d{1,2}$/.test(schedule_value)) {
    throw new Error('For schedule_kind date, schedule_value must be MM-DD (e.g. 12-25)');
  }

  const itemRows = normalizeScheduleTemplateItems(args?.items);
  if (itemRows.length === 0) throw new Error('items array must have at least one entry');

  const r = await insertScheduleTemplateRow(userId, {
    name: baseName,
    description,
    schedule_kind,
    schedule_value,
    itemRows,
  });
  return [summarizeScheduleTemplateRow(r.template, r.items)];
}

/**
 * Infer template rows from natural language (e.g. titled "Make soup", target of 5).
 * @returns {object[]}
 */
function inferTemplateItemsFromUserMessage(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const isNote = /\bnote\b/.test(lower) && !/\btask\b/.test(lower);
  const type = isNote ? 'note' : 'task';
  let title = '';
  const quoted = text.match(/titled\s*["']([^"']+)["']/i);
  if (quoted) title = quoted[1].trim();
  if (!title) {
    const bare = text.match(/titled\s+([^,.(\n]+?)(?:\s+with|\s*$)/i);
    if (bare) title = bare[1].trim();
  }
  if (!title) return [];
  const targetM = text.match(/target\s+of\s+(\d+)/i) || text.match(/target\s*[=:]\s*(\d+)/i);
  const target = targetM ? parseInt(targetM[1], 10) : 10;
  const item = { type, title, description: '' };
  if (type === 'task') item.target = Number.isFinite(target) ? target : 10;
  return [item];
}

/**
 * Fill missing template name/items from the latest user message when the model omits them.
 */
function enrichScheduleTemplateArgs(args, lastUserMessage) {
  const merged = { ...(args && typeof args === 'object' ? args : {}) };
  const normalized = normalizeScheduleTemplateItems(merged.items);
  if (normalized.length === 0 && lastUserMessage) {
    merged.items = inferTemplateItemsFromUserMessage(lastUserMessage);
  }
  const again = normalizeScheduleTemplateItems(merged.items);
  if (!String(merged.name || '').trim() && again[0]?.title) {
    merged.name = String(again[0].title);
  }
  return merged;
}

/**
 * Run a single tool call from the model.
 * @returns {{ resultText: string, workContext: string | null }}
 */
export async function runAgentTool(name, args, ctx) {
  const {
    userId,
    mutationsEnabled,
    clearMutationIntent,
    pendingConfirmations,
    pendingMutations,
    tzOffsetMinutes,
    lastUserMessage = '',
  } = ctx;

  let workContext = null;
  const setCtx = (toolName, a) => {
    workContext = mergeWorkContext(workContext, toolWorkContext(toolName, a));
  };

  try {
    switch (name) {
      case 'get_app_capabilities': {
        return { resultText: APP_CAPABILITIES_MARKDOWN, workContext: null };
      }

      case 'list_notes': {
        const { rows } = await pool.query('SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        const daily = args?.daily;
        const completed = args?.completed;
        let list = rows.map(summarizeNote);
        if (daily === true) list = list.filter((n) => n.daily);
        if (daily === false) list = list.filter((n) => !n.daily);
        if (completed === true) list = list.filter((n) => n.completed);
        if (completed === false) list = list.filter((n) => !n.completed);
        return { resultText: JSON.stringify(list.slice(0, 80)), workContext: null };
      }

      case 'list_tasks': {
        const { rows } = await pool.query('SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        const daily = args?.daily;
        const completed = args?.completed;
        let list = rows.map(summarizeTask);
        if (daily === true) list = list.filter((t) => t.daily);
        if (daily === false) list = list.filter((t) => !t.daily);
        if (completed === true) list = list.filter((t) => t.completed);
        if (completed === false) list = list.filter((t) => !t.completed);
        return { resultText: JSON.stringify(list.slice(0, 80)), workContext: null };
      }

      case 'create_note': {
        setCtx('create_note', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot create.', workContext };
        }
        const title = String(args?.title || '').trim() || 'Untitled';
        const description = String(args?.description ?? '');
        const daily = Boolean(args?.daily);
        let deadline = args?.deadline != null ? String(args.deadline) : null;
        if (daily && args?.time_hint) {
          const hm = parseTimePhraseToHm(String(args.time_hint), tzOffsetMinutes ?? 0);
          if (hm) deadline = hm.timeHm;
        }
        deadline = normalizeDeadlineForStorage(deadline, daily);
        const parent_id = args?.parent_id || null;
        const parent_type = args?.parent_type ?? (parent_id ? 'note' : null);
        const payload = {
          title,
          description,
          daily,
          deadline,
          parent_id,
          parent_type,
        };
        if (!clearMutationIntent) {
          pushPending(
            pendingMutations,
            'create_note',
            payload,
            `Create note "${title}"${daily ? ' (daily)' : ''}`,
          );
          return {
            resultText:
              'This create is queued for user confirmation (intent was not explicit). Tell them to confirm in the Assistant panel.',
            workContext,
          };
        }
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO notes (id, user_id, title, description, completed, created_at, deadline, parent_id, parent_type, position_x, position_y, collapsed, daily)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,null,null,false,$9) RETURNING *`,
          [id, userId, title, description, created_at, deadline, parent_id, parent_type, daily],
        );
        markNotesDirty(ctx);
        return { resultText: JSON.stringify(summarizeNote(rows[0])), workContext };
      }

      case 'create_task': {
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot create.', workContext: null };
        }
        const lastUser = String(lastUserMessage || '');
        const parent_id_early = args?.parent_id || null;
        if (userWantsMondayThroughFridaySchedule(lastUser) && !parent_id_early) {
          setCtx('create_schedule_template', { weekday_preset: 'monday_to_friday' });
          const inferred = inferTemplateItemsFromUserMessage(lastUser);
          const titleFromArg = String(args?.title || '').trim();
          const title = titleFromArg || inferred[0]?.title || 'Untitled';
          const description = String(args?.description ?? inferred[0]?.description ?? '');
          const daily = Boolean(args?.daily);
          let deadline_time = null;
          if (daily && args?.deadline != null) {
            deadline_time = normalizeDeadlineForStorage(String(args.deadline), true);
          }
          const target =
            Number(args?.target) >= 0 ? Number(args.target) : inferred[0]?.target != null ? Number(inferred[0].target) : 10;
          const tplArgs = enrichScheduleTemplateArgs(
            {
              name: title,
              description,
              weekday_preset: 'monday_to_friday',
              items: [
                {
                  type: 'task',
                  title,
                  description,
                  deadline_time,
                  target,
                },
              ],
            },
            lastUser,
          );
          if (normalizeScheduleTemplateItems(tplArgs.items).length === 0) {
            return {
              resultText:
                'Could not determine task title. Ask the user for the exact title, then call create_schedule_template with weekday_preset monday_to_friday and items: [{type:"task",title:"...",target:5}].',
              workContext,
            };
          }
          if (!clearMutationIntent) {
            pushPending(
              pendingMutations,
              'create_schedule_template',
              tplArgs,
              `Create Mon–Fri schedule templates for "${title}"`,
            );
            return {
              resultText:
                'Mon–Fri recurring tasks use schedule templates (one per weekday), not a single daily task. This is queued — ask the user to tap Apply in the Assistant panel.',
              workContext,
            };
          }
          try {
            const created = await executeScheduleTemplateCreates(userId, tplArgs);
            markTemplatesDirty(ctx);
            return {
              resultText: JSON.stringify(created),
              workContext,
            };
          } catch (e) {
            return { resultText: `Error: ${e.message || 'failed'}`, workContext };
          }
        }

        setCtx('create_task', args);
        const title = String(args?.title || '').trim() || 'Untitled';
        const description = String(args?.description ?? '');
        const daily = Boolean(args?.daily);
        let deadline = args?.deadline != null ? String(args.deadline) : null;
        if (daily && args?.time_hint) {
          const hm = parseTimePhraseToHm(String(args.time_hint), tzOffsetMinutes ?? 0);
          if (hm) deadline = hm.timeHm;
        }
        deadline = normalizeDeadlineForStorage(deadline, daily);
        const target = Number(args?.target) >= 0 ? Number(args.target) : 10;
        const progress = Number(args?.progress) >= 0 ? Number(args.progress) : 0;
        const parent_id = args?.parent_id || null;
        const parent_type = args?.parent_type ?? (parent_id ? 'note' : null);
        const payload = {
          title,
          description,
          daily,
          deadline,
          target,
          progress,
          parent_id,
          parent_type,
        };
        if (!clearMutationIntent) {
          pushPending(pendingMutations, 'create_task', payload, `Create task "${title}"${daily ? ' (daily)' : ''}`);
          return {
            resultText:
              'This create is queued for user confirmation (intent was not explicit). Tell them to confirm in the Assistant panel.',
            workContext,
          };
        }
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, userId, title, description, created_at, deadline, target, progress, daily, parent_id, parent_type],
        );
        markTasksDirty(ctx);
        return { resultText: JSON.stringify(summarizeTask(rows[0])), workContext };
      }

      case 'update_note': {
        setCtx('update_note', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot update.', workContext };
        }
        const id = args?.id;
        if (!id) return { resultText: 'Missing id', workContext };
        const row = await assertNoteOwned(userId, id);
        if (!row) return { resultText: 'Note not found', workContext };
        const allowed = [
          'title',
          'description',
          'completed',
          'deadline',
          'parent_id',
          'parent_type',
          'daily',
          'position_x',
          'position_y',
          'collapsed',
        ];
        const patch = {};
        for (const k of allowed) {
          if (args[k] !== undefined) patch[k] = args[k];
        }
        if (patch.deadline !== undefined) {
          const d = Boolean(patch.daily ?? row.daily);
          patch.deadline = normalizeDeadlineForStorage(String(patch.deadline), d);
        }
        if (Object.keys(patch).length === 0) return { resultText: 'No valid fields to update', workContext };
        if (!clearMutationIntent) {
          pushPending(pendingMutations, 'update_note', { id, ...patch }, `Update note ${id}`);
          return {
            resultText:
              'Update queued for user confirmation (intent was not explicit). Ask them to confirm in the Assistant panel.',
            workContext,
          };
        }
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        vals.push(id, userId);
        const { rows } = await pool.query(
          `UPDATE notes SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
          vals,
        );
        markNotesDirty(ctx);
        return { resultText: JSON.stringify(summarizeNote(rows[0])), workContext };
      }

      case 'update_task': {
        setCtx('update_task', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot update.', workContext };
        }
        const id = args?.id;
        if (!id) return { resultText: 'Missing id', workContext };
        const row = await assertTaskOwned(userId, id);
        if (!row) return { resultText: 'Task not found', workContext };
        const allowed = [
          'title',
          'description',
          'completed',
          'deadline',
          'target',
          'progress',
          'daily',
          'parent_id',
          'parent_type',
        ];
        const patch = {};
        for (const k of allowed) {
          if (args[k] !== undefined) patch[k] = args[k];
        }
        if (patch.deadline !== undefined) {
          const d = Boolean(patch.daily ?? row.daily);
          patch.deadline = normalizeDeadlineForStorage(String(patch.deadline), d);
        }
        if (Object.keys(patch).length === 0) return { resultText: 'No valid fields to update', workContext };
        if (!clearMutationIntent) {
          pushPending(pendingMutations, 'update_task', { id, ...patch }, `Update task ${id}`);
          return {
            resultText:
              'Update queued for user confirmation (intent was not explicit). Ask them to confirm in the Assistant panel.',
            workContext,
          };
        }
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        vals.push(id, userId);
        const { rows } = await pool.query(
          `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
          vals,
        );
        markTasksDirty(ctx);
        return { resultText: JSON.stringify(summarizeTask(rows[0])), workContext };
      }

      case 'delete_note': {
        setCtx('delete_note', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled; deletion not allowed.', workContext };
        }
        const id = args?.id;
        if (!id) return { resultText: 'Missing id', workContext };
        const row = await assertNoteOwned(userId, id);
        if (!row) return { resultText: 'Note not found', workContext };
        const cascade = args?.cascade !== false;
        const { notes, tasks } = await loadUserGraph(userId);
        const sets = cascade ? cascadeSets('note', id, notes, tasks) : { noteIds: [id], taskIds: [] };
        const summary = cascade
          ? `Delete note "${row.title}" and its subtree (${sets.noteIds.length} notes, ${sets.taskIds.length} tasks)`
          : `Delete note "${row.title}"`;
        pushPending(pendingConfirmations, 'delete_note', { id, cascade }, summary);
        return {
          resultText:
            'Deletion requires explicit user confirmation in the app. It is NOT done yet. Briefly list what will be removed and ask them to confirm in the Assistant panel.',
          workContext,
        };
      }

      case 'delete_task': {
        setCtx('delete_task', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled; deletion not allowed.', workContext };
        }
        const id = args?.id;
        if (!id) return { resultText: 'Missing id', workContext };
        const row = await assertTaskOwned(userId, id);
        if (!row) return { resultText: 'Task not found', workContext };
        const cascade = args?.cascade !== false;
        const { notes, tasks } = await loadUserGraph(userId);
        const sets = cascade ? cascadeSets('task', id, notes, tasks) : { noteIds: [], taskIds: [id] };
        const summary = cascade
          ? `Delete task "${row.title}" and its subtree (${sets.noteIds.length} notes, ${sets.taskIds.length} tasks)`
          : `Delete task "${row.title}"`;
        pushPending(pendingConfirmations, 'delete_task', { id, cascade }, summary);
        return {
          resultText:
            'Deletion requires explicit user confirmation in the app. It is NOT done yet. Briefly list what will be removed and ask them to confirm in the Assistant panel.',
          workContext,
        };
      }

      case 'list_schedule_templates': {
        const { rows: templates } = await pool.query(
          'SELECT * FROM schedule_templates WHERE user_id = $1 ORDER BY created_at',
          [userId],
        );
        const list = [];
        for (const t of templates) {
          const { rows: items } = await pool.query(
            'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
            [t.id],
          );
          list.push(summarizeScheduleTemplateRow(t, items));
        }
        return { resultText: JSON.stringify(list), workContext: null };
      }

      case 'create_schedule_template': {
        const lastUser = String(lastUserMessage || '');
        const argsEffective = enrichScheduleTemplateArgs(args, lastUser);
        setCtx('create_schedule_template', argsEffective);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot create templates.', workContext };
        }
        if (normalizeScheduleTemplateItems(argsEffective.items).length === 0) {
          return {
            resultText:
              'Missing items[]. The model must pass items: [{type:"task",title:"...",target:5}] (or type:"note"). If the user already said the title in chat, retry with those fields filled — do not invent get_task or other tools.',
            workContext,
          };
        }
        try {
          if (!clearMutationIntent) {
            pushPending(
              pendingMutations,
              'create_schedule_template',
              { ...argsEffective },
              `Create schedule template(s) "${String(argsEffective?.name || '').trim() || 'Template'}"`,
            );
            return {
              resultText:
                'This template create is queued for user confirmation. Ask them to tap Apply in the Assistant panel.',
              workContext,
            };
          }
          const created = await executeScheduleTemplateCreates(userId, argsEffective);
          markTemplatesDirty(ctx);
          return {
            resultText: JSON.stringify(created),
            workContext,
          };
        } catch (e) {
          return { resultText: `Error: ${e.message || 'failed'}`, workContext };
        }
      }

      case 'update_schedule_template': {
        setCtx('update_schedule_template', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled; cannot update templates.', workContext };
        }
        const tid = args?.id;
        if (!tid) return { resultText: 'Missing template id', workContext };
        const { rows: own } = await pool.query(
          'SELECT * FROM schedule_templates WHERE id = $1 AND user_id = $2',
          [tid, userId],
        );
        if (!own[0]) return { resultText: 'Template not found', workContext };
        if (!clearMutationIntent) {
          pushPending(pendingMutations, 'update_schedule_template', { ...args }, `Update schedule template ${tid}`);
          return {
            resultText:
              'Update queued for user confirmation. Ask them to tap Apply in the Assistant panel.',
            workContext,
          };
        }
        try {
          const meta = {};
          for (const key of ['name', 'description', 'schedule_kind', 'schedule_value']) {
            if (args[key] !== undefined) meta[key] = args[key];
          }
          const sets = [];
          const vals = [];
          let pi = 1;
          for (const [key, val] of Object.entries(meta)) {
            sets.push(`${key} = $${pi++}`);
            vals.push(val);
          }
          if (sets.length > 0) {
            vals.push(tid, userId);
            await pool.query(
              `UPDATE schedule_templates SET ${sets.join(', ')} WHERE id = $${pi++} AND user_id = $${pi}`,
              vals,
            );
          }
          if (args.items !== undefined) {
            const itemRows = normalizeScheduleTemplateItems(args.items);
            await pool.query('DELETE FROM schedule_template_items WHERE template_id = $1', [tid]);
            for (let j = 0; j < itemRows.length; j++) {
              const it = itemRows[j];
              await pool.query(
                `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [it.id, tid, it.type, it.title, it.description, it.deadline_time, it.target, j],
              );
            }
          }
          const { rows: items2 } = await pool.query(
            'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
            [tid],
          );
          const { rows: tplRows } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1', [tid]);
          markTemplatesDirty(ctx);
          return {
            resultText: JSON.stringify(summarizeScheduleTemplateRow(tplRows[0], items2)),
            workContext,
          };
        } catch (e) {
          return { resultText: `Error: ${e.message || 'failed'}`, workContext };
        }
      }

      case 'delete_schedule_template': {
        setCtx('delete_schedule_template', args);
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled; cannot delete templates.', workContext };
        }
        const tid = args?.id;
        if (!tid) return { resultText: 'Missing template id', workContext };
        const { rows: own } = await pool.query(
          'SELECT * FROM schedule_templates WHERE id = $1 AND user_id = $2',
          [tid, userId],
        );
        if (!own[0]) return { resultText: 'Template not found', workContext };
        const summary = `Delete schedule template "${own[0].name || tid}"`;
        pushPending(pendingConfirmations, 'delete_schedule_template', { id: tid }, summary);
        return {
          resultText:
            'Template deletion requires user confirmation in the app. It is NOT deleted yet. Ask them to confirm in the Assistant panel.',
          workContext,
        };
      }

      default:
        return { resultText: `Unknown tool: ${name}`, workContext: null };
    }
  } catch (e) {
    console.error('runAgentTool', name, e);
    return { resultText: `Error: ${e.message || 'failed'}`, workContext: null };
  }
}

/**
 * @param {string} userId
 * @param {Array<{ tool: string, arguments: object }>} actions
 */
export async function executeConfirmedActions(userId, actions) {
  const results = [];
  for (const a of actions) {
    const tool = a.tool;
    const args = a.arguments || {};
    try {
      if (tool === 'create_note') {
        const title = String(args.title || '').trim() || 'Untitled';
        const description = String(args.description ?? '');
        const daily = Boolean(args.daily);
        const deadline = normalizeDeadlineForStorage(args.deadline != null ? String(args.deadline) : null, daily);
        const parent_id = args.parent_id || null;
        const parent_type = args.parent_type ?? (parent_id ? 'note' : null);
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO notes (id, user_id, title, description, completed, created_at, deadline, parent_id, parent_type, position_x, position_y, collapsed, daily)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,null,null,false,$9) RETURNING *`,
          [id, userId, title, description, created_at, deadline, parent_id, parent_type, daily],
        );
        results.push({ ok: true, tool, item: summarizeNote(rows[0]) });
        continue;
      }
      if (tool === 'create_task') {
        const title = String(args.title || '').trim() || 'Untitled';
        const description = String(args.description ?? '');
        const daily = Boolean(args.daily);
        const deadline = normalizeDeadlineForStorage(args.deadline != null ? String(args.deadline) : null, daily);
        const target = Number(args.target) >= 0 ? Number(args.target) : 10;
        const progress = Number(args.progress) >= 0 ? Number(args.progress) : 0;
        const parent_id = args.parent_id || null;
        const parent_type = args.parent_type ?? (parent_id ? 'note' : null);
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, userId, title, description, created_at, deadline, target, progress, daily, parent_id, parent_type],
        );
        results.push({ ok: true, tool, item: summarizeTask(rows[0]) });
        continue;
      }
      if (tool === 'update_note') {
        const id = args.id;
        const row = await assertNoteOwned(userId, id);
        if (!row) {
          results.push({ ok: false, tool, error: 'not_found' });
          continue;
        }
        const allowed = [
          'title',
          'description',
          'completed',
          'deadline',
          'parent_id',
          'parent_type',
          'daily',
          'position_x',
          'position_y',
          'collapsed',
        ];
        const patch = {};
        for (const k of allowed) {
          if (args[k] !== undefined) patch[k] = args[k];
        }
        delete patch.id;
        if (patch.deadline !== undefined) {
          const d = Boolean(patch.daily ?? row.daily);
          patch.deadline = normalizeDeadlineForStorage(String(patch.deadline), d);
        }
        if (Object.keys(patch).length === 0) {
          results.push({ ok: false, tool, error: 'empty_patch' });
          continue;
        }
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        vals.push(id, userId);
        const { rows } = await pool.query(
          `UPDATE notes SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
          vals,
        );
        results.push({ ok: true, tool, item: summarizeNote(rows[0]) });
        continue;
      }
      if (tool === 'update_task') {
        const id = args.id;
        const row = await assertTaskOwned(userId, id);
        if (!row) {
          results.push({ ok: false, tool, error: 'not_found' });
          continue;
        }
        const allowed = [
          'title',
          'description',
          'completed',
          'deadline',
          'target',
          'progress',
          'daily',
          'parent_id',
          'parent_type',
        ];
        const patch = {};
        for (const k of allowed) {
          if (args[k] !== undefined) patch[k] = args[k];
        }
        if (patch.deadline !== undefined) {
          const d = Boolean(patch.daily ?? row.daily);
          patch.deadline = normalizeDeadlineForStorage(String(patch.deadline), d);
        }
        if (Object.keys(patch).length === 0) {
          results.push({ ok: false, tool, error: 'empty_patch' });
          continue;
        }
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        vals.push(id, userId);
        const { rows } = await pool.query(
          `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
          vals,
        );
        results.push({ ok: true, tool, item: summarizeTask(rows[0]) });
        continue;
      }
      if (tool === 'delete_note') {
        const id = args.id;
        const cascade = args.cascade !== false;
        const row = await assertNoteOwned(userId, id);
        if (!row) {
          results.push({ ok: false, tool, error: 'not_found' });
          continue;
        }
        const { notes, tasks } = await loadUserGraph(userId);
        const sets = cascade ? cascadeSets('note', id, notes, tasks) : { noteIds: [id], taskIds: [] };
        await deleteNoteAndTaskIds(userId, sets);
        results.push({ ok: true, tool, deleted: sets });
        continue;
      }
      if (tool === 'delete_task') {
        const id = args.id;
        const cascade = args.cascade !== false;
        const row = await assertTaskOwned(userId, id);
        if (!row) {
          results.push({ ok: false, tool, error: 'not_found' });
          continue;
        }
        const { notes, tasks } = await loadUserGraph(userId);
        const sets = cascade ? cascadeSets('task', id, notes, tasks) : { noteIds: [], taskIds: [id] };
        await deleteNoteAndTaskIds(userId, sets);
        results.push({ ok: true, tool, deleted: sets });
        continue;
      }
      if (tool === 'create_schedule_template') {
        try {
          const created = await executeScheduleTemplateCreates(userId, args);
          results.push({ ok: true, tool, templates: created });
        } catch (e) {
          results.push({ ok: false, tool, error: e.message || 'failed' });
        }
        continue;
      }
      if (tool === 'update_schedule_template') {
        const tid = args.id;
        if (!tid) {
          results.push({ ok: false, tool, error: 'missing_id' });
          continue;
        }
        const { rows: own } = await pool.query(
          'SELECT * FROM schedule_templates WHERE id = $1 AND user_id = $2',
          [tid, userId],
        );
        if (!own[0]) {
          results.push({ ok: false, tool, error: 'not_found' });
          continue;
        }
        try {
          const meta = {};
          for (const key of ['name', 'description', 'schedule_kind', 'schedule_value']) {
            if (args[key] !== undefined) meta[key] = args[key];
          }
          const sets = [];
          const vals = [];
          let pi = 1;
          for (const [key, val] of Object.entries(meta)) {
            sets.push(`${key} = $${pi++}`);
            vals.push(val);
          }
          if (sets.length > 0) {
            vals.push(tid, userId);
            await pool.query(
              `UPDATE schedule_templates SET ${sets.join(', ')} WHERE id = $${pi++} AND user_id = $${pi}`,
              vals,
            );
          }
          if (args.items !== undefined) {
            const itemRows = normalizeScheduleTemplateItems(args.items);
            await pool.query('DELETE FROM schedule_template_items WHERE template_id = $1', [tid]);
            for (let j = 0; j < itemRows.length; j++) {
              const it = itemRows[j];
              await pool.query(
                `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [it.id, tid, it.type, it.title, it.description, it.deadline_time, it.target, j],
              );
            }
          }
          const { rows: items2 } = await pool.query(
            'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
            [tid],
          );
          const { rows: tplRows } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1', [tid]);
          results.push({ ok: true, tool, item: summarizeScheduleTemplateRow(tplRows[0], items2) });
        } catch (e) {
          results.push({ ok: false, tool, error: e.message || 'failed' });
        }
        continue;
      }
      if (tool === 'delete_schedule_template') {
        const tid = args.id;
        if (!tid) {
          results.push({ ok: false, tool, error: 'missing_id' });
          continue;
        }
        const delRes = await pool.query('DELETE FROM schedule_templates WHERE id = $1 AND user_id = $2', [
          tid,
          userId,
        ]);
        results.push({ ok: (delRes.rowCount ?? 0) > 0, tool, deleted: tid });
        continue;
      }
      results.push({ ok: false, tool, error: 'unknown_tool' });
    } catch (e) {
      results.push({ ok: false, tool, error: e.message || 'failed' });
    }
  }
  return { results };
}

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_app_capabilities',
      description: 'Return authoritative markdown describing app tabs, data model, assistant rules, and settings.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List the user notes (optionally filter by daily flag or completed).',
      parameters: {
        type: 'object',
        properties: {
          daily: { type: 'boolean', description: 'If set, filter to daily (true) or non-daily (false).' },
          completed: { type: 'boolean', description: 'If set, filter completed state.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List the user tasks (optionally filter by daily or completed).',
      parameters: {
        type: 'object',
        properties: {
          daily: { type: 'boolean' },
          completed: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description:
        'Create a note in the Notes/Pool trees. Set daily=true ONLY for a standing item that repeats every calendar day on the Schedule tab (same note every day). Do NOT use daily=true for "weekdays only" or Mon–Fri — use create_schedule_template for recurring weekdays.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          daily: { type: 'boolean' },
          deadline: { type: 'string', description: 'ISO datetime or HH:mm for daily' },
          time_hint: { type: 'string', description: 'Natural language time e.g. "5pm" for daily items' },
          parent_id: { type: 'string' },
          parent_type: { type: 'string', enum: ['note', 'task'] },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Create a task (Tasks tab / nested). Set daily=true ONLY for a standing task every calendar day on Schedule. For Mon–Fri or specific weekdays without weekend, use create_schedule_template with weekdays array — not daily=true.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          daily: { type: 'boolean' },
          deadline: { type: 'string' },
          time_hint: { type: 'string' },
          target: { type: 'number' },
          progress: { type: 'number' },
          parent_id: { type: 'string' },
          parent_type: { type: 'string', enum: ['note', 'task'] },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Patch fields on an existing note by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          completed: { type: 'boolean' },
          deadline: { type: 'string' },
          daily: { type: 'boolean' },
          parent_id: { type: 'string', nullable: true },
          parent_type: { type: 'string', enum: ['note', 'task'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Patch fields on an existing task by id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          completed: { type: 'boolean' },
          deadline: { type: 'string' },
          daily: { type: 'boolean' },
          target: { type: 'number' },
          progress: { type: 'number' },
          parent_id: { type: 'string', nullable: true },
          parent_type: { type: 'string', enum: ['note', 'task'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_schedule_templates',
      description: 'List schedule templates (recurring items by weekday or yearly date). Each template can hold note/task rows that materialize on matching days.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_schedule_template',
      description:
        'Create schedule template(s). One template = one weekday (e.g. monday) OR one yearly date (MM-DD), or schedule_kind none. For Monday–Friday use weekdays: ["monday","tuesday","wednesday","thursday","friday"] — creates 5 templates with the same items. Items use type note|task, title, optional description, deadline_time (HH:mm), target for tasks.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          schedule_kind: {
            type: 'string',
            enum: ['weekday', 'date', 'none'],
            description: 'Ignored when weekdays[] is provided (forced to weekday per day).',
          },
          schedule_value: {
            type: 'string',
            description: 'weekday: lowercase full name (monday). date: MM-DD.',
          },
          weekdays: {
            type: 'array',
            items: { type: 'string' },
            description: 'e.g. monday through friday for workweek — creates one template per day.',
          },
          weekdays_csv: { type: 'string', description: 'Alternative: comma-separated weekday names.' },
          weekday_preset: {
            type: 'string',
            enum: ['monday_to_friday', 'weekdays'],
            description: 'Shorthand for Mon–Fri; same as listing those five weekdays.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['note', 'task'] },
                title: { type: 'string' },
                description: { type: 'string' },
                deadline_time: { type: 'string' },
                target: { type: 'number' },
              },
              required: ['type', 'title'],
            },
          },
        },
        required: ['name', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_schedule_template',
      description: 'Patch template metadata and/or replace all items for a template id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          schedule_kind: { type: 'string', enum: ['weekday', 'date', 'none'] },
          schedule_value: { type: 'string' },
          items: { type: 'array' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_schedule_template',
      description: 'Request deletion of a schedule template. Always requires user confirmation in the UI.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Request deletion of a note. Always requires user confirmation in the UI; cascade deletes subtree by default.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cascade: { type: 'boolean', description: 'Default true: delete descendants.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Request deletion of a task. Always requires user confirmation; cascade default true.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cascade: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
  },
];
