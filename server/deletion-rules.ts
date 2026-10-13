// Pure rules for deleting an account (docs/superpowers/specs/2026-10-13-gdpr-account-design.md).
export const DELETE_DELAY_MS = 7 * 24 * 3600 * 1000;
export const deleteDate = (now: number) => new Date(now + DELETE_DELAY_MS);

/** The word typed in the confirm box, in any site language (shared with the site). */
export { isConfirmWord } from '../shared/confirm-word.js';

/**
 * Which EA accounts lose their data when `userId` goes: those no OTHER user currently owns.
 * A past link (persona_links) is history, not use; ownership (personas.userId) is.
 */
export function purgePlan(
  userId: string,
  personas: { personaId: number; ownerId: string | null }[],
  links: { personaId: number; userId: string }[],
): { purge: number[]; unlinkOnly: number[] } {
  const mine = new Set([...personas.filter((p) => p.ownerId === userId).map((p) => p.personaId), ...links.filter((l) => l.userId === userId).map((l) => l.personaId)]);
  const owner = new Map(personas.map((p) => [p.personaId, p.ownerId]));
  const purge: number[] = [];
  const unlinkOnly: number[] = [];
  for (const id of [...mine].sort((a, b) => a - b)) {
    const o = owner.get(id) ?? null;
    if (o && o !== userId) unlinkOnly.push(id);
    else purge.push(id);
  }
  return { purge, unlinkOnly };
}
