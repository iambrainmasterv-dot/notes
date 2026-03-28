import {
  AGENT_TOOL_DEFINITIONS,
  runAgentTool,
  isMutatingAgentTool,
  buildPendingMutationEntry,
} from './agentExecutor.js';
import { mergeWorkContext, isClearMutationIntent } from './intentPolicy.js';
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

/**
 * @param {{ mode?: string; previousPending?: unknown[] }} [followUp]
 */
function buildFollowUpSystemAppend(followUp) {
  if (!followUp || typeof followUp !== 'object') return '';
  const mode = String(followUp.mode || '').toLowerCase();
  if (mode === 'deny') {
    return `

## Internal instruction (not shown to the user)
The user **declined** the proposed changes to their notes, tasks, or schedule templates in the Jarvis panel. Reply naturally to their **actual question or chat** — do not assume they wanted data created. Avoid mutating tools unless they now clearly ask to change app data.`;
  }
  if (mode === 'redo') {
    const prev = JSON.stringify(followUp.previousPending || []);
    return `

## Internal instruction (not shown to the user)
The user wants a **different plan** for the same underlying request. Your previous proposed actions (still **not** applied) were: ${prev}. Propose a revised approach using tools where appropriate; ambiguous changes may be held for UI confirmation again.`;
  }
  return '';
}

function buildSystemPrompt({ clientIsoTime, tzOffsetMinutes, mutationsEnabled, followUpAppend = '' }) {
  const timeLine =
    clientIsoTime && typeof clientIsoTime === 'string'
      ? `User-reported local time (ISO): ${clientIsoTime}.`
      : 'Local time not provided by client.';
  const tzLine =
    typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)
      ? `Browser timezone offset minutes (Date.getTimezoneOffset): ${tzOffsetMinutes}.`
      : '';

  return [
    'You are **Jarvis** — the in-app copilot for **NoteTasks** (Pool, Schedule, Notes, Tasks, Completed, Jarvis, Settings). You have a distinct voice: warm, quick-witted when it fits, never stiff. You genuinely enjoy good conversation.',
    '',
    '**Default to chat.** Most messages are ideas, venting, questions, or banter — answer like a strong general-purpose assistant (explain, brainstorm, joke lightly, tutor, translate). **Do not** reach for notes/tasks tools just because the user said something that *could* be a reminder; only use mutating tools when they **clearly** want their **in-app** data changed (or when they accepted a proposal in the UI — the server handles that).',
    '',
    '## NoteTasks data — tools',
    '- Use tools for **reads and writes** of their real in-app data only when relevant. Never invent IDs — call **list_notes** / **list_tasks** (and template list tools) before update/delete/nested create unless you already have the correct id in this turn.',
    '- **Notes**: title + description; optional deadline (ISO or HH:mm for daily). **Tasks**: title + **target** (default 1) + **progress**; same deadlines. **Nesting**: parent_id + parent_type (note|task).',
    '- **daily:true** = same item every calendar day (Schedule “Daily”). **Mon–Fri or chosen weekdays** → **schedule templates** with `schedule_kind: "weekdays"` and `schedule_rules.weekdays` (or `weekday_preset: monday_to_friday`) — **not** `daily:true` on a task.',
    '- **Confirmation**: When the user’s intent to change data is **not** obvious, mutating tool calls are **held** until they tap **Accept** in the Jarvis panel. Your reply should list what you would do. When intent **is** obvious (clear “create/add/delete/update …” with enough detail), changes can apply immediately (if Allow edits is on). Never claim something was created/updated/deleted unless the tool result says so.',
    '- If the user regrets a change: **list_agent_undo** then **undo_agent_action**.',
    '- Do **not** paste raw JSON tool-call payloads as the user-visible reply.',
    '- If mutations are disabled: say so and point to Settings → Jarvis → Allow edits.',
    `Mutations for this user are currently **${mutationsEnabled ? 'ENABLED' : 'DISABLED'}**.`,
    timeLine,
    tzLine,
    'For authoritative rules, call **get_app_capabilities** when unsure.',
    followUpAppend,
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
 * @param {{ mode?: string; previousPending?: unknown[] }} [opts.followUp]
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

  const { userId, clientIsoTime, tzOffsetMinutes, settingsRow, followUp } = opts;
  const history = sanitizeClientMessages(opts.messages);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const mutationsEnabled = settingsRow?.ai_agent_mutations_enabled !== false;
  const clearMutationIntent = isClearMutationIntent(lastUser?.content || '');

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

  const followUpAppend = buildFollowUpSystemAppend(followUp);

  /** @type {object[]} */
  const ollamaMessages = [
    {
      role: 'system',
      content: buildSystemPrompt({
        clientIsoTime,
        tzOffsetMinutes,
        mutationsEnabled,
        followUpAppend,
      }),
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

    const shouldDeferMutations =
      mutationsEnabled &&
      !clearMutationIntent &&
      toolCalls.some((tc) => isMutatingAgentTool(extractToolCall(tc).name));

    ollamaMessages.push({
      role: 'assistant',
      content: typeof msg.content === 'string' ? msg.content : '',
      tool_calls: toolCalls,
    });

    let deferredThisRound = false;

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const { name, args } = extractToolCall(tc);
      const toolCallId = tc.id;

      if (shouldDeferMutations && isMutatingAgentTool(name)) {
        const entry = buildPendingMutationEntry(name, args);
        pendingMutations.push(entry);
        deferredThisRound = true;
        ollamaMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: `[NOT_EXECUTED] Pending user confirmation in the Jarvis panel: ${entry.summary}. In your visible reply, list these planned changes and say they can tap Accept, Deny, or Redo.`,
        });
        continue;
      }

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

    if (deferredThisRound && pendingMutations.length > 0) {
      const assistantText = typeof msg.content === 'string' ? msg.content.trim() : '';
      const planLines = pendingMutations.map((p) => `• ${p.summary}`).join('\n');
      const fallbackMsg =
        assistantText ||
        `Here’s what I’d change in your app — review and tap **Accept** to apply, **Deny** if you were just thinking out loud, or **Redo** for a different plan:\n\n${planLines}`;
      return pack({ message: fallbackMsg, workContext });
    }
  }

  return pack({
    message:
      'I hit the step limit while using app tools. Ask again with a smaller change, or split listing vs editing into separate messages.',
    workContext,
  });
}
