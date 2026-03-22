import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

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
  const { id, name, description, schedule_kind, schedule_value, items } = req.body;
  await pool.query(
    `INSERT INTO schedule_templates (id, user_id, name, description, schedule_kind, schedule_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, req.userId, name ?? '', description ?? '', schedule_kind ?? 'none', schedule_value ?? null],
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
  const { rows: [template] } = await pool.query('SELECT * FROM schedule_templates WHERE id = $1', [id]);
  res.json({ ...template, items: items2 });
});

// UPDATE template metadata (and optionally replace items)
router.patch('/:id', async (req, res) => {
  const { name, description, schedule_kind, schedule_value, items } = req.body;
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, val] of Object.entries({ name, description, schedule_kind, schedule_value })) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(val);
    }
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

// CLEANUP: delete all materialized notes/tasks for a specific occurrence date
router.post('/cleanup', async (req, res) => {
  const { occurrence_date } = req.body;
  if (!occurrence_date) return res.status(400).json({ error: 'occurrence_date required' });
  await pool.query(
    'DELETE FROM notes WHERE user_id = $1 AND source_occurrence_date = $2',
    [req.userId, occurrence_date],
  );
  await pool.query(
    'DELETE FROM tasks WHERE user_id = $1 AND source_occurrence_date = $2',
    [req.userId, occurrence_date],
  );
  res.json({ ok: true });
});

export default router;
