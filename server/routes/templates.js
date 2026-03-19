import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM daily_templates WHERE user_id = $1 ORDER BY created_at',
    [req.userId],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { id, type, title, description, deadline_time, target, created_at } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO daily_templates (id, user_id, type, title, description, deadline_time, target, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, req.userId, type, title, description, deadline_time, target, created_at],
  );
  res.json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const allowed = ['type', 'title', 'description', 'deadline_time', 'target'];
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
    `UPDATE daily_templates SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals,
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM daily_templates WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

export default router;
