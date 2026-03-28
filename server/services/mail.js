import nodemailer from 'nodemailer';

let transporter = null;

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim());
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

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port,
      secure,
      requireTLS,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      tls,
      auth:
        process.env.SMTP_USER != null && String(process.env.SMTP_USER).length > 0
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
    });
  }
  return transporter;
}

/**
 * @param {{ to: string; resetUrl: string }} opts
 * @returns {Promise<{ sent: boolean; error?: string }>}
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const t = getTransport();
  if (!t) return { sent: false };

  const from =
    process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'NoteTasks <noreply@localhost>';

  try {
    await t.sendMail({
      from,
      to,
      subject: 'Reset your NoteTasks password',
      text: `You requested a password reset. Open this link (valid for one hour):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[mail] sendPasswordResetEmail failed:', message);
    return { sent: false, error: message };
  }
}
