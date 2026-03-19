import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { signToken, authMiddleware } from '../auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  // #region agent log
  fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H3',location:'server/routes/auth.js:signup-entry',message:'Signup route hit',data:{hasEmail:Boolean(email),passwordType:typeof password,passwordLength:typeof password === 'string' ? password.length : null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase().trim(), hash],
    );
    const user = rows[0];

    await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]);

    const token = signToken(user.id, user.email);
    // #region agent log
    fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H4',location:'server/routes/auth.js:signup-success',message:'Signup route success',data:{userId:user.id,email:user.email},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7906/ingest/ba2f83d7-6b60-4b49-929c-a8d1f05581d3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ed1d1'},body:JSON.stringify({sessionId:'2ed1d1',runId:'signup-502-debug',hypothesisId:'H2',location:'server/routes/auth.js:signup-catch',message:'Signup route error caught',data:{code:err?.code ?? null,message:err instanceof Error ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
