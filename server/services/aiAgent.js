import { AGENT_TOOL_DEFINITIONS, runAgentTool } from './agentExecutor.js';
import { isClearMutationIntent, mergeWorkContext } from './intentPolicy.js';
import { ollamaFetchExtraHeaders } from './ollamaTunnelHeaders.js';

const MAX_CLIENT_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;
const MAX_TOOL_STEPS = 12;

/** Must match tool `function.name` values in agentExecutor */
const CANONICAL_TOOLS = [
  'get_app_capabilities',
  'list_notes',
  'list_tasks',
  'create_note',
  'create_task',
  'update_note',
  'update_task',
  'list_schedule_templates',
  'create_schedule_template',
  'update_schedule_template',
  'delete_schedule_template',
  'delete_note',
  'delete_task',
];

function normalizeAgentToolName(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim().toLowerCase().replace(/-/g, '_');
  const compact = s.replace(/_/g, '');
  for (const canonical of CANONICAL_TOOLS) {
    if (canonical === s) return canonical;
    if (canonical.replace(/_/g, '') === compact) return canonical;
  }
  return s;
}

function fallbackOllamaBaseUrl() {
  const raw = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  return String(raw).replace(/\/$/, '');
}

function ollamaModel() {
  return (process.env.OLLAMA_MODEL || 'llama3.2').trim() || 'llama3.2';
}

function sanitizeClientMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages.slice(-MAX_CLIENT_MESSAGES)) {
    if (m?.role !== 'user' && m?.role !== 'assistant') continue;
    let content = typeof m.content === 'string' ? m.content : '';
    if (content.length > MAX_MESSAGE_CHARS) content = `${content.slice(0, MAX_MESSAGE_CHARS)}…`;
    out.push({ role: m.role, content });
  }
  return out;
}

function buildSystemPrompt({ clientIsoTime, tzOffsetMinutes, mutationsEnabled }) {
  const timeLine =
    clientIsoTime && typeof clientIsoTime === 'string'
      ? `User-reported local time (ISO): ${clientIsoTime}.`
      : 'Local time not provided by client.';
  const tzLine =
    typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)
      ? `Browser timezone offset minutes (Date.getTimezoneOffset): ${tzOffsetMinutes}.`
      : '';

  return [
    'You are Jarvis, the in-app AI for NoteTasks (Pool, Schedule, Notes, Tasks, Completed, Jarvis tab, Settings). Be brief: default to 1–3 short sentences; expand only if asked.',
    'Use tools for any data read/write; never guess ids. Before update/delete (or nested create), call list_notes and/or list_tasks unless you already have the correct id from this turn.',
    'Notes: title + description; optional deadline (full datetime or HH:mm for daily). Tasks: title + target (number, default 1) + progress; same deadline rules. Nesting: parentId + parentType (note|task).',
    'daily:true = same item every calendar day (Schedule daily). Mon–Fri / specific weekdays: use schedule templates (create_schedule_template, weekday_preset monday_to_friday), not one daily=true task.',
    'To create a note or task you MUST call create_note or create_task with a title. Never say you created something unless the tool result has an "id" or template success, or explicitly says queued for confirmation.',
    'If the tool result says Unknown tool, queued for confirmation, or mutations disabled, report that — do not claim success.',
    'Never output raw JSON tool calls in chat. There is no get_task/get_note; only use tools provided in this session.',
    'Never claim a delete completed until the user confirmed it in the Jarvis panel.',
    'If mutations are disabled, say they can turn on Allow edits in Settings → Jarvis.',
    `Mutations currently ${mutationsEnabled ? 'ENABLED' : 'DISABLED'} for this user.`,
    timeLine,
    tzLine,
    'For full product rules, call get_app_capabilities.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {unknown} fn
 * @returns {Record<string, unknown>}
 */
function parseToolArguments(fn) {
  if (!fn || typeof fn !== 'object') return {};
  const raw = /** @type {{ arguments?: unknown }} */ (fn).arguments;
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/**
 * Ollama sometimes nests args under `function`, sometimes on the tool_call object.
 * @param {object} tc
 */
function extractToolCall(tc) {
  const fn = tc?.function;
  let name = '';
  if (typeof fn?.name === 'string') name = fn.name;
  else if (typeof tc?.name === 'string') name = tc.name;

  let args = parseToolArguments(fn);
  const top = /** @type {{ arguments?: unknown }} */ (tc)?.arguments;
  if (top != null) {
    let extra = {};
    if (typeof top === 'object' && !Array.isArray(top)) {
      extra = /** @type {Record<string, unknown>} */ (top);
    } else {
      try {
        const p = JSON.parse(String(top));
        if (p && typeof p === 'object' && !Array.isArray(p)) extra = p;
      } catch {
        /* ignore */
      }
    }
    args = { ...extra, ...args };
  }
  return { name: normalizeAgentToolName(name), args };
}

/**
 * @param {string} base
 * @param {string} model
 * @param {object[]} messages
 * @param {object[]} tools
 */
async function ollamaChat(base, model, messages, tools) {
  const url = `${base}/api/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ollamaFetchExtraHeaders(base),
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length ? tools : undefined,
        stream: false,
      }),
    });
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e)?.cause?.code || /** @type {NodeJS.ErrnoException} */ (e)?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      const err = new Error('Cannot reach Ollama');
      err.code = 'OLLAMA_UNAVAILABLE';
      throw err;
    }
    const err = new Error(e instanceof Error ? e.message : 'Ollama request failed');
    err.code = 'OLLAMA_REQUEST_FAILED';
    throw err;
  }

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text.slice(0, 500) || `Ollama HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 404) err.code = 'OLLAMA_NOT_FOUND';
    else err.code = 'OLLAMA_HTTP_ERROR';
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Invalid JSON from Ollama');
    err.code = 'OLLAMA_BAD_RESPONSE';
    throw err;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {Array<{ role: string, content: string }>} opts.messages
 * @param {string} [opts.clientIsoTime]
 * @param {number} [opts.tzOffsetMinutes]
 * @param {{ ai_agent_mutations_enabled?: boolean }} [opts.settingsRow]
 * @param {string} [opts.ollamaBase] - resolved base URL (user setting or server env); falls back to env/localhost if omitted
 */
export async function runAgentChat(opts) {
  const base =
    typeof opts.ollamaBase === 'string' && opts.ollamaBase.trim()
      ? opts.ollamaBase.trim().replace(/\/$/, '')
      : fallbackOllamaBaseUrl();
  const model = ollamaModel();

  const { userId, clientIsoTime, tzOffsetMinutes, settingsRow } = opts;
  const history = sanitizeClientMessages(opts.messages);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const clearMutationIntent = isClearMutationIntent(lastUser?.content || '');
  const mutationsEnabled = settingsRow?.ai_agent_mutations_enabled !== false;

  const pendingConfirmations = [];
  const pendingMutations = [];
  const dirty = { notes: false, tasks: false, templates: false };

  const pack = (payload) => ({
    message: payload.message,
    pendingConfirmations,
    pendingMutations,
    workContext: payload.workContext,
    dirtyNotes: dirty.notes,
    dirtyTasks: dirty.tasks,
    dirtyTemplates: dirty.templates,
  });

  /** @type {object[]} */
  const ollamaMessages = [
    {
      role: 'system',
      content: buildSystemPrompt({ clientIsoTime, tzOffsetMinutes, mutationsEnabled }),
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let workContext = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const data = await ollamaChat(base, model, ollamaMessages, AGENT_TOOL_DEFINITIONS);
    const msg = data?.message;
    if (!msg || typeof msg !== 'object') {
      return pack({ message: 'No response from Ollama.', workContext });
    }

    const rawCalls = msg.tool_calls;
    if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
      return pack({
        message: typeof msg.content === 'string' ? msg.content : '',
        workContext,
      });
    }

    const toolCalls = rawCalls.map((tc, i) => {
      const id =
        typeof tc?.id === 'string' && tc.id.trim()
          ? tc.id
          : `call_${step}_${i}_${Date.now()}`;
      return { ...tc, id, type: tc?.type || 'function' };
    });

    ollamaMessages.push({
      role: 'assistant',
      content: typeof msg.content === 'string' ? msg.content : '',
      tool_calls: toolCalls,
    });

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const { name, args } = extractToolCall(tc);
      const toolCallId = tc.id;

      const { resultText, workContext: wc } = await runAgentTool(name, args, {
        userId,
        mutationsEnabled,
        clearMutationIntent,
        pendingConfirmations,
        pendingMutations,
        tzOffsetMinutes,
        dirty,
        lastUserMessage: lastUser?.content || '',
      });
      workContext = mergeWorkContext(workContext, wc);
      ollamaMessages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: resultText,
      });
    }
  }

  return pack({
    message: 'Stopped after too many tool steps; try a simpler request.',
    workContext,
  });
}
