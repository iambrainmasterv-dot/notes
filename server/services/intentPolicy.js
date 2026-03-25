/**
 * Heuristic: user clearly asked to mutate data (not just brainstorming).
 */
const MUTATION_VERBS =
  /\b(add|create|make|new|insert|put|write|save|draft|record|log|delete|remove|trash|update|change|rename|edit|set|mark\s+complete|complete|finish|done)\b/i;

const SOFT =
  /\b(should i|could i|would it|what if|maybe|perhaps|recommend|suggest|ideas?|thoughts?|help me decide|do you think)\b/i;

/** Short follow-ups after the assistant proposed a concrete change */
const SHORT_AFFIRM =
  /^\s*(yes|yep|yeah|yup|ok|okay|sure|do it|go ahead|please do|please|confirm|apply|proceed|sounds good|that's fine|thats fine)\s*[!.]?\s*$/i;

export function isClearMutationIntent(userText) {
  if (!userText || typeof userText !== 'string') return false;
  const t = userText.trim();
  if (t.length < 2) return false;

  if (t.length <= 56 && SHORT_AFFIRM.test(t)) {
    return true;
  }

  const soft = SOFT.test(t);
  if (soft && MUTATION_VERBS.test(t)) {
    return true;
  }
  if (soft) {
    return false;
  }

  return MUTATION_VERBS.test(t);
}

export function toolWorkContext(toolName, args) {
  if (toolName.includes('schedule_template')) return 'schedule';
  const daily = Boolean(args?.daily);
  if (
    daily &&
    (toolName === 'create_note' ||
      toolName === 'create_task' ||
      toolName === 'update_note' ||
      toolName === 'update_task')
  ) {
    return 'schedule';
  }
  if (toolName.includes('note')) return 'notes';
  if (toolName.includes('task')) return 'tasks';
  return null;
}

export function mergeWorkContext(a, b) {
  if (a === 'schedule' || b === 'schedule') return 'schedule';
  if (a === 'notes' || b === 'notes') return 'notes';
  if (a === 'tasks' || b === 'tasks') return 'tasks';
  return a || b || null;
}

/** User asked for Mon–Fri only (not seven-day daily). Used to route create_task → schedule templates. */
export function userWantsMondayThroughFridaySchedule(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  if (/monday\s*(through|thru|to|-|–)\s*friday/.test(t)) return true;
  if (/from\s+monday\s+(to|through|until)\s+friday/.test(t)) return true;
  if (/\bmonday\s+to\s+friday\b/.test(t)) return true;
  if (/\bmon\s*[-–]\s*fri\b/.test(t)) return true;
  return false;
}
