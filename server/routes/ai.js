import { Router } from 'express';
import { pool } from '../db.js';
import { runAgentChat } from '../services/aiAgent.js';
import { executeConfirmedActions } from '../services/agentExecutor.js';

const router = Router();

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
    const { results } = await executeConfirmedActions(req.userId, actions);
    res.json({ results });
  } catch (e) {
    console.error('POST /api/ai/execute-actions', e);
    res.status(500).json({ error: e.message || 'Execute failed' });
  }
});

export default router;
