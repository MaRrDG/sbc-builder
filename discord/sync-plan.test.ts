import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT, CATEGORIES, CH, ROLES } from './layout.js';
import { planSync, rolePositions, type Action, type Existing } from './sync-plan.js';

/** What the guild looks like after applying `actions` to `start` (ids made up; announcement created as text, like setup before Community). */
function materialize(start: Existing, actions: Action[]): Existing {
  const out: Existing = { roles: [...start.roles], channels: [...start.channels] };
  let n = 0;
  const catIds = new Map<string, string>();
  for (const a of actions) {
    if (a.op === 'createRole') out.roles.push({ id: `r${n++}`, name: a.role.name, managed: false });
    if (a.op === 'createCategory') {
      const id = `c${n++}`;
      catIds.set(a.category.name, id);
      out.channels.push({ id, name: a.category.name, kind: 'category', parentId: null });
    }
    if (a.op === 'updateCategory') catIds.set(a.category.name, a.id);
  }
  for (const a of actions)
    if (a.op === 'createChannel')
      out.channels.push({ id: `x${n++}`, name: a.channel.name, kind: a.channel.kind === 'announcement' ? 'text' : a.channel.kind, parentId: catIds.get(a.category)! });
  return out;
}

const empty: Existing = { roles: [{ id: 'g', name: '@everyone', managed: true }], channels: [] };
const creates = (a: Action[]) => a.filter((x) => x.op.startsWith('create'));

test('an empty guild gets every role, category and channel created', () => {
  const a = planSync(empty, ROLES, CATEGORIES);
  assert.equal(a.filter((x) => x.op === 'createRole').length, ROLES.length);
  assert.equal(a.filter((x) => x.op === 'createCategory').length, CATEGORIES.length);
  assert.equal(a.filter((x) => x.op === 'createChannel').length, CATEGORIES.flatMap((c) => c.channels).length);
});

test('running again creates nothing; both "💬・general" matched in their own category; the text announcements channel is converted', () => {
  const after = materialize(empty, planSync(empty, ROLES, CATEGORIES));
  const again = planSync(after, ROLES, CATEGORIES);
  assert.deepEqual(creates(again), []);
  const updates = again.filter((x) => x.op === 'updateChannel') as Extract<Action, { op: 'updateChannel' }>[];
  assert.equal(new Set(updates.filter((u) => u.channel.name === '💬・general').map((u) => u.id)).size, 2);
  assert.deepEqual(updates.filter((u) => u.convert).map((u) => u.channel.name), [CH.announcements]);
});

test('an announcement channel already converted is not converted again', () => {
  const after = materialize(empty, planSync(empty, ROLES, CATEGORIES));
  after.channels = after.channels.map((c) => (c.name === CH.announcements ? { ...c, kind: 'announcement' } : c));
  assert.ok(planSync(after, ROLES, CATEGORIES).every((x) => x.op !== 'updateChannel' || !x.convert));
});

test('names match case-insensitively; extra channels and roles are left alone', () => {
  const after = materialize(empty, planSync(empty, ROLES, CATEGORIES));
  after.roles.push({ id: 'own', name: 'Streamers', managed: false });
  after.channels.push({ id: 'mine', name: 'memes', kind: 'text', parentId: after.channels.find((c) => c.name === CAT.en)!.id });
  after.roles = after.roles.map((r) => (r.name === 'Member' ? { ...r, name: 'member' } : r));
  const again = planSync(after, ROLES, CATEGORIES);
  assert.deepEqual(creates(again), []);
  assert.ok(!JSON.stringify(again).includes('"mine"') && !JSON.stringify(again).includes('"own"'));
});

test('an old name listed in aliases is matched (and renamed by setup), not duplicated', () => {
  const after = materialize(empty, planSync(empty, ROLES, CATEGORIES));
  after.channels = after.channels.map((c) => (c.name === CH.daily ? { ...c, name: 'daily' } : c));
  after.channels = after.channels.map((c) => (c.name === CAT.voice ? { ...c, name: 'VOICE' } : c));
  const cats = CATEGORIES.map((c) => ({
    ...c,
    aliases: c.name === CAT.voice ? ['VOICE'] : c.aliases,
    channels: c.channels.map((ch) => (ch.name === CH.daily ? { ...ch, aliases: ['daily'] } : ch)),
  }));
  assert.deepEqual(creates(planSync(after, ROLES, cats)), []);
});

test('a managed role (another bot) with a layout name is not taken over', () => {
  const g: Existing = { roles: [...empty.roles, { id: 'm', name: 'Member', managed: true }], channels: [] };
  assert.ok(planSync(g, ROLES, CATEGORIES).some((x) => x.op === 'createRole' && x.role.name === 'Member'));
});

test('a same-name channel of another kind does not count (text vs voice)', () => {
  const after = materialize(empty, planSync(empty, ROLES, CATEGORIES));
  const voiceCat = after.channels.find((c) => c.name === CAT.voice)!.id;
  after.channels = after.channels.filter((c) => !(c.parentId === voiceCat && c.name === '🔊 Lounge'));
  after.channels.push({ id: 'tv', name: '🔊 Lounge', kind: 'text', parentId: voiceCat });
  assert.ok(planSync(after, ROLES, CATEGORIES).some((x) => x.op === 'createChannel' && x.channel.name === '🔊 Lounge'));
});

test('role positions count down from just under the bot, never below 1', () => {
  assert.deepEqual(rolePositions(['Admin', 'Moderator', 'Member'], 10), [
    { name: 'Admin', position: 9 }, { name: 'Moderator', position: 8 }, { name: 'Member', position: 7 },
  ]);
  assert.equal(rolePositions(['a', 'b', 'c'], 2)[2].position, 1);
});
