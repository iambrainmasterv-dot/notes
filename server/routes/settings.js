import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [req.userId]);
    const { rows: r2 } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
    return res.json(r2[0]);
  }
  res.json(rows[0]);
});

router.patch('/', async (req, res) => {
  const allowed = [
    'daily_reset_time',
    'theme_mode',
    'accent',
    'ui_scale',
    'font_scale',
    'last_reset_tag',
    'ai_agent_mutations_enabled',
  ];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      vals.push(req.body[key]);
      sets.push(`${key} = $${i++}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.userId);
  const { rows } = await pool.query(
    `UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = $${i} RETURNING *`,
    vals,
  );
  res.json(rows[0]);
});

export default router;
