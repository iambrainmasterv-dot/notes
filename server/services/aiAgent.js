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

const CHAT_MODE_SYSTEM = `You are **Jarvis** for **NoteTasks** in **Chat** mode. You have **no tools** and cannot read or change the user's notes, tasks, schedule, or settings. Never imply you saw their data. If they want anything changed, tell them to switch Jarvis to **Edit** mode.

You explain **how NoteTasks works**: tabs (Pool, Schedule, Notes, Tasks, Jarvis, Completed), daily items vs schedule templates, nesting, deadlines, settings, Chat vs Edit. Be brief. Off-topic = one short sentence, then steer back. Never open with "Got it", "Understood", "I see", or "Now I get it" — start with substance.

## Examples

User: How do I make something repeat every week?
Reply: Switch Jarvis to Edit, then say e.g. "every Tuesday at 7am go for a run" — I'll create a Schedule template (Weekdays). You can also build one manually on the Schedule tab → New template.

User: Delete my pizza note.
Reply: I can't change anything in Chat mode. Flip Jarvis to Edit (toggle at the top of this panel) and ask again.

User: What's the difference between a daily item and a schedule template?
Reply: Daily items repeat **every calendar day** (incl. weekends). Schedule templates repeat on **specific weekdays**, **month-days**, or **yearly dates** — and they can hold multiple notes/tasks at once.

User: best laptop for programming?
Reply: Out of scope for me — I'm here for NoteTasks. Want to jot the question as a note when you switch to Edit?`;

/**
 * Ollama /api/chat without tools (general LLM turn).
 * @param {string} base
 * @param {string} model
 * @param {{ role: string; content: string }[]} messages
 */
async function simpleOllamaChat(base, model, messages) {
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
 * Leading phrases models often emit after tool rounds. Only match when clearly a sentence break
 * (punctuation / em dash / newline), so we do not strip "I get it now that …".
 */
const ASSISTANT_ACK_BREAK = String.raw`(?:[.!?…]+\s*|—\s+|\n+)`;
const ASSISTANT_ACK_PREFIX_RES = [
  new RegExp(`^I think I (finally )?get it now\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^I think I get it\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^I get it now\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^I get it\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Got it now\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Got it\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Understood\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^I understand( that)? now\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^I understand\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Now I understand\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Now I see\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^That makes sense\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Makes sense\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Ah,?\\s*I see\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Alright,?\\s*I see\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Right,?\\s*I see\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Perfect\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
  new RegExp(`^Sounds good\\s*${ASSISTANT_ACK_BREAK}`, 'i'),
];

/**
 * Remove meta-acknowledgment openers so replies read like a first response, not a follow-up to hidden tool context.
 * @param {string} raw
 * @returns {string}
 */
function polishAssistantMessageForUser(raw) {
  if (typeof raw !== 'string') return '';
  const original = raw.trim();
  if (!original) return '';
  let s = original;
  for (let i = 0; i < 14; i++) {
    let changed = false;
    for (const re of ASSISTANT_ACK_PREFIX_RES) {
      const next = s.replace(re, '').replace(/^\s*\n+/, '').trimStart();
      if (next !== s) {
        s = next;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return s.length ? s : original;
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
    'You are **Jarvis** — an in-app copilot for **NoteTasks** only. Voice: warm, concise, occasionally witty.',
    'Treat each reply as your **first** reply on the topic. Do **not** open with "Got it", "Understood", "I see", "Now I get it", "That makes sense" — start with substance.',
    '',
    '## Scope',
    'You only help with NoteTasks: notes, tasks, schedule templates, the app UI. For anything unrelated, answer in **one short sentence** then steer back. For UI/feature questions, call **get_app_capabilities** and use real tab/button names — do not invent flows.',
    '',
    '## Hard rules',
    '- **Never invent ids.** Call **list_notes** / **list_tasks** / **list_schedule_templates** before any update/delete/nested-create unless you already have the id.',
    '- **Top-level items**: omit `parent_id` (or pass JSON `null`). Never the string `"none"` — that breaks UUID columns.',
    '- **Recurring language** ("every Friday", "weekdays", "Mon/Wed", "monthly on the 15th", "yearly Dec 25") = **create_schedule_template**. Never put "every Friday" in a regular note/task title or description as a substitute for a schedule.',
    '- **`daily: true`** = every calendar day (incl. Sat/Sun). For weekdays-only or specific days → schedule template.',
    '- **Deadlines**: full ISO datetime for one-offs; **`HH:mm` only** for daily items / template items.',
    '- **Defaults when omitted**: task `target=1`, `progress=0`, deadline=none, parent=none, description=empty. Use them; do not ask.',
    '- **One clarifying question only**, and only when intent is genuinely ambiguous. Otherwise act.',
    '- **Deletes**: list → state plan → wait for "yes / confirm / delete it" → run.',
    '- **Complete / un-complete**: identify item, run immediately. No extra confirmation.',
    '- Never claim success without a tool result. Never paste raw tool JSON in the visible reply.',
    '',
    '## Mode',
    `Edit mode = tools enabled. Mutations for this user are currently **${mutationsEnabled ? 'ENABLED' : 'DISABLED'}**. Unclear mutating requests may be held until the user taps **Accept / Deny / Redo** in the panel — when that happens, your reply is just a short plan summary with bullets.`,
    '',
    '## Examples (model the brevity and decisiveness)',
    '*The "Plan:" lines below are illustrative tool plans, not text to quote in your reply.*',
    '',
    'User: Add a note: call mom',
    'Plan: create_note { title: "Call mom" }',
    'Reply: Saved "Call mom" as a note.',
    '',
    'User: Make a daily push-ups task, target 50',
    'Plan: create_task { title: "Push-ups", target: 50, daily: true }',
    'Reply: Added daily task "Push-ups" with target 50.',
    '',
    'User: I run every Tuesday and Thursday at 7am',
    'Plan: create_schedule_template {',
    '  name: "Morning run", schedule_kind: "weekdays",',
    '  schedule_rules: { weekdays: ["tue","thu"] },',
    '  items: [{ type: "task", title: "Run", deadline_time: "07:00" }]',
    '}',
    'Reply: Scheduled "Run" every Tue and Thu at 07:00.',
    '',
    'User: weekly trash reminder',
    'Reply: Same weekday each week (e.g. Sunday) or every calendar day?',
    '',
    'User: delete the grocery note',
    'Plan: list_notes (filter "grocery")',
    'Reply: Found "Grocery list" (note). Reply "yes" and I\'ll remove it (and any nested items).',
    '',
    'User: yes',
    'Plan: delete_note { id: "<grocery uuid>" }',
    'Reply: Deleted "Grocery list".',
    '',
    'User: mark laundry done',
    'Plan: list_tasks (filter "laundry") → update_task { id, completed: true }',
    'Reply: Marked "Laundry" complete.',
    '',
    'User: build me a 4-day push/pull workout',
    'Reply: Want this as **one note** with the full plan in the description, **separate tasks** per session you can check off, or a **weekday template** that adds the day\'s session automatically?',
    '',
    'User: workout — push: bench 4x8, ohp 3x10, dips 3x12',
    'Plan: create_task {',
    '  title: "Workout — Push",',
    '  description: "Bench 4x8\\nOHP 3x10\\nDips 3x12",',
    '  target: 3, progress: 0',
    '}',
    'Reply: Saved "Workout — Push" as a task with the three blocks in the description.',
    '',
    'User: what\'s the Pool tab for?',
    'Plan: get_app_capabilities',
    'Reply: Pool is the canvas-style inbox — drag, drop, and group notes/tasks before sorting them to other tabs.',
    '',
    'User: capital of France?',
    'Reply: Paris — but I\'m built for NoteTasks. Want me to jot that as a note?',
    '',
    'User: undo your last change',
    'Plan: list_agent_undo → undo_agent_action { id }',
    'Reply: Undid the last change.',
    '',
    timeLine,
    tzLine,
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
 * @param {'chat' | 'edit'} [opts.jarvisMode] — **edit** = tools + app access; **chat** = plain LLM only.
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

  const jarvisMode = String(opts.jarvisMode || 'edit').toLowerCase() === 'chat' ? 'chat' : 'edit';
  const { userId, clientIsoTime, tzOffsetMinutes, followUp } = opts;
  const history = sanitizeClientMessages(opts.messages);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const mutationsEnabled = jarvisMode === 'edit';
  const clearMutationIntent = isClearMutationIntent(lastUser?.content || '');

  if (jarvisMode === 'chat') {
    const ollamaMessages = [{ role: 'system', content: CHAT_MODE_SYSTEM }, ...history.map((m) => ({ role: m.role, content: m.content }))];
    const data = await simpleOllamaChat(base, model, ollamaMessages);
    const msg = data?.message;
    const raw = msg && typeof msg === 'object' && typeof msg.content === 'string' ? msg.content.trim() : '';
    const message = polishAssistantMessageForUser(raw) || raw || '…';
    return {
      message,
      pendingConfirmations: [],
      pendingMutations: [],
      workContext: null,
      dirtyNotes: false,
      dirtyTasks: false,
      dirtyTemplates: false,
    };
  }

  const pendingConfirmations = [];
  const pendingMutations = [];
  const dirty = { notes: false, tasks: false, templates: false };

  const pack = (payload) => ({
    message: polishAssistantMessageForUser(
      typeof payload.message === 'string' ? payload.message : String(payload.message ?? ''),
    ),
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
          content: `[NOT_EXECUTED] Pending user confirmation in the Jarvis panel: ${entry.summary}. In your visible reply, go straight to the plan (no "I get it" / "I understand" preface). List what would change and that they can tap Accept, Deny, or Redo.`,
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
