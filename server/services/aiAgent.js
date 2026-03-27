import { AGENT_TOOL_DEFINITIONS, runAgentTool } from './agentExecutor.js';
import { mergeWorkContext } from './intentPolicy.js';
import { ollamaFetchExtraHeaders } from './ollamaTunnelHeaders.js';

const MAX_CLIENT_MESSAGES = 48;
const MAX_MESSAGE_CHARS = 16000;
const MAX_TOOL_STEPS = 20;

/** Must match tool `function.name` values in agentExecutor */
const CANONICAL_TOOLS = [
  'get_app_capabilities',
  'list_agent_undo',
  'undo_agent_action',
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
    'You are **Jarvis** — a capable general-purpose assistant running inside **NoteTasks** (sidebar: Pool, Schedule, Notes, Tasks, Completed, Jarvis, Settings). Behave like a strong modern LLM: you can chat naturally, reason step by step, plan, brainstorm, explain technical topics, help with writing, translate, tutor, and discuss almost any subject. The only special capability you have beyond a normal chat model is **integrated access to this user’s real notes, tasks, and schedule** through tools.',
    '',
    '## Conversation style (match the user)',
    '- **Language**: Reply in the same language the user writes in (including mixed or non‑English). If unclear, use their strongest language from the message or ask once.',
    '- **Depth**: Match their intent — terse when they want speed; long-form outlines, tables, numbered plans, or detailed prose when they ask for depth, “explain like I’m five”, a workout plan, a syllabus, etc.',
    '- **Personas & tone**: If they ask you to sound like someone, adopt a role, or mimic a style, lean into it clearly while staying accurate and safe. You are not a licensed clinician, lawyer, or therapist; give general information and suggest qualified professionals when health, legal, or crisis topics need it.',
    '- **Fitness & workouts**: Build plans around the **fitness level they state** (beginner / intermediate / advanced). Include warm-up, progression, rest, and form reminders where helpful. This is general fitness guidance, not medical diagnosis or treatment.',
    '',
    '## NoteTasks data — tools (non‑negotiable)',
    '- Use tools for **any** read or write of their in-app data. Never invent note/task/template IDs — call **list_notes** and/or **list_tasks** (and schedule template tools as needed) before update/delete/nested create unless you already received the correct id in this turn.',
    '- **Notes**: title + description; optional deadline (full datetime or HH:mm for daily). **Tasks**: title + **target** (number, default 1) + **progress**; same deadline rules. **Nesting**: parent_id + parent_type (note|task) matching the parent item.',
    '- **daily:true** = same item every calendar day (Schedule “Daily”). **Mon–Fri or chosen weekdays only** → use **schedule templates** (e.g. create_schedule_template, weekday_preset monday_to_friday), **not** a single daily=true item (that repeats every day including weekends).',
    '- To create in the app you **must** call **create_note** or **create_task** (with a title). Never claim something was created unless the tool result includes an id or clear success.',
    '- **No in-app confirmation step** — creates, updates, and deletes apply immediately when mutations are enabled. If the user regrets a change, call **list_agent_undo** then **undo_agent_action** (optional **count** 1–5). Deletes and other mutations are recorded so you can restore them.',
    '- If a tool says unknown tool or mutations disabled — report that honestly; do not claim success.',
    '- Do **not** paste raw JSON tool-call payloads as the user-visible reply. There is no get_note/get_task single-fetch tool; use list_* tools.',
    '- If mutations are disabled: tell them they can enable **Allow edits** under Settings → Jarvis.',
    `Mutations for this user are currently **${mutationsEnabled ? 'ENABLED' : 'DISABLED'}**.`,
    timeLine,
    tzLine,
    'For authoritative UI/tab/deadline/template rules, call **get_app_capabilities** when unsure.',
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
 * @param {string} opts.ollamaBase - Ollama origin from OLLAMA_BASE_URL (server resolves before calling)
 */
export async function runAgentChat(opts) {
  const base =
    typeof opts.ollamaBase === 'string' && opts.ollamaBase.trim()
      ? opts.ollamaBase.trim().replace(/\/$/, '')
      : '';
  if (!base) {
    const err = new Error('No Ollama base URL');
    err.code = 'OLLAMA_UNAVAILABLE';
    throw err;
  }
  const model = ollamaModel();

  const { userId, clientIsoTime, tzOffsetMinutes, settingsRow } = opts;
  const history = sanitizeClientMessages(opts.messages);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
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
    message:
      'I hit the step limit while using app tools. Ask again with a smaller change, or split listing vs editing into separate messages.',
    workContext,
  });
}
