import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const OLLAMA_URL_MAX = 2048;

/** @param {unknown} raw */
function normalizeOllamaBaseUrl(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new Error('ollama_base_url must be a string or null');
  const s = raw.trim();
  if (!s) return null;
  if (s.length > OLLAMA_URL_MAX) throw new Error('ollama_base_url is too long');
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('ollama_base_url must be a valid http(s) URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('ollama_base_url must use http or https');
  }
  if (!u.hostname) throw new Error('ollama_base_url needs a hostname');
  return s.replace(/\/$/, '');
}

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
    'ollama_base_url',
  ];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'ollama_base_url') {
        try {
          vals.push(normalizeOllamaBaseUrl(req.body[key]));
        } catch (e) {
          return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid ollama_base_url' });
        }
      } else {
        vals.push(req.body[key]);
      }
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
