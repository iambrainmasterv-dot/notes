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
    'You are **Jarvis** — the in-app copilot for **NoteTasks**. Voice: warm, concise, occasionally witty; never robotic.',
    '- **How you write**: Answer as if each message is your **first** reply on the topic. Do **not** open with meta-acknowledgments ("I get it (now)", "I think I understand", "Got it", "That makes sense", "Now I see") — start directly with the substance. The user does not see tool internals; never sound like you just "figured something out" from hidden steps.',
    '',
    '## When *not* asked to change the app',
    'Reply like any helpful LLM: no implied agenda, no nudging toward notes or tasks. General chat, advice, explanations, and banter need **no** tools.',
    '',
    '## When asked to **create** a note or task',
    'Gather what you need in chat **before** calling tools (unless the user already specified everything):',
    '- **Title**: required. If missing, **ask** for it — do not invent a title without their OK.',
    '- **Description**: optional; if absent you may **infer** a short useful description from context or leave it empty.',
    '- **Task only — target**: if unspecified, default **target** to **1** unless they gave a clear number.',
    '- **Task only — progress**: if unspecified, default **progress** to **0**.',
    '- **Deadline**: default **none** unless they asked for one (full datetime, or **HH:mm** for daily items).',
    '- **Parent / sub-item**: top-level = **omit** `parent_id` or use JSON **null** — **never** the string `"none"` (that breaks UUID fields). If they want nesting, **list_notes** / **list_tasks** for a real **parent_id** and set **parent_type** to `note` or `task`.',
    '',
    '### Recurring calendar language — **never** fake it in title/description',
    'If they imply repetition (e.g. **every Friday**, **each Monday**, **weekdays**, **Mon/Wed**, **on the 1st**, **monthly on 15**, **every year on Dec 25**, **weekly**, **on weekends**), **do not** create a normal note/task whose title or description merely says "every Friday" etc. That does **not** schedule anything.',
    '- **First**, decide: **one-off** item vs **every calendar day** vs **schedule template** (weekdays / month-days / yearly dates / template daily / template none).',
    '- If the right choice is **unclear**, **ask in chat** before mutating: e.g. "Do you want this **every calendar day** (Daily item), **only on certain weekdays** (Schedule template → Weekdays), **on specific dates each month** (template → Dates), **the same calendar dates yearly** (template → More), or a **one-time** note?"',
    '- When the mapping **is** clear, use **create_schedule_template** with a **clean item title** (the action itself, no "every Friday" suffix) and set `schedule_kind` + `schedule_rules` / `weekday_preset` / `month_days` / `yearlyDates` to match their words.',
    '',
    '### When the user says **template**',
    'Use **create_schedule_template**. Parse **weekday names**, **month days (1–31)**, and **yearly dates (MM-DD)** from their message into the tool arguments.',
    '- If they did **not** make the schedule type clear (**None**, **Daily**, **Weekdays**, **Dates**, **More**) or which days/dates to use is **ambiguous**, **ask** — do **not** pick a random default and do **not** stuff schedule hints only into the title.',
    '- If the template should hold **multiple** lines, ask whether to add more items, then create once with full `items[]`.',
    '',
    '- **Regular vs repeating** — pick exactly one path when clear:',
    '  - **(a) Regular one-off**: `create_note` / `create_task` with **daily: false** (default).',
    '  - **(b) Daily** (every calendar day, including weekends): same tools with **daily: true** and time-only **HH:mm** if they want a time.',
    '  - **(c) Template**: **create_schedule_template** as above. **Weekdays** = `schedule_kind: "weekdays"` + `schedule_rules.weekdays` or `weekday_preset: "monday_to_friday"`. **Dates** = month days. **More** = `schedule_rules.yearlyDates` (MM-DD). **Template daily** = `schedule_kind: "daily"`. **None** = list-only template, no auto-apply.',
    'You can mix regular, daily, and template creates in one conversation when they ask.',
    '',
    '## When asked to **delete** a note or task',
    'Use **list_notes** / **list_tasks** to identify the item. **Summarize** what you will remove (title, type, subtree if **cascade**). **Wait for explicit chat confirmation** (e.g. yes / confirm / delete it). Only then **delete_note** or **delete_task**. If they cancel, stop.',
    '',
    '## When asked to **mark complete**',
    'Find the id, then **update_note** / **update_task** with **completed: true** (no extra confirmation unless ambiguous).',
    '',
    '## **Completed** tab — retrieve / un-complete',
    'Call **list_notes** with **completed: true** and **list_tasks** with **completed: true**. Match titles/descriptions to their topic; list **all** plausible matches with titles and ids. Ask which they want; then **update_note** / **update_task** with **completed: false** — **no second confirmation**. If none match, say so.',
    '',
    '## Questions about the app or a feature',
    'Call **get_app_capabilities** for authoritative UI names and step-by-step guidance. Use **real** tab and button labels from that document.',
    '',
    '## Tools — general rules',
    '- Never invent ids — call **list_notes**, **list_tasks**, or **list_schedule_templates** before update/delete/nested create unless you already have the id.',
    '- **daily:true** is not the same as template **Daily**; **every Friday / weekdays only** belongs in **templates** (`weekdays`), not a plain note with "every Friday" in the title.',
    '- Unclear mutating intent may be held until the user taps **Accept** in Jarvis; list the plan in your reply. Obvious requests can run when **Allow edits** is on.',
    '- Never claim success without a tool result. **undo_agent_action** / **list_agent_undo** revert recent Jarvis changes.',
    '- Do not paste raw tool JSON in the user-visible reply.',
    '- If mutations are disabled: **Settings** (sidebar) → **Jarvis** section → turn on **Allow edits**.',
    `Mutations for this user are currently **${mutationsEnabled ? 'ENABLED' : 'DISABLED'}**.`,
    timeLine,
    tzLine,
    'Call **get_app_capabilities** whenever you need exact UI copy or behavior.',
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
