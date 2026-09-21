import { useEffect, useRef, useState } from "preact/hooks";
import { todayIso } from "../domain/dates";

/**
 * The current calendar date, refreshed when the day turns over.
 *
 * Deriving it during render is not enough: a phone left on the list overnight
 * has no reason to render again, so it would still show yesterday's Heute and
 * yesterday's recap in the morning.
 */
export function useToday(now: () => Date): string {
  const nowRef = useRef(now);
  nowRef.current = now;
  const [today, setToday] = useState(() => todayIso(nowRef.current()));

  useEffect(() => {
    const current = nowRef.current();
    const midnight = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
      0,
      0,
      1,
    );
    const timer = window.setTimeout(
      () => setToday(todayIso(nowRef.current())),
      Math.max(1000, midnight.getTime() - current.getTime()),
    );
    return () => window.clearTimeout(timer);
  }, [today]);

  return today;
}
