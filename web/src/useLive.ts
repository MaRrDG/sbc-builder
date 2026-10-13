// Keeps /api/stream open while the tab is visible and hands its events to the dashboard. Returns
// whether it is up: when it is not, the dashboard polls /api/status as before.
import { useEffect, useRef, useState } from 'react';
import { openStream, type api } from './api';
import { parseSse } from './sse';

type StatusResponse = Awaited<ReturnType<typeof api.status>>;
const BACKOFF = [1000, 3000, 10_000, 30_000, 60_000];

export function useLive(persona: number | null, on: { status: (s: StatusResponse) => void; changed: (keys: string[]) => void }): boolean {
  const [up, setUp] = useState(false);
  const handlers = useRef(on);
  handlers.current = on;
  useEffect(() => {
    if (!persona) return;
    let stop = false;
    let running = false; // one loop at a time, even after a fast hidden → visible
    let ctl: AbortController | null = null;
    let fails = 0;
    const loop = async () => {
      if (running) return;
      running = true;
      try {
        while (!stop) {
          if (document.hidden) return; // back in front starts it again
          ctl = new AbortController();
          try {
            const res = await openStream(ctl.signal);
            if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
            fails = 0;
            setUp(true);
            const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            let buf = '';
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break; // the server closes every 5 min: reconnect with a fresh token
              const r = parseSse(buf + value);
              buf = r.rest;
              for (const e of r.events) {
                if (stop) return;
                if (e.event === 'status') handlers.current.status(JSON.parse(e.data));
                else if (e.event === 'changed') handlers.current.changed((JSON.parse(e.data) as { keys: string[] }).keys);
              }
            }
          } catch {
            if (stop) return;
            setUp(false);
            if (document.hidden) return; // aborted by going to the background: no backoff wait
            await new Promise((r) => setTimeout(r, BACKOFF[Math.min(fails++, BACKOFF.length - 1)]));
          }
        }
      } finally {
        running = false;
      }
    };
    const onVisible = () => {
      if (document.hidden) {
        ctl?.abort();
        setUp(false);
      } else void loop();
    };
    document.addEventListener('visibilitychange', onVisible);
    void loop();
    return () => {
      stop = true;
      ctl?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      setUp(false);
    };
  }, [persona]);
  return up;
}
