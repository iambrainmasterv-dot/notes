import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const day = req.query.day;
  if (!day) return res.status(400).json({ error: 'day query param required' });
  const { rows } = await pool.query(
    'SELECT * FROM daily_instances WHERE user_id = $1 AND day_date = $2',
    [req.userId, day],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { id, day_date, source_template_id, preset_id, type, title, description, deadline_time, target, progress, completed, created_at } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO daily_instances (id, user_id, day_date, source_template_id, preset_id, type, title, description, deadline_time, target, progress, completed, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [id, req.userId, day_date, source_template_id, preset_id, type, title, description, deadline_time, target, progress, completed, created_at],
  );
  res.json(rows[0]);
});

router.post('/bulk', async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
  const inserted = [];
  for (const it of items) {
    const { rows } = await pool.query(
      `INSERT INTO daily_instances (id, user_id, day_date, source_template_id, preset_id, type, title, description, deadline_time, target, progress, completed, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [it.id, req.userId, it.day_date, it.source_template_id, it.preset_id, it.type, it.title, it.description, it.deadline_time, it.target, it.progress, it.completed, it.created_at],
    );
    inserted.push(rows[0]);
  }
  res.json(inserted);
});

router.patch('/:id', async (req, res) => {
  const allowed = ['title', 'description', 'completed', 'progress', 'target', 'deadline_time'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(req.body[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id, req.userId);
  const { rows } = await pool.query(
    `UPDATE daily_instances SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM daily_instances WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

router.delete('/by-day/preset', async (req, res) => {
  const day = req.query.day;
  if (!day) return res.status(400).json({ error: 'day required' });
  await pool.query(
    'DELETE FROM daily_instances WHERE user_id = $1 AND day_date = $2 AND preset_id IS NOT NULL',
    [req.userId, day],
  );
  res.json({ ok: true });
});

router.get('/template-ids', async (req, res) => {
  const day = req.query.day;
  if (!day) return res.status(400).json({ error: 'day required' });
  const { rows } = await pool.query(
    'SELECT source_template_id FROM daily_instances WHERE user_id = $1 AND day_date = $2 AND source_template_id IS NOT NULL',
    [req.userId, day],
  );
  res.json(rows.map((r) => r.source_template_id));
});

export default router;
