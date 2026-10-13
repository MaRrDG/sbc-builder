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
          const c = (ctl = new AbortController());
          let reader: ReadableStreamDefaultReader<string> | null = null;
          let openedAt = 0;
          try {
            const res = await openStream(c.signal);
            if (stop) return;
            if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
            openedAt = Date.now();
            setUp(true);
            reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            let buf = '';
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break; // the server closes every 5 min: reconnect with a fresh token
              const r = parseSse(buf + value);
              buf = r.rest;
              for (const e of r.events) {
                if (stop) return;
                try {
                  if (e.event === 'status') handlers.current.status(JSON.parse(e.data));
                  else if (e.event === 'changed') handlers.current.changed((JSON.parse(e.data) as { keys: string[] }).keys);
                } catch {
                  /* one bad frame is skipped, the stream stays */
                }
              }
            }
          } catch {
            /* network error, refused (429, 5xx) or aborted: see below */
          } finally {
            c.abort(); // frees the server's stream slot at once
            reader?.cancel().catch(() => {});
          }
          if (stop) return;
          // a stream that stayed up 10 s was a good one: reconnect at once. One that ended sooner
          // counts as a failure and waits, so a server that drops it right away is not hammered.
          if (openedAt && Date.now() - openedAt >= 10_000) {
            fails = 0;
            if (!document.hidden) continue;
          }
          setUp(false);
          if (document.hidden) return; // aborted by going to the background: no backoff wait
          await new Promise((r) => setTimeout(r, BACKOFF[Math.min(fails++, BACKOFF.length - 1)]));
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
