import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { collectDescendantIds } from './agentHierarchy.js';
import {
  mergeWorkContext,
  toolWorkContext,
  userWantsMondayThroughFridaySchedule,
  weekdayRecurrenceNeedsTemplate,
  collectWeekdaysMentionedInText,
} from './intentPolicy.js';
import { normalizeDeadlineForStorage, parseTimePhraseToHm } from './timeParse.js';
import { APP_CAPABILITIES_MARKDOWN } from './appCapabilities.js';
import { pushAgentUndo, formatUndoListForAgent, undoAgentActions } from './agentUndoStack.js';
import { normalizeScheduleRules, normalizeYearlyDate } from '../utils/scheduleTemplate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Maps model placeholders and invalid strings to null for uuid DB columns. */
function normalizeOptionalUuid(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'none' || lower === 'null' || lower === 'undefined' || lower === 'n/a') return null;
  return UUID_RE.test(s) ? s : null;
}

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

async function loadFullNotesTasksSnapshot(userId, noteIds, taskIds) {
  const n = noteIds?.length ? noteIds : [];
  const t = taskIds?.length ? taskIds : [];
  const { rows: notes } = n.length
    ? await pool.query('SELECT * FROM notes WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, n])
    : { rows: [] };
  const { rows: tasks } = t.length
    ? await pool.query('SELECT * FROM tasks WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, t])
    : { rows: [] };
  return { notes, tasks };
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

/**
 * Models often pass a single item object, a JSON string, or `item` instead of `items[]`.
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function coerceScheduleTemplateItemsArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      return coerceScheduleTemplateItemsArray(JSON.parse(t));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') {
    const o = /** @type {Record<string, unknown>} */ (raw);
    if (o.type != null || o.title != null || o.name != null) return [o];
  }
  return [];
}

function normalizeScheduleTemplateItems(items) {
  const arr = coerceScheduleTemplateItemsArray(items);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let it = arr[i] || {};
    if (typeof it === 'string') {
      try {
        it = JSON.parse(it);
      } catch {
        it = { title: it };
      }
    }
    if (typeof it !== 'object' || it == null) it = {};
    const type = it.type === 'note' ? 'note' : 'task';
    out.push({
      id: randomUUID(),
      type,
      title: String(it.title || it.name || '').trim() || 'Untitled',
      description: String(it.description ?? ''),
      deadline_time: it.deadline_time != null && String(it.deadline_time).trim() !== '' ? String(it.deadline_time) : null,
      target: type === 'task' ? (Number(it.target) >= 0 ? Number(it.target) : 10) : null,
      sort_order: i,
    });
  }
  return out;
}

async function insertScheduleTemplateRow(userId, { name, description, schedule_kind, schedule_value, schedule_rules, itemRows }) {
  const templateId = randomUUID();
  const rulesObj = schedule_rules && typeof schedule_rules === 'object' ? schedule_rules : {};
  await pool.query(
    `INSERT INTO schedule_templates (id, user_id, name, description, schedule_kind, schedule_value, schedule_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [templateId, userId, name, description ?? '', schedule_kind, schedule_value ?? null, JSON.stringify(rulesObj)],
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
    schedule_rules: tpl.schedule_rules || {},
    items: items.map((it) => ({
      type: it.type,
      title: it.title,
      description: (it.description || '').slice(0, 200),
      deadline_time: it.deadline_time,
      target: it.target,
    })),
  };
}

function resolveAgentTemplateSchedule(args) {
  const wd = collectWeekdaysFromArgs(args);
  if (wd.length > 0) {
    return { schedule_kind: 'weekdays', schedule_value: null, schedule_rules: { weekdays: wd } };
  }
  let schedule_kind = String(args?.schedule_kind ?? 'none').toLowerCase();
  if (schedule_kind === 'weekday') schedule_kind = 'weekdays';
  if (schedule_kind === 'date') schedule_kind = 'more';
  if (!['none', 'daily', 'weekdays', 'dates', 'more'].includes(schedule_kind)) schedule_kind = 'none';

  if (args?.schedule_rules != null && typeof args.schedule_rules === 'object') {
    const n = normalizeScheduleRules(args.schedule_rules);
    const rules = {};
    if (n.weekdays.length) rules.weekdays = n.weekdays;
    if (n.monthDays.length) rules.monthDays = n.monthDays;
    if (n.yearlyDates.length) rules.yearlyDates = n.yearlyDates;
    return { schedule_kind, schedule_value: null, schedule_rules: rules };
  }

  let schedule_value = args?.schedule_value != null && String(args.schedule_value).trim() !== '' ? String(args.schedule_value) : null;
  if (schedule_kind === 'weekdays' && schedule_value) {
    const n = normalizeWeekdayToken(schedule_value);
    return { schedule_kind: 'weekdays', schedule_value: null, schedule_rules: n ? { weekdays: [n] } : {} };
  }
  if (schedule_kind === 'more' && schedule_value) {
    const y = normalizeYearlyDate(schedule_value);
    if (!y) throw new Error('For schedule_kind more, schedule_value must be MM-DD (e.g. 12-25)');
    return { schedule_kind: 'more', schedule_value: null, schedule_rules: { yearlyDates: [y] } };
  }
  if (schedule_kind === 'dates' && Array.isArray(args?.month_days)) {
    const days = [];
    for (const d of args.month_days) {
      const n = parseInt(String(d), 10);
      if (n >= 1 && n <= 31) days.push(n);
    }
    return { schedule_kind: 'dates', schedule_value: null, schedule_rules: { monthDays: [...new Set(days)].sort((a, b) => a - b) } };
  }
  return { schedule_kind, schedule_value: null, schedule_rules: {} };
}

async function executeScheduleTemplateCreates(userId, args) {
  const baseName = String(args?.name || '').trim() || 'Template';
  const description = String(args?.description ?? '');
  const itemRows = normalizeScheduleTemplateItems(args?.items);
  if (itemRows.length === 0) throw new Error('items array must have at least one entry');

  const { schedule_kind, schedule_value, schedule_rules } = resolveAgentTemplateSchedule(args);

  const r = await insertScheduleTemplateRow(userId, {
    name: baseName,
    description,
    schedule_kind,
    schedule_value,
    schedule_rules,
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
  if (!title) {
    const taskPref = text.match(/^\s*task\s*:\s*(.+)$/im) || text.match(/\btask\s*:\s*([^\n]+)/i);
    if (taskPref) title = taskPref[1].trim();
  }
  if (!title) {
    const notePref = text.match(/^\s*note\s*:\s*(.+)$/im) || text.match(/\bnote\s*:\s*([^\n]+)/i);
    if (notePref) title = notePref[1].trim();
  }
  if (!title) {
    const dq = text.match(/"([^"]{1,200})"/);
    const sq = text.match(/'([^']{1,200})'/);
    if (dq) title = dq[1].trim();
    else if (sq) title = sq[1].trim();
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
  if (merged.items == null && merged.item != null) {
    merged.items = Array.isArray(merged.item) ? merged.item : [merged.item];
  }
  delete merged.item;
  let normalized = normalizeScheduleTemplateItems(merged.items);
  if (normalized.length === 0 && lastUserMessage) {
    merged.items = inferTemplateItemsFromUserMessage(lastUserMessage);
    normalized = normalizeScheduleTemplateItems(merged.items);
  }
  if (!String(merged.name || '').trim() && normalized[0]?.title) {
    merged.name = String(normalized[0].title);
  }
  return merged;
}

/**
 * User text requests specific weekdays → always a schedule template, never daily:true on note/task.
 * @param {(tool: string, a: unknown) => void} setCtx
 * @returns {Promise<{ kind: 'ok'; templates: object[] } | { kind: 'error'; resultText: string } | null>}
 */
async function tryWeekdayTemplateFromUserMessage(userId, args, lastUser, ctx, itemType, setCtx) {
  if (!weekdayRecurrenceNeedsTemplate(lastUser)) return null;
  if (userWantsMondayThroughFridaySchedule(lastUser)) return null;
  if (normalizeOptionalUuid(args?.parent_id)) return null;

  let wd = collectWeekdaysMentionedInText(lastUser);
  if (wd.length === 0 && /\bweekdays?\b/i.test(lastUser)) {
    wd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }
  if (wd.length === 0) {
    return {
      kind: 'error',
      resultText: JSON.stringify({
        error: 'weekday_recurrence_unclear',
        hint: 'Could not tell which weekday(s). Ask the user, then use create_schedule_template with schedule_kind weekdays and schedule_rules.weekdays (e.g. ["friday"]). Never use daily=true for "every Friday" — that repeats every calendar day.',
      }),
    };
  }

  const inferred = inferTemplateItemsFromUserMessage(lastUser);
  const titleFromArg = String(args?.title || '').trim();
  let title = titleFromArg || inferred[0]?.title || '';
  if (!title) {
    const tm = lastUser.match(/\btask\s+for\s+me\s+to\s+(.+?)(?=\s+every\s+|\s+each\s+|$)/i);
    if (tm) title = tm[1].trim();
  }
  if (!title) {
    const nm = lastUser.match(/\bnote\s+for\s+me\s+to\s+(.+?)(?=\s+every\s+|\s+each\s+|$)/i);
    if (nm) title = nm[1].trim();
  }
  if (!title) title = 'Untitled';

  const description = String(args?.description ?? inferred[0]?.description ?? '');
  let deadline_time = null;
  if (args?.deadline != null) {
    deadline_time = normalizeDeadlineForStorage(String(args.deadline), Boolean(args?.daily));
  }
  const item =
    itemType === 'task'
      ? {
          type: 'task',
          title,
          description,
          ...(deadline_time ? { deadline_time } : {}),
          target:
            Number(args?.target) >= 0
              ? Number(args.target)
              : inferred[0]?.target != null
                ? Number(inferred[0].target)
                : 1,
        }
      : {
          type: 'note',
          title,
          description,
          ...(deadline_time ? { deadline_time } : {}),
        };

  setCtx('create_schedule_template', { weekdays: wd });
  const tplArgs = enrichScheduleTemplateArgs(
    {
      name: title,
      description,
      weekdays: wd,
      items: [item],
    },
    lastUser,
  );

  if (normalizeScheduleTemplateItems(tplArgs.items).length === 0) {
    return {
      kind: 'error',
      resultText: JSON.stringify({
        error: 'template_items_missing',
        hint: 'Ask for a clear task/note title, then create_schedule_template with weekdays in schedule_rules.',
      }),
    };
  }

  try {
    const created = await executeScheduleTemplateCreates(userId, tplArgs);
    markTemplatesDirty(ctx);
    const templateIds = created.map((c) => c.id).filter(Boolean);
    if (templateIds.length) {
      pushAgentUndo(userId, {
        type: 'delete_template_ids',
        label: `Created weekdays template for "${title}"`,
        templateIds,
      });
    }
    return { kind: 'ok', templates: created };
  } catch (e) {
    return { kind: 'error', resultText: `Error: ${e.message || 'failed'}` };
  }
}

/**
 * Run a single tool call from the model.
 * @returns {{ resultText: string, workContext: string | null }}
 */
export async function runAgentTool(name, args, ctx) {
  const { userId, mutationsEnabled, tzOffsetMinutes, lastUserMessage = '' } = ctx;

  let workContext = null;
  const setCtx = (toolName, a) => {
    workContext = mergeWorkContext(workContext, toolWorkContext(toolName, a));
  };

  try {
    switch (name) {
      case 'get_app_capabilities': {
        return { resultText: APP_CAPABILITIES_MARKDOWN, workContext: null };
      }

      case 'list_agent_undo': {
        const list = formatUndoListForAgent(userId, 15);
        return {
          resultText: JSON.stringify({
            count: list.length,
            recent_newest_first: list,
            hint: 'Call undo_agent_action with count:1 to reverse the most recent change.',
          }),
          workContext: null,
        };
      }

      case 'undo_agent_action': {
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled; cannot undo.', workContext: null };
        }
        const raw = args?.count ?? args?.steps ?? 1;
        const count = Math.min(5, Math.max(1, Number(raw) || 1));
        const res = await undoAgentActions(userId, count);
        if (ctx?.dirty && res.results?.some((r) => r.ok)) {
          ctx.dirty.notes = true;
          ctx.dirty.tasks = true;
          ctx.dirty.templates = true;
        }
        return { resultText: JSON.stringify(res), workContext: null };
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
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot create.', workContext };
        }
        const lastUserNote = String(lastUserMessage || '');
        const routedNote = await tryWeekdayTemplateFromUserMessage(
          userId,
          args,
          lastUserNote,
          ctx,
          'note',
          setCtx,
        );
        if (routedNote?.kind === 'error') {
          return { resultText: routedNote.resultText, workContext: mergeWorkContext(workContext, 'schedule') };
        }
        if (routedNote?.kind === 'ok') {
          return {
            resultText: JSON.stringify(routedNote.templates),
            workContext: mergeWorkContext(workContext, 'schedule'),
          };
        }
        setCtx('create_note', args);
        const title = String(args?.title || '').trim() || 'Untitled';
        const description = String(args?.description ?? '');
        const daily = Boolean(args?.daily);
        let deadline = args?.deadline != null ? String(args.deadline) : null;
        if (daily && args?.time_hint) {
          const hm = parseTimePhraseToHm(String(args.time_hint), tzOffsetMinutes ?? 0);
          if (hm) deadline = hm.timeHm;
        }
        deadline = normalizeDeadlineForStorage(deadline, daily);
        const parent_id = normalizeOptionalUuid(args?.parent_id);
        const parent_type = args?.parent_type ?? (parent_id ? 'note' : null);
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO notes (id, user_id, title, description, completed, created_at, deadline, parent_id, parent_type, position_x, position_y, collapsed, daily)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,null,null,false,$9) RETURNING *`,
          [id, userId, title, description, created_at, deadline, parent_id, parent_type, daily],
        );
        markNotesDirty(ctx);
        pushAgentUndo(userId, {
          type: 'delete_items',
          label: `Created note "${title}"`,
          noteIds: [id],
          taskIds: [],
        });
        return { resultText: JSON.stringify(summarizeNote(rows[0])), workContext };
      }

      case 'create_task': {
        if (!mutationsEnabled) {
          return { resultText: 'Mutations are disabled in user settings; cannot create.', workContext: null };
        }
        const lastUser = String(lastUserMessage || '');
        const parent_id_early = normalizeOptionalUuid(args?.parent_id);
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
          try {
            const created = await executeScheduleTemplateCreates(userId, tplArgs);
            markTemplatesDirty(ctx);
            const templateIds = created.map((c) => c.id).filter(Boolean);
            if (templateIds.length) {
              pushAgentUndo(userId, {
                type: 'delete_template_ids',
                label: `Created Mon–Fri templates for "${title}"`,
                templateIds,
              });
            }
            return {
              resultText: JSON.stringify(created),
              workContext,
            };
          } catch (e) {
            return { resultText: `Error: ${e.message || 'failed'}`, workContext };
          }
        }

        const routedWd = await tryWeekdayTemplateFromUserMessage(userId, args, lastUser, ctx, 'task', setCtx);
        if (routedWd?.kind === 'error') {
          return { resultText: routedWd.resultText, workContext: mergeWorkContext(workContext, 'schedule') };
        }
        if (routedWd?.kind === 'ok') {
          return {
            resultText: JSON.stringify(routedWd.templates),
            workContext: mergeWorkContext(workContext, 'schedule'),
          };
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
        const target = Number(args?.target) >= 0 ? Number(args.target) : 1;
        const progress = Number(args?.progress) >= 0 ? Number(args.progress) : 0;
        const parent_id = normalizeOptionalUuid(args?.parent_id);
        const parent_type = args?.parent_type ?? (parent_id ? 'note' : null);
        const id = randomUUID();
        const created_at = new Date().toISOString();
        const { rows } = await pool.query(
          `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type)
           VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, userId, title, description, created_at, deadline, target, progress, daily, parent_id, parent_type],
        );
        markTasksDirty(ctx);
        pushAgentUndo(userId, {
          type: 'delete_items',
          label: `Created task "${title}"`,
          noteIds: [],
          taskIds: [id],
        });
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
        if (patch.parent_id !== undefined) patch.parent_id = normalizeOptionalUuid(patch.parent_id);
        if (Object.keys(patch).length === 0) return { resultText: 'No valid fields to update', workContext };
        const before = structuredClone(row);
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
        pushAgentUndo(userId, {
          type: 'restore_note_row',
          label: `Updated note "${before.title || id}"`,
          before,
        });
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
        if (patch.parent_id !== undefined) patch.parent_id = normalizeOptionalUuid(patch.parent_id);
        if (Object.keys(patch).length === 0) return { resultText: 'No valid fields to update', workContext };
        const before = structuredClone(row);
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
        pushAgentUndo(userId, {
          type: 'restore_task_row',
          label: `Updated task "${before.title || id}"`,
          before,
        });
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
        const snapshot = await loadFullNotesTasksSnapshot(userId, sets.noteIds, sets.taskIds);
        await deleteNoteAndTaskIds(userId, sets);
        markNotesDirty(ctx);
        markTasksDirty(ctx);
        pushAgentUndo(userId, {
          type: 'restore_graph',
          label: cascade
            ? `Deleted note "${row.title}" and subtree (${sets.noteIds.length} notes, ${sets.taskIds.length} tasks)`
            : `Deleted note "${row.title}"`,
          notes: snapshot.notes,
          tasks: snapshot.tasks,
        });
        return {
          resultText: JSON.stringify({
            ok: true,
            deleted: sets,
            undo: 'Reversible: call undo_agent_action if the user wants this back.',
          }),
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
        const snapshot = await loadFullNotesTasksSnapshot(userId, sets.noteIds, sets.taskIds);
        await deleteNoteAndTaskIds(userId, sets);
        markNotesDirty(ctx);
        markTasksDirty(ctx);
        pushAgentUndo(userId, {
          type: 'restore_graph',
          label: cascade
            ? `Deleted task "${row.title}" and subtree (${sets.noteIds.length} notes, ${sets.taskIds.length} tasks)`
            : `Deleted task "${row.title}"`,
          notes: snapshot.notes,
          tasks: snapshot.tasks,
        });
        return {
          resultText: JSON.stringify({
            ok: true,
            deleted: sets,
            undo: 'Reversible: call undo_agent_action if the user wants this back.',
          }),
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
          const created = await executeScheduleTemplateCreates(userId, argsEffective);
          markTemplatesDirty(ctx);
          const templateIds = created.map((c) => c.id).filter(Boolean);
          if (templateIds.length) {
            pushAgentUndo(userId, {
              type: 'delete_template_ids',
              label: `Created schedule template(s) "${String(argsEffective?.name || '').trim() || 'Template'}"`,
              templateIds,
            });
          }
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
        const tplBefore = structuredClone(own[0]);
        const { rows: itemsBefore } = await pool.query(
          'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
          [tid],
        );
        try {
          const meta = {};
          for (const key of ['name', 'description', 'schedule_kind', 'schedule_value']) {
            if (args[key] !== undefined) {
              let v = args[key];
              if (key === 'schedule_kind' && v != null) {
                let sk = String(v).toLowerCase();
                if (sk === 'weekday') sk = 'weekdays';
                if (sk === 'date') sk = 'more';
                v = sk;
              }
              meta[key] = v;
            }
          }
          const sets = [];
          const vals = [];
          let pi = 1;
          for (const [key, val] of Object.entries(meta)) {
            sets.push(`${key} = $${pi++}`);
            vals.push(val);
          }
          if (args.schedule_rules !== undefined) {
            sets.push(`schedule_rules = $${pi++}::jsonb`);
            vals.push(
              JSON.stringify(typeof args.schedule_rules === 'object' && args.schedule_rules ? args.schedule_rules : {}),
            );
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
          pushAgentUndo(userId, {
            type: 'restore_schedule_template',
            label: `Updated template "${tplBefore.name || tid}"`,
            template: tplBefore,
            items: itemsBefore.map((it) => structuredClone(it)),
          });
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
        const tplRow = own[0];
        const { rows: items } = await pool.query(
          'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
          [tid],
        );
        await pool.query('DELETE FROM schedule_templates WHERE id = $1 AND user_id = $2', [tid, userId]);
        markTemplatesDirty(ctx);
        pushAgentUndo(userId, {
          type: 'restore_schedule_template',
          label: `Deleted template "${tplRow.name || tid}"`,
          template: structuredClone(tplRow),
          items: items.map((it) => structuredClone(it)),
        });
        return {
          resultText: JSON.stringify({
            ok: true,
            deleted_template_id: tid,
            undo: 'Reversible: call undo_agent_action to restore this template.',
          }),
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

const MUTATING_AGENT_TOOLS = new Set([
  'create_note',
  'create_task',
  'create_schedule_template',
  'update_note',
  'update_task',
  'update_schedule_template',
  'delete_note',
  'delete_task',
  'delete_schedule_template',
  'undo_agent_action',
]);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isMutatingAgentTool(name) {
  return MUTATING_AGENT_TOOLS.has(name);
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @returns {string}
 */
function formatPendingMutationSummary(tool, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (tool === 'create_note') {
    const t = String(a.title || '').trim() || 'Untitled';
    return `Create note “${t}”`;
  }
  if (tool === 'create_task') {
    const t = String(a.title || '').trim() || 'Untitled';
    return `Create task “${t}”`;
  }
  if (tool === 'create_schedule_template') {
    const n = String(a.name || '').trim() || 'Template';
    const items = Array.isArray(a.items) ? a.items : [];
    const sk = String(a.schedule_kind || '').trim() || 'weekdays';
    return `Create schedule template “${n}” (${sk}, ${items.length || '?'} item(s))`;
  }
  if (tool === 'update_note' || tool === 'update_task' || tool === 'update_schedule_template') {
    return `${tool.replace(/_/g, ' ')} id ${String(a.id || '').slice(0, 8)}…`;
  }
  if (tool === 'delete_note' || tool === 'delete_task' || tool === 'delete_schedule_template') {
    return `${tool.replace(/_/g, ' ')} id ${String(a.id || '').slice(0, 8)}…`;
  }
  if (tool === 'undo_agent_action') {
    return `Undo last agent action(s) (count ${Number(a.count) || 1})`;
  }
  return tool;
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} args
 */
export function buildPendingMutationEntry(tool, args) {
  const safeArgs =
    args && typeof args === 'object' ? JSON.parse(JSON.stringify(args)) : {};
  return {
    id: randomUUID(),
    tool,
    arguments: safeArgs,
    summary: formatPendingMutationSummary(tool, safeArgs),
  };
}

/**
 * @param {string} userId
 * @param {Array<{ tool: string, arguments: object }>} actions
 * @param {string} [contextUserMessage]
 */
export async function executeConfirmedActions(userId, actions, contextUserMessage = '') {
  const results = [];
  for (const a of actions) {
    const tool = a.tool;
    const args = a.arguments || {};
    try {
      if (tool === 'create_note') {
        const ctxStub = { dirty: { notes: false, tasks: false, templates: false } };
        const routedN = await tryWeekdayTemplateFromUserMessage(
          userId,
          args,
          contextUserMessage,
          ctxStub,
          'note',
          () => {},
        );
        if (routedN?.kind === 'ok') {
          results.push({ ok: true, tool: 'create_schedule_template', templates: routedN.templates });
          continue;
        }
        if (routedN?.kind === 'error') {
          results.push({ ok: false, tool, error: routedN.resultText });
          continue;
        }
        const title = String(args.title || '').trim() || 'Untitled';
        const description = String(args.description ?? '');
        const daily = Boolean(args.daily);
        const deadline = normalizeDeadlineForStorage(args.deadline != null ? String(args.deadline) : null, daily);
        const parent_id = normalizeOptionalUuid(args.parent_id);
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
        const ctxStub = { dirty: { notes: false, tasks: false, templates: false } };
        const routedT = await tryWeekdayTemplateFromUserMessage(
          userId,
          args,
          contextUserMessage,
          ctxStub,
          'task',
          () => {},
        );
        if (routedT?.kind === 'ok') {
          results.push({ ok: true, tool: 'create_schedule_template', templates: routedT.templates });
          continue;
        }
        if (routedT?.kind === 'error') {
          results.push({ ok: false, tool, error: routedT.resultText });
          continue;
        }
        const title = String(args.title || '').trim() || 'Untitled';
        const description = String(args.description ?? '');
        const daily = Boolean(args.daily);
        const deadline = normalizeDeadlineForStorage(args.deadline != null ? String(args.deadline) : null, daily);
        const target = Number(args.target) >= 0 ? Number(args.target) : 1;
        const progress = Number(args.progress) >= 0 ? Number(args.progress) : 0;
        const parent_id = normalizeOptionalUuid(args.parent_id);
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
        if (patch.parent_id !== undefined) patch.parent_id = normalizeOptionalUuid(patch.parent_id);
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
        if (patch.parent_id !== undefined) patch.parent_id = normalizeOptionalUuid(patch.parent_id);
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
          const enriched = enrichScheduleTemplateArgs(args, contextUserMessage);
          const created = await executeScheduleTemplateCreates(userId, enriched);
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
            if (args[key] !== undefined) {
              let v = args[key];
              if (key === 'schedule_kind' && v != null) {
                let sk = String(v).toLowerCase();
                if (sk === 'weekday') sk = 'weekdays';
                if (sk === 'date') sk = 'more';
                v = sk;
              }
              meta[key] = v;
            }
          }
          const sets = [];
          const vals = [];
          let pi = 1;
          for (const [key, val] of Object.entries(meta)) {
            sets.push(`${key} = $${pi++}`);
            vals.push(val);
          }
          if (args.schedule_rules !== undefined) {
            sets.push(`schedule_rules = $${pi++}::jsonb`);
            vals.push(
              JSON.stringify(typeof args.schedule_rules === 'object' && args.schedule_rules ? args.schedule_rules : {}),
            );
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
      if (tool === 'undo_agent_action') {
        const raw = args?.count ?? args?.steps ?? 1;
        const count = Math.min(5, Math.max(1, Number(raw) || 1));
        const res = await undoAgentActions(userId, count);
        results.push({ ok: true, tool, item: res });
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
      description:
        'Return authoritative markdown for NoteTasks tabs, data model, deadlines, schedule templates, and mutation rules. Call when unsure about app behavior; not needed for purely general conversation.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_agent_undo',
      description:
        'List recent Jarvis mutations that can be undone (newest first). Use when the user asks to undo, revert, or restore something.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'undo_agent_action',
      description:
        'Undo recent Jarvis mutations (deletes, creates, updates, templates). Default count is 1 (most recent). Max 5 per call.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'How many steps to undo, starting from the most recent (default 1, max 5).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description:
        'List the user notes. Use completed:true to list items on the Completed tab; completed:false for active only.',
      parameters: {
        type: 'object',
        properties: {
          daily: { type: 'boolean', description: 'If set, filter to daily (true) or non-daily (false).' },
          completed: { type: 'boolean', description: 'true = Completed tab; false = not completed.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'List the user tasks. Use completed:true for Completed tab items; completed:false for active only.',
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
        'Create a one-off or daily-calendar note. Set daily=true ONLY for every calendar day (including weekends). Do NOT put "every Friday", "weekly on Monday", etc. in title/description instead of scheduling — use create_schedule_template or ask the user to clarify. Do NOT use daily=true for weekdays-only; use templates.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          daily: { type: 'boolean' },
          deadline: { type: 'string', description: 'ISO datetime or HH:mm for daily' },
          time_hint: { type: 'string', description: 'Natural language time e.g. "5pm" for daily items' },
          parent_id: {
            type: 'string',
            description: 'Parent note/task UUID if nested; omit or null for top-level. Never use the literal string "none".',
          },
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
        'Create a one-off or daily-calendar task. Default target=1 and progress=0 if omitted. Do NOT encode "every Friday" / weekdays / monthly patterns only in title or description — use create_schedule_template or ask which schedule they want. daily=true ONLY for every calendar day; weekdays-only → template with weekdays.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          daily: { type: 'boolean' },
          deadline: { type: 'string' },
          time_hint: { type: 'string' },
          target: { type: 'number', description: 'Default 1 if omitted.' },
          progress: { type: 'number', description: 'Default 0 if omitted.' },
          parent_id: {
            type: 'string',
            description: 'Parent note/task UUID if nested; omit or null for top-level. Never use the literal string "none".',
          },
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
          parent_id: {
            type: 'string',
            nullable: true,
            description: 'UUID or null to detach; never the string "none".',
          },
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
          parent_id: {
            type: 'string',
            nullable: true,
            description: 'UUID or null to detach; never the string "none".',
          },
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
      description:
        'List schedule templates. Kinds: none (manual list only), daily, weekdays (pick days), dates (month days 1–31), more (yearly MM-DD list). Multiple templates can match the same day.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_schedule_template',
      description:
        'Create ONE schedule template for recurring items (specific weekdays, month days, yearly dates, template-daily, or none/list-only). Item titles should describe the action only — not "every Friday" as a substitute for rules. Map user-mentioned days/dates into weekdays[], month_days, or schedule_rules.yearlyDates. If the user said "template" but schedule type or which days/dates is unclear, ask in chat before calling. schedule_kind: none | daily | weekdays | dates | more; weekdays[] or weekday_preset monday_to_friday → schedule_rules.weekdays; month_days → monthDays; yearlyDates MM-DD in schedule_rules.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Optional; if omitted the server uses the first item title.',
          },
          description: { type: 'string' },
          schedule_kind: {
            type: 'string',
            enum: ['none', 'daily', 'weekdays', 'dates', 'more', 'weekday', 'date'],
            description: 'weekday/date are aliases for weekdays/more. Ignored when weekdays[] or weekday_preset is set.',
          },
          schedule_value: { type: 'string', description: 'Single weekday name or single MM-DD when not using schedule_rules.' },
          schedule_rules: {
            type: 'object',
            description: 'Optional { weekdays: string[], monthDays: number[], yearlyDates: string[] }',
          },
          month_days: { type: 'array', items: { type: 'number' }, description: 'For schedule_kind dates: days 1–31 of each month.' },
          weekdays: { type: 'array', items: { type: 'string' } },
          weekdays_csv: { type: 'string' },
          weekday_preset: { type: 'string', enum: ['monday_to_friday', 'weekdays', 'weekdays_only'] },
          items: {
            type: 'array',
            minItems: 1,
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
        required: ['items'],
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
          schedule_kind: { type: 'string', enum: ['none', 'daily', 'weekdays', 'dates', 'more', 'weekday', 'date'] },
          schedule_value: { type: 'string' },
          schedule_rules: { type: 'object' },
          month_days: { type: 'array', items: { type: 'number' } },
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
      description:
        'Delete a schedule template immediately (items cascade). Reversible via undo_agent_action while the undo stack still holds the snapshot.',
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
      description:
        'Delete a note immediately; cascade (default true) removes its subtree. Reversible via undo_agent_action.',
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
      description: 'Delete a task immediately; cascade default true. Reversible via undo_agent_action.',
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
