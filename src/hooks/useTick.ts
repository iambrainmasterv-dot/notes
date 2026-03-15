import { useState, useEffect, useRef } from 'react';

/**
 * Adaptive tick hook: ticks every second when any deadline is
 * within 10 minutes, every 10s when within 1 hour, every 30s otherwise.
 * Only re-renders when the interval bucket changes.
 */
export function useTick(nearestDeadline?: string): number {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const computeInterval = () => {
      if (!nearestDeadline) return 30_000;
      const diff = new Date(nearestDeadline).getTime() - Date.now();
      if (diff <= 0) return 1_000;
      if (diff < 600_000) return 1_000;   // < 10 min: every second
      if (diff < 3_600_000) return 10_000; // < 1 hour: every 10s
      return 30_000;                        // else: every 30s
    };

    const start = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const ms = computeInterval();
      intervalRef.current = setInterval(() => {
        setNow(Date.now());
      }, ms);
    };

    start();
    // Re-evaluate interval every 30s in case the nearest deadline bracket changed
    const reevaluator = setInterval(start, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(reevaluator);
    };
  }, [nearestDeadline]);

  return now;
}
