// Countdown for a training end time (epoch ms, from the server); the browser's clock, any time zone.
export function timeLeft(endsAt: number, now: number) {
  const ms = endsAt - now;
  if (ms <= 0) return { done: true, days: 0, hours: 0, minutes: 0 };
  const total = Math.ceil(ms / 60e3);
  return { done: false, days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
