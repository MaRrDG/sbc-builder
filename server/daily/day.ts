// Daily numbering: #1 is the first stored answer, one more per SBC drop (20:01 Europe/Bucharest).
import { DAY } from './players.js';

export function dayFor(drop: number, first: { day: number; dropAt: number } | null): number {
  return first ? first.day + Math.round((drop - first.dropAt) / DAY) : 1;
}

export function dropDate(drop: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(drop));
}

/** The drop after `now`: 25 h past the last drop is always past the next one, also across DST. */
export function nextDropAfter(lastDrop: (d: Date) => number, now: number): number {
  return lastDrop(new Date(lastDrop(new Date(now)) + 25 * 3_600_000));
}
