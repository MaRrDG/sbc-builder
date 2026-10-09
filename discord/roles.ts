import { PICKERS, ROLE } from './layout.js';

// Picker roles: set the member's roles in one group to exactly the selection; other roles are never touched.
export function roleDiff(group: string[], has: Iterable<string>, selected: string[]): { add: string[]; remove: string[] } {
  const mine = new Set(has);
  const want = new Set(selected.filter((s) => group.includes(s)));
  return {
    add: group.filter((g) => want.has(g) && !mine.has(g)),
    remove: group.filter((g) => !want.has(g) && mine.has(g)),
  };
}

// Language-first onboarding: language button -> Pending role -> ✅ on the rules -> Member + real language role.
export type Language = (typeof PICKERS.lang)[number];
const PENDING: Record<string, string> = { [ROLE.en]: ROLE.pendingEn, [ROLE.ro]: ROLE.pendingRo };

export const isMember = (has: Iterable<string>) => new Set(has).has(ROLE.member);

/** Button id `lang:EN` / `lang:RO` -> the language, anything else null. */
export function langOf(customId: string): Language | null {
  const [p, l] = customId.split(':');
  return p === 'lang' && PICKERS.lang.includes(l) ? l : null;
}

/** A language button: a Member toggles the real role, a new joiner the Pending one. `now` = languages held afterwards. */
export function languageClick(has: Iterable<string>, lang: Language): { add: string[]; remove: string[]; now: string[]; member: boolean } {
  const mine = new Set(has);
  const member = mine.has(ROLE.member);
  const role = member ? lang : PENDING[lang];
  const adding = !mine.has(role);
  if (adding) mine.add(role);
  else mine.delete(role);
  const now = PICKERS.lang.filter((l) => mine.has(member ? l : PENDING[l]));
  return { add: adding ? [role] : [], remove: adding ? [] : [role], now, member };
}

/** ✅ on the rules: Member plus the real role of every language picked (pending or already real). null = no language yet, ignore. */
export function acceptRules(has: Iterable<string>): { add: string[]; remove: string[] } | null {
  const mine = new Set(has);
  const langs = PICKERS.lang.filter((l) => mine.has(l) || mine.has(PENDING[l]));
  if (!langs.length) return null;
  return {
    add: [ROLE.member, ...langs].filter((r) => !mine.has(r)),
    remove: PICKERS.lang.map((l) => PENDING[l]).filter((r) => mine.has(r)),
  };
}

/** Removing ✅: Member goes, and RO / EN with it (Discord ORs roles, so the language areas must not outlive Member). */
export const withdrawRules = (): string[] => [ROLE.member, ...PICKERS.lang];

/** `/language` choice (EN / RO / both) -> exactly those real language roles; other roles untouched. */
export function languageChoice(has: Iterable<string>, choice: string): { add: string[]; remove: string[]; now: string[] } {
  const want = choice === 'both' ? [...PICKERS.lang] : PICKERS.lang.filter((l) => l === choice);
  return { ...roleDiff(PICKERS.lang, has, want), now: want };
}
