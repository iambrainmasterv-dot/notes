import nodemailer from 'nodemailer';

let transporter = null;

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim());
}

/** True if password-reset email can be attempted (SMTP or Resend HTTP API). */
export function isOutboundMailConfigured() {
  const resend = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  return resend || isSmtpConfigured();
}

function resetEmailBodies(resetUrl) {
  const text = `You requested a password reset. Open this link (valid for one hour):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`;
  return {
    subject: 'Reset your NoteTasks password',
    text,
    html,
  };
}

/**
 * HTTPS API — works on hosts that block outbound SMTP (e.g. many PaaS). https://resend.com
 * @returns {Promise<{ sent: boolean; error?: string }>}
 */
async function sendPasswordResetViaResend({ to, resetUrl }) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return { sent: false, error: 'RESEND_API_KEY missing' };

  const from =
    process.env.RESEND_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    'NoteTasks <onboarding@resend.dev>';

  const { subject, text, html } = resetEmailBodies(resetUrl);

  const timeoutMs = Math.min(Math.max(Number(process.env.RESEND_TIMEOUT_MS) || 25_000, 5_000), 120_000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      const errMsg = `Resend HTTP ${res.status}: ${body.slice(0, 400)}`;
      console.error('[mail] Resend failed:', errMsg);
      return { sent: false, error: errMsg };
    }
    const data = await res.json().catch(() => ({}));
    console.info('[mail] password reset sent via Resend', data.id || '');
    return { sent: true };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[mail] Resend request failed:', message);
    return { sent: false, error: message };
  }
}

function getTransport() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true';
    /** Helps Gmail, Outlook, and many hosts on port 587 (STARTTLS). */
    const requireTLS = !secure && port === 587;
    const tls =
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false'
        ? { rejectUnauthorized: false }
        : undefined;

    const smtpUser = process.env.SMTP_USER != null ? String(process.env.SMTP_USER).trim() : '';
    const smtpPass = String(process.env.SMTP_PASS ?? '').trim();
    const connMs = Math.min(Math.max(Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 45_000, 5_000), 120_000);
    const greetMs = Math.min(Math.max(Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 30_000, 5_000), 120_000);

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port,
      secure,
      requireTLS,
      connectionTimeout: connMs,
      greetingTimeout: greetMs,
      tls,
      auth: smtpUser.length > 0 ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }
  return transporter;
}

/**
 * @param {{ to: string; resetUrl: string }} opts
 * @returns {Promise<{ sent: boolean; error?: string }>}
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (String(process.env.RESEND_API_KEY || '').trim()) {
    return sendPasswordResetViaResend({ to, resetUrl });
  }

  const t = getTransport();
  if (!t) return { sent: false };

  const from =
    process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'NoteTasks <noreply@localhost>';

  const { subject, text, html } = resetEmailBodies(resetUrl);

  try {
    const info = await t.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.info('[mail] password reset send accepted', info.messageId || '(no messageId)');
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[mail] sendPasswordResetEmail failed:', message);
    return { sent: false, error: message };
  }
}
