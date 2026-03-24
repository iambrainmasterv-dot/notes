import { useState, useEffect, useCallback, useMemo } from 'react';
import { tutorialCompletedStorageKey } from '../utils';
import type { Page } from '../types';

export interface TutorialStep {
  page: Page | 'settings';
  title: string;
  body: string;
}

const STEPS: TutorialStep[] = [
  {
    page: 'pool',
    title: 'Pool',
    body: 'The Pool shows all active notes and tasks together. Switch list, table, or canvas views. Use Add Note or Add Task to jump to creation.',
  },
  {
    page: 'schedule',
    title: 'Schedule',
    body: 'Schedule is for daily items and templates. Templates materialize on matching weekdays or yearly dates. Create daily notes and tasks here.',
  },
  {
    page: 'notes',
    title: 'Notes',
    body: 'Notes supports trees: subnotes and subtasks under any item. Use Edit to change parent. Collapse sections to focus.',
  },
  {
    page: 'tasks',
    title: 'Tasks',
    body: 'Tasks track progress toward a target. They can live under notes or other tasks as subtasks.',
  },
  {
    page: 'completed',
    title: 'Completed',
    body: 'Finished items land here. Recover or delete them in bulk. Clear the list periodically — we will remind you if it stays full for days.',
  },
  {
    page: 'settings',
    title: 'Settings',
    body: 'Theme, density, font size, daily reset time, local import, app version, and re-run this tutorial anytime.',
  },
];

const TAB_ORDER: Page[] = ['pool', 'schedule', 'notes', 'tasks', 'completed'];

export function useTutorial(
  userId: string,
  setPage: (p: Page) => void,
  setSettingsOpen: (v: boolean | ((b: boolean) => boolean)) => void,
) {
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!userId || typeof localStorage === 'undefined') {
      setActive(false);
      return;
    }
    const done = localStorage.getItem(tutorialCompletedStorageKey(userId)) === '1';
    setActive(!done);
    if (!done) setStepIndex(0);
  }, [userId]);

  const step = STEPS[stepIndex] ?? STEPS[0];

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
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const skipToNextTab = useCallback(() => {
    setStepIndex((i) => {
      const curStep = STEPS[i];
      if (curStep.page === 'settings') return i;
      const curPage = curStep.page as Page;
      const tabIdx = TAB_ORDER.indexOf(curPage);
      if (tabIdx < 0 || tabIdx >= TAB_ORDER.length - 1) {
        const j = STEPS.findIndex((s) => s.page === 'settings');
        return j >= 0 ? j : i;
      }
      const nextPage = TAB_ORDER[tabIdx + 1];
      const j = STEPS.findIndex((s) => s.page === nextPage);
      return j >= 0 ? j : Math.min(i + 1, STEPS.length - 1);
    });
  }, []);

  const finish = useCallback(() => {
    if (userId && typeof localStorage !== 'undefined') {
      localStorage.setItem(tutorialCompletedStorageKey(userId), '1');
    }
    setActive(false);
    setSettingsOpen(false);
  }, [userId, setSettingsOpen]);

  const rerun = useCallback(() => {
    if (userId && typeof localStorage !== 'undefined') {
      localStorage.removeItem(tutorialCompletedStorageKey(userId));
    }
    setStepIndex(0);
    setActive(true);
  }, [userId]);

  const isLast = stepIndex >= STEPS.length - 1;

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
    }),
    [active, step, stepIndex, next, skipToNextTab, finish, rerun, isLast],
  );
}
