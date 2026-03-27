import { useState, useEffect, useCallback, useMemo } from 'react';
import { greetingSuppressUntilNextSessionAfterTutorialKey, tutorialCompletedStorageKey } from '../utils';
import type { Page } from '../types';

export type TutorialGate = 'none' | 'requireNewNote' | 'requireNewTask';

export interface TutorialStep {
  page: Page | 'settings';
  /** Steps with the same key are one "tab"; Skip jumps to the first step of the next key. */
  skipTabKey: string;
  title: string;
  body: string;
  gate?: TutorialGate;
  /** Backdrop does not block clicks except on the card (so user can use the app). */
  interactive?: boolean;
  /** `data-tutorial-target` values to cut out of the dim layer and pulse-outline. */
  highlightTargets?: string[];
}

const STEPS: TutorialStep[] = [
  {
    skipTabKey: 'pool',
    page: 'pool',
    title: 'Pool',
    body: 'The Pool shows all active notes and tasks together. Switch list, table, or canvas views.',
  },
  {
    skipTabKey: 'pool',
    page: 'pool',
    title: 'Pool — quick create',
    body: 'Use Add Note or Add Task here to jump to the right tab with the creation form open.',
    interactive: true,
    highlightTargets: ['pool-add-note', 'pool-add-task'],
  },
  {
    skipTabKey: 'schedule',
    page: 'schedule',
    title: 'Schedule',
    body: 'Daily items and templates live here. Templates add notes or tasks on matching weekdays or yearly dates.',
  },
  {
    skipTabKey: 'schedule',
    page: 'schedule',
    title: 'Schedule — daily forms',
    body: 'Try New Daily Note or New Daily Task to see the forms. You do not need to save — explore, then tap Next when ready.',
    interactive: true,
    highlightTargets: ['schedule-daily-note', 'schedule-daily-task'],
  },
  {
    skipTabKey: 'notes',
    page: 'notes',
    title: 'Notes',
    body: 'Notes can nest: subnotes and subtasks under any item. Edit changes parent; collapse keeps trees tidy.',
  },
  {
    skipTabKey: 'notes',
    page: 'notes',
    title: 'Create your first note',
    body: 'Tap New Note, fill the form, and create one note. Tap Next after it appears in the list. The form stays bright while this step is open.',
    gate: 'requireNewNote',
    interactive: true,
    highlightTargets: ['notes-new-note', 'notes-create-modal'],
  },
  {
    skipTabKey: 'tasks',
    page: 'tasks',
    title: 'Tasks',
    body: 'Tasks track progress to a target. They can sit under notes or other tasks.',
  },
  {
    skipTabKey: 'tasks',
    page: 'tasks',
    title: 'Create your first task',
    body: 'Tap New Task, set a title and target, and create one task. Tap Next after it appears.',
    gate: 'requireNewTask',
    interactive: true,
    highlightTargets: ['tasks-new-task', 'tasks-create-modal'],
  },
  {
    skipTabKey: 'completed',
    page: 'completed',
    title: 'Completed',
    body: 'Finished items land here. Recover or delete in bulk. Clear the list periodically — we will remind you if it stays full for days.',
  },
  {
    skipTabKey: 'jarvis',
    page: 'completed',
    title: 'Jarvis (optional)',
    body: 'Jarvis is the in-app assistant. It needs Ollama running on the same machine as your NoteTasks API (typical for local use). Install Ollama, then run ollama pull with a model name (e.g. llama3.2). Open the Jarvis tab in the sidebar (highlighted) when you are ready — you can finish this tutorial first.',
    interactive: true,
    highlightTargets: ['nav-jarvis'],
  },
  {
    skipTabKey: 'settings',
    page: 'settings',
    title: 'Settings',
    body: 'Theme, density, font size, daily reset time, local import, app version, Jarvis (Allow edits, undo via chat), and re-run this tutorial anytime.',
    interactive: true,
    highlightTargets: ['nav-settings'],
  },
];

function firstStepIndexAfterTabKey(fromIndex: number, tabKey: string): number {
  let j = fromIndex + 1;
  while (j < STEPS.length && STEPS[j].skipTabKey === tabKey) j += 1;
  return Math.min(j, STEPS.length - 1);
}

const NOTE_GATE_INDEX = STEPS.findIndex((s) => s.gate === 'requireNewNote');
const TASK_GATE_INDEX = STEPS.findIndex((s) => s.gate === 'requireNewTask');

export function useTutorial(
  userId: string,
  setPage: (p: Page) => void,
  setSettingsOpen: (v: boolean | ((b: boolean) => boolean)) => void,
  notesCount: number,
  tasksCount: number,
) {
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  /** Snapshot of notes count when user entered the “create note” step (must create one more). */
  const [noteCountAtGate, setNoteCountAtGate] = useState<number | null>(null);
  /** Snapshot of tasks count when user entered the “create task” step. */
  const [taskCountAtGate, setTaskCountAtGate] = useState<number | null>(null);

  useEffect(() => {
    if (!userId || typeof localStorage === 'undefined') {
      setActive(false);
      return;
    }
    const done = localStorage.getItem(tutorialCompletedStorageKey(userId)) === '1';
    setActive(!done);
    if (!done) setStepIndex(0);
  }, [userId]);

  useEffect(() => {
    if (!active) {
      setNoteCountAtGate(null);
      setTaskCountAtGate(null);
      return;
    }
    if (stepIndex === NOTE_GATE_INDEX) {
      setNoteCountAtGate((prev) => (prev === null ? notesCount : prev));
    } else {
      setNoteCountAtGate(null);
    }
    if (stepIndex === TASK_GATE_INDEX) {
      setTaskCountAtGate((prev) => (prev === null ? tasksCount : prev));
    } else {
      setTaskCountAtGate(null);
    }
  }, [active, stepIndex, notesCount, tasksCount]);

  const step = STEPS[stepIndex] ?? STEPS[0];

  const canGoNext = useMemo(() => {
    const g = step.gate ?? 'none';
    if (g === 'requireNewNote') {
      if (noteCountAtGate === null) return false;
      return notesCount > noteCountAtGate;
    }
    if (g === 'requireNewTask') {
      if (taskCountAtGate === null) return false;
      return tasksCount > taskCountAtGate;
    }
    return true;
  }, [step.gate, notesCount, tasksCount, noteCountAtGate, taskCountAtGate]);

  const showSkipToNextTab = useMemo(() => {
    if (step.gate === 'requireNewNote' || step.gate === 'requireNewTask') return false;
    const key = step.skipTabKey;
    return firstStepIndexAfterTabKey(stepIndex, key) !== stepIndex;
  }, [step.gate, step.skipTabKey, stepIndex]);

  useEffect(() => {
    if (!active) return;
    if (step.page === 'settings') {
      setSettingsOpen(true);
    } else {
      setSettingsOpen(false);
      setPage(step.page as Page);
    }
  }, [active, step.page, stepIndex, setPage, setSettingsOpen]);

  const next = useCallback(() => {
    if (!canGoNext) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [canGoNext]);

  const skipToNextTab = useCallback(() => {
    setStepIndex((i) => {
      const key = STEPS[i].skipTabKey;
      return firstStepIndexAfterTabKey(i, key);
    });
  }, []);

  const finish = useCallback(() => {
    if (userId && typeof localStorage !== 'undefined') {
      localStorage.setItem(tutorialCompletedStorageKey(userId), '1');
    }
    if (userId && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(greetingSuppressUntilNextSessionAfterTutorialKey(userId), '1');
    }
    setActive(false);
    setSettingsOpen(false);
  }, [userId, setSettingsOpen]);

  const rerun = useCallback(() => {
    if (userId && typeof localStorage !== 'undefined') {
      localStorage.removeItem(tutorialCompletedStorageKey(userId));
    }
    setNoteCountAtGate(null);
    setTaskCountAtGate(null);
    setStepIndex(0);
    setActive(true);
  }, [userId]);

  const isLast = stepIndex >= STEPS.length - 1;

  const gateHint = useMemo(() => {
    if (canGoNext) return undefined;
    if (step.gate === 'requireNewNote') return 'Create at least one new note on this page, then tap Next.';
    if (step.gate === 'requireNewTask') return 'Create at least one new task on this page, then tap Next.';
    return undefined;
  }, [canGoNext, step.gate]);

  return useMemo(
    () => ({
      active,
      step,
      stepIndex,
      total: STEPS.length,
      next,
      skipToNextTab,
      finish,
      rerun,
      isLast,
      canGoNext,
      showSkipToNextTab,
      interactive: Boolean(step.interactive),
      gateHint,
    }),
    [
      active,
      step,
      stepIndex,
      next,
      skipToNextTab,
      finish,
      rerun,
      isLast,
      canGoNext,
      showSkipToNextTab,
      gateHint,
    ],
  );
}
