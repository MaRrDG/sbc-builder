// What setup must create or update so the guild matches discord/layout.ts. Pure; never deletes anything.
import type { CategorySpec, ChannelKind, ChannelSpec, RoleSpec } from './layout.js';

type ExistingKind = 'text' | 'announcement' | 'voice' | 'category' | 'other';
export interface Existing {
  roles: { id: string; name: string; managed: boolean }[];
  channels: { id: string; name: string; kind: ExistingKind; parentId: string | null }[];
}

export type Action =
  | { op: 'createRole'; role: RoleSpec }
  | { op: 'updateRole'; id: string; role: RoleSpec }
  | { op: 'createCategory'; category: CategorySpec; position: number }
  | { op: 'updateCategory'; id: string; category: CategorySpec; position: number }
  | { op: 'createChannel'; category: string; channel: ChannelSpec; position: number }
  | { op: 'updateChannel'; id: string; category: string; channel: ChannelSpec; position: number; convert: boolean };

const key = (s: string) => s.trim().toLowerCase();
const names = (x: { name: string; aliases?: string[] }) => [x.name, ...(x.aliases ?? [])].map(key);
// an Announcement spec also takes a text channel of that name (converted once Community is on)
const fits = (want: ChannelKind, have: ExistingKind) => have === want || (want === 'announcement' && have === 'text');

/** Roles by name / alias, categories by name / alias, channels by name / alias + kind inside their category. */
export function planSync(existing: Existing, roles: RoleSpec[], categories: CategorySpec[]): Action[] {
  const actions: Action[] = [];
  // managed roles (bots, boosters, @everyone) are never ours to edit here
  const ownRoles = existing.roles.filter((r) => !r.managed);
  for (const role of roles) {
    const e = ownRoles.find((r) => names(role).includes(key(r.name)));
    actions.push(e ? { op: 'updateRole', id: e.id, role } : { op: 'createRole', role });
  }
  const cats = existing.channels.filter((c) => c.kind === 'category');
  categories.forEach((category, ci) => {
    const e = cats.find((c) => names(category).includes(key(c.name)));
    actions.push(e ? { op: 'updateCategory', id: e.id, category, position: ci } : { op: 'createCategory', category, position: ci });
    category.channels.forEach((channel, position) => {
      const found = e && existing.channels.find((c) => c.parentId === e.id && fits(channel.kind, c.kind) && names(channel).includes(key(c.name)));
      actions.push(found
        ? { op: 'updateChannel', id: found.id, category: category.name, channel, position, convert: channel.kind === 'announcement' && found.kind === 'text' }
        : { op: 'createChannel', category: category.name, channel, position });
    });
  });
  return actions;
}

/** Layout roles stacked right under the bot's own role, in layout order (Admin highest). */
export function rolePositions(names: string[], botPosition: number): { name: string; position: number }[] {
  return names.map((name, i) => ({ name, position: Math.max(1, botPosition - 1 - i) }));
}
