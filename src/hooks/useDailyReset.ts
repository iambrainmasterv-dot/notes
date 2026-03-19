import { useEffect, useCallback, useRef } from 'react';
import type { Note, Task } from '../types';
import { todayDateStr } from '../utils';

interface Params {
  dailyResetTime: string;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  lastResetTag: string | null;
  saveResetTag: (tag: string) => void;
}

function shouldReset(resetTime: string, lastResetTag: string | null): boolean {
  const today = todayDateStr();
  const tag = `${today}|${resetTime || '00:00'}`;
  if (lastResetTag === tag) return false;

  const now = new Date();
  const [h, m] = (resetTime || '00:00').split(':').map(Number);
  const resetMoment = new Date();
  resetMoment.setHours(h, m, 0, 0);

  return now >= resetMoment;
}

export function useDailyReset({ dailyResetTime, setNotes, setTasks, lastResetTag, saveResetTag }: Params) {
  const resetTimeRef = useRef(dailyResetTime);
  resetTimeRef.current = dailyResetTime;
  const lastTagRef = useRef(lastResetTag);
  lastTagRef.current = lastResetTag;

  const performReset = useCallback(() => {
    const rt = resetTimeRef.current;
    if (!shouldReset(rt, lastTagRef.current)) return;

    setNotes((prev) =>
      prev.map((n) => (n.daily ? { ...n, completed: false } : n)),
    );
    setTasks((prev) =>
      prev.map((t) => (t.daily ? { ...t, completed: false, progress: 0 } : t)),
    );

    const tag = `${todayDateStr()}|${rt || '00:00'}`;
    saveResetTag(tag);
  }, [setNotes, setTasks, saveResetTag]);

  useEffect(() => {
    performReset();
    const id = setInterval(performReset, 30_000);
    return () => clearInterval(id);
  }, [performReset]);
}
