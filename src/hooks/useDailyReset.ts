import { useEffect, useCallback, useRef } from 'react';
import type { Note, Task } from '../types';
import { storage } from '../storage';
import { todayDateStr } from '../utils';

interface Params {
  dailyResetTime: string;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

/**
 * Determines whether a daily reset should fire right now.
 *
 * We store `"YYYY-MM-DD|HH:mm"` so we can tell whether today's reset
 * already ran *for the currently configured time*.  If the user changes
 * the reset time, a new reset will fire once that new time is reached.
 */
function shouldReset(resetTime: string): boolean {
  const today = todayDateStr();
  const tag = `${today}|${resetTime || '00:00'}`;
  const lastReset = storage.getLastResetDate();
  if (lastReset === tag) return false;

  const now = new Date();
  const [h, m] = (resetTime || '00:00').split(':').map(Number);
  const resetMoment = new Date();
  resetMoment.setHours(h, m, 0, 0);

  return now >= resetMoment;
}

export function useDailyReset({ dailyResetTime, setNotes, setTasks }: Params) {
  const resetTimeRef = useRef(dailyResetTime);
  resetTimeRef.current = dailyResetTime;

  const performReset = useCallback(() => {
    const rt = resetTimeRef.current;
    if (!shouldReset(rt)) return;

    setNotes((prev) =>
      prev.map((n) => (n.daily ? { ...n, completed: false } : n)),
    );
    setTasks((prev) =>
      prev.map((t) => (t.daily ? { ...t, completed: false, progress: 0 } : t)),
    );

    storage.saveLastResetDate(`${todayDateStr()}|${rt || '00:00'}`);
  }, [setNotes, setTasks]);

  useEffect(() => {
    performReset();
    const id = setInterval(performReset, 30_000);
    return () => clearInterval(id);
  }, [performReset]);
}
