import { Router } from 'express';

const router = Router();

/** @type {{ sessionId: string, text: string }[]} */
let segments = [];
const sseClients = new Set();

const MAX_SEG_LEN = 120_000;
const MAX_TOTAL = 600_000;

function totalLen() {
  return segments.reduce((a, s) => a + s.text.length, 0);
}

function broadcast() {
  const payload = JSON.stringify({ segments });
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function appendText(sessionId, add) {
  if (!add || typeof add !== 'string') return;
  const chunk = add.slice(0, MAX_SEG_LEN);
  if (totalLen() + chunk.length > MAX_TOTAL) return;
  const last = segments[segments.length - 1];
  if (last && last.sessionId === sessionId) {
    const room = MAX_SEG_LEN - last.text.length;
    if (room > 0) last.text += chunk.slice(0, room);
  } else {
    segments.push({ sessionId, text: chunk.slice(0, MAX_SEG_LEN) });
  }
}

function deleteChars(sessionId, n) {
  let left = Math.min(500, Math.max(0, Math.floor(Number(n)) || 0));
  if (left <= 0) return;
  while (left > 0 && segments.length > 0) {
    let hit = false;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].sessionId !== sessionId) continue;
      hit = true;
      const t = segments[i].text;
      const take = Math.min(left, t.length);
      segments[i].text = t.slice(0, t.length - take);
      left -= take;
      if (segments[i].text.length === 0) segments.splice(i, 1);
      break;
    }
    if (!hit) break;
  }
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ segments })}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

router.post('/append', (req, res) => {
  const { sessionId, add, del } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 80) {
    return res.status(400).json({ error: 'bad session' });
  }
  if (add != null) appendText(sessionId, String(add));
  if (del != null) deleteChars(sessionId, del);
  broadcast();
  res.json({ ok: true });
});

router.post('/leave', (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'bad session' });
  }
  segments = segments.filter((s) => s.sessionId !== sessionId);
  broadcast();
  res.json({ ok: true });
});

export default router;
