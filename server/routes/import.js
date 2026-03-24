import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.post('/', async (req, res) => {
  const { notes, tasks, presets } = req.body;

  if (Array.isArray(notes)) {
    for (const n of notes) {
      await pool.query(
        `INSERT INTO notes (id, user_id, title, description, completed, created_at, deadline, parent_id, parent_type, position_x, position_y, collapsed, daily)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [n.id, req.userId, n.title, n.description, n.completed, n.created_at, n.deadline, n.parent_id, n.parent_type ?? null, n.position_x, n.position_y, n.collapsed, n.daily],
      );
    }
  }

  if (Array.isArray(tasks)) {
    for (const t of tasks) {
      await pool.query(
        `INSERT INTO tasks (id, user_id, title, description, completed, created_at, deadline, target, progress, daily, parent_id, parent_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [t.id, req.userId, t.title, t.description, t.completed, t.created_at, t.deadline, t.target, t.progress, t.daily, t.parent_id ?? null, t.parent_type ?? null],
      );
    }
  }

  if (Array.isArray(presets)) {
    for (const p of presets) {
      await pool.query(
        'INSERT INTO presets (id, user_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [p.id, req.userId, p.name],
      );
      if (Array.isArray(p.items)) {
        for (let i = 0; i < p.items.length; i++) {
          const it = p.items[i];
          await pool.query(
            `INSERT INTO preset_items (id, preset_id, type, title, description, deadline_time, target, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
            [it.id, p.id, it.type, it.title, it.description, it.deadline_time, it.target, i],
          );
        }
      }
    }
  }

  res.json({ ok: true });
});

export default router;
