import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE user_id = $1', [req.userId]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type, source_schedule_template_id, source_occurrence_date, completed_at, reminder_minutes_before } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type, source_schedule_template_id, source_occurrence_date, completed_at, reminder_minutes_before)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [id, req.userId, title, description, completed, created_at, deadline, target, progress, daily ?? false, parent_id ?? null, parent_type ?? null, source_schedule_template_id ?? null, source_occurrence_date ?? null, completed_at ?? null, reminder_minutes_before ?? null],
  );
  res.json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const body = { ...req.body };
  if (body.completed === true && body.completed_at === undefined) {
    body.completed_at = new Date().toISOString();
  }
  if (body.completed === false) {
    body.completed_at = null;
  }
  const allowed = ['title', 'description', 'completed', 'deadline', 'target', 'progress', 'daily', 'parent_id', 'parent_type', 'completed_at', 'reminder_minutes_before'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(body[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id, req.userId);
  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

export default router;
