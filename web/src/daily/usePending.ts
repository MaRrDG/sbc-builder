// Whether today's Daily is still open for this player: drives the green dot on the Daily nav links.
// Kept tiny (api + store only) so the dashboard and landing don't pull the lazy Daily chunk.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { loadGame } from './store';

/** Daily.tsx dispatches this on window when today's game finishes, so the dot goes at once. */
export const DAILY_FINISHED = 'daily:finished';

export function useDailyPending(authReady: boolean, signedIn: boolean): boolean {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!authReady) return; // signed in or not changes which game counts
    let alive = true;
    let timer: number | undefined;
    let nextAt = 0;
    const check = async () => {
      window.clearTimeout(timer);
      try {
        const inf = await api.daily.info();
        if (!alive) return;
        nextAt = inf.nextAt;
        setPending(inf.signedIn ? !inf.game?.finished : !loadGame(inf.day)?.finished);
        // the next drop brings a new game (and the dot) back; background tabs may fire late, see visible()
        timer = window.setTimeout(() => void check(), Math.max(1000, inf.nextAt - Date.now() + 1000));
      } catch {
        /* unknown: no dot */
      }
    };
    const done = () => setPending(false);
    const visible = () => {
      if (document.visibilityState === 'visible' && nextAt && Date.now() >= nextAt) void check();
    };
    void check();
    window.addEventListener(DAILY_FINISHED, done);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener(DAILY_FINISHED, done);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [authReady, signedIn]);
  return pending;
}
