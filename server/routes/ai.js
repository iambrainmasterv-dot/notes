import { Router } from 'express';
import { pool } from '../db.js';
import { runAgentChat } from '../services/aiAgent.js';
import { executeConfirmedActions } from '../services/agentExecutor.js';
import { ollamaFetchExtraHeaders } from '../services/ollamaTunnelHeaders.js';

const router = Router();

function isLikelyHostedDeploy() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.FLY_APP_NAME ||
      process.env.RENDER ||
      process.env.VERCEL ||
      process.env.HEROKU_APP_NAME,
  );
}

/** @param {string} base */
function ollamaBaseIsLoopback(base) {
  if (!base || typeof base !== 'string') return false;
  try {
    const u = new URL(base.includes('://') ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

/** @param {string} base */
function cloudLoopbackHint(base) {
  if (!isLikelyHostedDeploy()) return undefined;
  if (ollamaBaseIsLoopback(base)) {
    return 'OLLAMA_BASE_URL is localhost/127.0.0.1. From a hosted API that refers to the cloud server, not your PC. Set OLLAMA_BASE_URL to your tunnel https URL (ngrok, etc.) on Railway and restart.';
  }
  return undefined;
}

function suggestedOllamaModel() {
  const m = (process.env.OLLAMA_MODEL || 'llama3.2').trim();
  return m || 'llama3.2';
}

function getOllamaBaseFromEnv() {
  const env = process.env.OLLAMA_BASE_URL?.trim();
  return env ? env.replace(/\/$/, '') : '';
}

router.get('/availability', async (req, res) => {
  const suggestedModel = suggestedOllamaModel();
  const base = getOllamaBaseFromEnv();
  const hint = cloudLoopbackHint(base);
  const meta = () => ({ suggestedModel, cloudLoopbackHint: hint });
  try {
    if (!base) {
      return res.json({ available: false, ...meta() });
    }
    const versionUrl = `${base}/api/version`;
    const signal = AbortSignal.timeout(2000);
    const r = await fetch(versionUrl, {
      signal,
      headers: ollamaFetchExtraHeaders(base),
    });
    if (!r.ok) {
      return res.json({ available: false, ...meta() });
    }
    const data = await r.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return res.json({ available: false, ...meta() });
    }
    return res.json({ available: true, ...meta() });
  } catch (e) {
    console.error('GET /api/ai/availability', e?.message || e);
    return res.json({ available: false, suggestedModel, cloudLoopbackHint: hint });
  }
});

async function loadMutationFlag(userId) {
  const { rows } = await pool.query(
    'SELECT ai_agent_mutations_enabled FROM user_settings WHERE user_id = $1',
    [userId],
  );
  if (rows.length === 0) return { ai_agent_mutations_enabled: true };
  return rows[0];
}

router.post('/chat', async (req, res) => {
  try {
    const ollamaBase = getOllamaBaseFromEnv();
    if (!ollamaBase) {
      return res.status(503).json({
        error: 'Jarvis is not configured. Set OLLAMA_BASE_URL in the server environment (e.g. your Ollama URL or ngrok https origin), then restart the API.',
      });
    }
    const settingsRow = await loadMutationFlag(req.userId);
    const {
      message,
      pendingConfirmations,
      pendingMutations,
      workContext,
      dirtyNotes,
      dirtyTasks,
      dirtyTemplates,
    } = await runAgentChat({
      userId: req.userId,
      messages: req.body?.messages,
      clientIsoTime: req.body?.clientIsoTime,
      tzOffsetMinutes: req.body?.tzOffsetMinutes,
      settingsRow,
      ollamaBase,
      followUp: req.body?.followUp,
    });
    res.json({
      message,
      pendingConfirmations,
      pendingMutations,
      workContext,
      dirtyNotes,
      dirtyTasks,
      dirtyTemplates,
    });
  } catch (e) {
    if (e.code === 'OLLAMA_UNAVAILABLE') {
      return res.status(503).json({
        error:
          'Cannot reach Ollama. Install and run Ollama locally (https://ollama.com), then pull a model: ollama pull llama3.2',
      });
    }
    if (e.code === 'OLLAMA_NOT_FOUND') {
      return res.status(503).json({
        error:
          'Ollama returned 404 — check OLLAMA_MODEL in server/.env matches a pulled model (e.g. ollama pull llama3.2).',
      });
    }
    console.error('POST /api/ai/chat', e);
    res.status(500).json({ error: e.message || 'Chat failed' });
  }
});

router.post('/execute-actions', async (req, res) => {
  try {
    const settingsRow = await loadMutationFlag(req.userId);
    if (settingsRow.ai_agent_mutations_enabled === false) {
      return res.status(403).json({ error: 'AI mutations are disabled in settings.' });
    }
    const actions = req.body?.actions;
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'actions array required' });
    }
    if (actions.length > 50) {
      return res.status(400).json({ error: 'Too many actions' });
    }
    for (const a of actions) {
      if (!a || typeof a.tool !== 'string' || typeof a.arguments !== 'object' || a.arguments === null) {
        return res.status(400).json({ error: 'Each action needs tool and arguments object' });
      }
    }
    const contextUserMessage =
      typeof req.body?.contextUserMessage === 'string' ? req.body.contextUserMessage : '';
    const { results } = await executeConfirmedActions(req.userId, actions, contextUserMessage);
    res.json({ results });
  } catch (e) {
    console.error('POST /api/ai/execute-actions', e);
    res.status(500).json({ error: e.message || 'Execute failed' });
  }
});

export default router;
