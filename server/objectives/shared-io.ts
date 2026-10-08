// Writes the shared objectives catalogue when a trusted account relays its list.
import { writeCache } from '../store.js';
import { trustedIds } from '../db/sbcs.js';
import { SHARED_OBJECTIVES_KEY, stripPersonal } from './shared.js';
import type { EaCategory } from './types.js';

const isTrustedInDb = async (personaId: number) => (await trustedIds()).has(personaId);

/** True when written. The trust lookup is injectable (tests); a failing lookup (no database) counts as untrusted. */
export async function shareObjectives(
  personaId: number, categories: EaCategory[], isTrusted: (personaId: number) => Promise<boolean> = isTrustedInDb,
): Promise<boolean> {
  const trusted = await isTrusted(personaId).catch(() => false);
  if (!trusted) return false;
  await writeCache<{ categories: EaCategory[] }>(SHARED_OBJECTIVES_KEY, { categories: stripPersonal(categories) });
  return true;
}
