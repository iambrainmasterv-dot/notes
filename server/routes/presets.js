import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows: presetRows } = await pool.query(
    'SELECT * FROM presets WHERE user_id = $1 ORDER BY created_at',
    [req.userId],
  );
  const result = [];
  for (const p of presetRows) {
    const { rows: items } = await pool.query(
      'SELECT * FROM preset_items WHERE preset_id = $1 ORDER BY sort_order',
      [p.id],
    );
    result.push({ ...p, items });
  }
  res.json(result);
});

router.post('/', async (req, res) => {
  const { id, name, items } = req.body;
  await pool.query(
    'INSERT INTO presets (id, user_id, name) VALUES ($1, $2, $3)',
    [id, req.userId, name],
  );
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO preset_items (id, preset_id, type, title, description, deadline_time, target, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [it.id, id, it.type, it.title, it.description, it.deadline_time ?? null, it.target ?? null, i],
      );
    }
  }
  res.json({ ok: true });
});

router.patch('/:id', async (req, res) => {
  if (req.body.name !== undefined) {
    await pool.query(
      'UPDATE presets SET name = $1 WHERE id = $2 AND user_id = $3',
      [req.body.name, req.params.id, req.userId],
    );
  }
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM presets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

export default router;
