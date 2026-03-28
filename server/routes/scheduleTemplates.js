import { Router } from 'express';
import { pool } from '../db.js';
import { templateMatchesOccurrence } from '../utils/scheduleTemplate.js';

const router = Router();

function jsonRules(val) {
  if (val == null) return '{}';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

// GET all templates with nested items
router.get('/', async (req, res) => {
  const { rows: templates } = await pool.query(
    'SELECT * FROM schedule_templates WHERE user_id = $1 ORDER BY created_at',
    [req.userId],
  );
  const result = [];
  for (const t of templates) {
    const { rows: items } = await pool.query(
      'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
      [t.id],
    );
    result.push({ ...t, items });
  }
  res.json(result);
});

// CREATE template + items in one go
router.post('/', async (req, res) => {
  const { id, name, description, schedule_kind, schedule_value, schedule_rules, items } = req.body;
  const kind = (schedule_kind ?? 'none').toString().toLowerCase();
  const rulesJson = jsonRules(schedule_rules ?? {});
  await pool.query(
    `INSERT INTO schedule_templates (id, user_id, name, description, schedule_kind, schedule_value, schedule_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [id, req.userId, name ?? '', description ?? '', kind, schedule_value ?? null, rulesJson],
  );
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [it.id, id, it.type, it.title, it.description ?? '', it.deadline_time ?? null, it.target ?? null, i],
      );
    }
  }
  const { rows: items2 } = await pool.query(
    'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
    [id],
  );
  const {
    rows: [template],
  } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1', [id]);
  res.json({ ...template, items: items2 });
});

// UPDATE template metadata (and optionally replace items)
router.patch('/:id', async (req, res) => {
  const { name, description, schedule_kind, schedule_value, schedule_rules, items } = req.body;
  const sets = [];
  const vals = [];
  let i = 1;
  const meta = { name, description, schedule_kind, schedule_value };
  for (const [key, val] of Object.entries(meta)) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(key === 'schedule_kind' ? String(val).toLowerCase() : val);
    }
  }
  if (schedule_rules !== undefined) {
    sets.push(`schedule_rules = $${i++}::jsonb`);
    vals.push(jsonRules(schedule_rules));
  }
  if (sets.length > 0) {
    vals.push(req.params.id, req.userId);
    await pool.query(
      `UPDATE schedule_templates SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
      vals,
    );
  }
  if (Array.isArray(items)) {
    await pool.query('DELETE FROM schedule_template_items WHERE template_id = $1', [req.params.id]);
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      await pool.query(
        `INSERT INTO schedule_template_items (id, template_id, type, title, description, deadline_time, target, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [it.id, req.params.id, it.type, it.title, it.description ?? '', it.deadline_time ?? null, it.target ?? null, j],
      );
    }
  }
  res.json({ ok: true });
});

// DELETE template (cascade deletes items)
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM schedule_templates WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

// MATERIALIZE: idempotent insert of notes/tasks for a template on a given date
router.post('/materialize', async (req, res) => {
  const { template_id, occurrence_date } = req.body;
  if (!template_id || !occurrence_date) return res.status(400).json({ error: 'template_id and occurrence_date required' });

  const {
    rows: [tpl],
  } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1 AND user_id = $2', [template_id, req.userId]);
  if (!tpl) return res.status(404).json({ error: 'template not found' });

  if (!templateMatchesOccurrence(tpl, occurrence_date)) {
    return res.json({ materialized: 0 });
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM notes WHERE user_id = $1 AND source_schedule_template_id = $2 AND source_occurrence_date = $3
     UNION ALL
     SELECT id FROM tasks WHERE user_id = $1 AND source_schedule_template_id = $2 AND source_occurrence_date = $3`,
    [req.userId, template_id, occurrence_date],
  );
  if (existing.length > 0) return res.json({ materialized: 0 });

  const { rows: items } = await pool.query(
    'SELECT * FROM schedule_template_items WHERE template_id = $1 ORDER BY sort_order',
    [template_id],
  );
  let count = 0;
  for (const it of items) {
    if (it.type === 'note') {
      await pool.query(
        `INSERT INTO notes (user_id, title, description, completed, created_at, deadline, daily, source_schedule_template_id, source_occurrence_date)
         VALUES ($1, $2, $3, false, $4, $5, true, $6, $7)`,
        [req.userId, it.title, it.description, new Date().toISOString(), it.deadline_time ?? null, template_id, occurrence_date],
      );
    } else {
      await pool.query(
        `INSERT INTO tasks (user_id, title, description, completed, created_at, deadline, target, progress, daily, source_schedule_template_id, source_occurrence_date)
         VALUES ($1, $2, $3, false, $4, $5, $6, 0, true, $7, $8)`,
        [req.userId, it.title, it.description, new Date().toISOString(), it.deadline_time ?? null, it.target ?? 10, template_id, occurrence_date],
      );
    }
    count++;
  }
  res.json({ materialized: count });
});

// CLEANUP: remove materialized template rows for a date only when template is not "none" and at least one item has a time
router.post('/cleanup', async (req, res) => {
  const { occurrence_date } = req.body;
  if (!occurrence_date) return res.status(400).json({ error: 'occurrence_date required' });

  const noteSql = `
    DELETE FROM notes n
    WHERE n.user_id = $1
      AND n.source_occurrence_date = $2::date
      AND n.source_schedule_template_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM schedule_templates t
        WHERE t.id = n.source_schedule_template_id
          AND t.user_id = n.user_id
          AND lower(t.schedule_kind) <> 'none'
          AND EXISTS (
            SELECT 1 FROM schedule_template_items i
            WHERE i.template_id = t.id
              AND i.deadline_time IS NOT NULL
              AND trim(i.deadline_time) <> ''
          )
      )
  `;
  const taskSql = `
    DELETE FROM tasks tsk
    WHERE tsk.user_id = $1
      AND tsk.source_occurrence_date = $2::date
      AND tsk.source_schedule_template_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM schedule_templates t
        WHERE t.id = tsk.source_schedule_template_id
          AND t.user_id = tsk.user_id
          AND lower(t.schedule_kind) <> 'none'
          AND EXISTS (
            SELECT 1 FROM schedule_template_items i
            WHERE i.template_id = t.id
              AND i.deadline_time IS NOT NULL
              AND trim(i.deadline_time) <> ''
          )
      )
  `;
  await pool.query(noteSql, [req.userId, occurrence_date]);
  await pool.query(taskSql, [req.userId, occurrence_date]);
  res.json({ ok: true });
});

export default router;
