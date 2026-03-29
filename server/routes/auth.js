import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { signToken, authMiddleware } from '../auth.js';
import { isSmtpConfigured, sendPasswordResetEmail } from '../services/mail.js';

const router = Router();

const FORGOT_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_MAX_PER_WINDOW = 8;
/** @type {Map<string, { n: number; resetAt: number }>} */
const forgotBuckets = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkForgotRateLimit(ip) {
  const now = Date.now();
  let b = forgotBuckets.get(ip);
  if (!b || now > b.resetAt) {
    b = { n: 0, resetAt: now + FORGOT_WINDOW_MS };
    forgotBuckets.set(ip, b);
  }
  b.n += 1;
  return b.n <= FORGOT_MAX_PER_WINDOW;
}

const FORGOT_OK_MESSAGE =
  'If an account exists for that email, we sent password reset instructions. Check your inbox.';

function allowDevPasswordResetLink() {
  return (
    process.env.NODE_ENV !== 'production' || String(process.env.DEV_PASSWORD_RESET_LINK || '').toLowerCase() === 'true'
  );
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
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
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
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

router.post('/forgot-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const ip = clientIp(req);
  if (!checkForgotRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many reset requests. Try again in a few minutes.' });
  }

  const mailConfigured = isSmtpConfigured();

  try {
    const { rows } = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      console.info('[auth] forgot-password: no matching user (same response as success for privacy)');
      return res.json({
        ok: true,
        message: FORGOT_OK_MESSAGE,
        mailConfigured,
        emailSent: null,
      });
    }

    const user = rows[0];

    if (!mailConfigured) {
      console.warn('[auth] forgot-password: SMTP not configured; reset email not sent');
      return res.json({
        ok: true,
        message: FORGOT_OK_MESSAGE,
        mailConfigured: false,
        emailSent: false,
      });
    }

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt],
    );

    const base = (process.env.APP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${base}/?reset=${encodeURIComponent(rawToken)}`;

    const devLinkOk = allowDevPasswordResetLink();
    let emailSent = false;
    let mailError;

    const result = await sendPasswordResetEmail({ to: user.email, resetUrl });
    emailSent = Boolean(result.sent);
    mailError = result.error;

    if (!emailSent) {
      console.warn('[auth] forgot-password: email not sent', mailError || '');
      if (!devLinkOk) {
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
      } else {
        console.warn(
          '[auth] forgot-password: keeping reset token for local dev — open reset link from API response or server logs',
        );
        console.warn('[auth] dev reset URL:', resetUrl);
      }
    }

    return res.json({
      ok: true,
      message: FORGOT_OK_MESSAGE,
      mailConfigured: true,
      emailSent,
      ...(mailError && !emailSent ? { mailError } : {}),
      ...(devLinkOk && !emailSent ? { devResetUrl: resetUrl } : {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function normalizeResetToken(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').toLowerCase();
}

router.post('/reset-password', async (req, res) => {
  const token = normalizeResetToken(typeof req.body?.token === 'string' ? req.body.token : '');
  const { password } = req.body;
  if (!token || password == null) return res.status(400).json({ error: 'Token and password required' });
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const { rows } = await pool.query(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now()',
      [tokenHash],
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset link. Request a new one.' });

    const userId = rows[0].user_id;
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    res.json({ ok: true });
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
