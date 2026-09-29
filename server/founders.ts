// Founding 50: the first users who link an EA account (through the extension, from the web app)
// get Premium for life. Pure rules; the rows and the lock live in server/db/users.ts.

// read on use: .env is loaded by initDb(), after this module is imported
export function foundersLimit(): number {
  const raw = process.env.FOUNDERS_LIMIT?.trim();
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 0 ? n : 50; // unset or empty (compose): 50
}

export interface FoundersState {
  limit: number;
  taken: number;
  left: number;
}

export const foundersState = (taken: number, limit: number): FoundersState => ({ limit, taken, left: Math.max(0, limit - taken) });

/** Whether this link earns a spot: not an admin, not a founder yet, spots left, and this EA account has not earned one before. */
export function earnsSpot(o: { admin: boolean; alreadyFounder: boolean; taken: number; limit: number; personaUsed: boolean }): boolean {
  return !o.admin && !o.alreadyFounder && !o.personaUsed && o.taken < o.limit;
}
