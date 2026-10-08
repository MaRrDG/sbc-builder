// Time left to the next player (hh:mm:ss), ticking each second; calls onDone once when it reaches 0.
import { useEffect, useRef, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ to, onDone }: { to: number; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);
  const left = Math.max(0, to - now);

  useEffect(() => {
    done.current = false;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [to]);

  useEffect(() => {
    if (left > 0 || done.current) return;
    done.current = true;
    onDone();
  }, [left, onDone]);

  const s = Math.floor(left / 1000);
  return (
    <time className="dg-count" aria-live="off" dateTime={`PT${Math.floor(s / 3600)}H${Math.floor(s / 60) % 60}M${s % 60}S`}>
      {pad(Math.floor(s / 3600))}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
    </time>
  );
}
