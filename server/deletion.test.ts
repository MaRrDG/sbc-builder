import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUser, type PurgeDeps } from './deletion.js';
import { deletionMail } from './deletion-mail.js';

/** Fakes that record every call in order; `opts` shapes the persona rows and failures. */
function fakes(opts: { owners?: { personaId: number; ownerId: string | null }[]; links?: { personaId: number; userId: string }[]; subs?: string[]; clerk?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const deps: PurgeDeps = {
    subsToCancel: async () => opts.subs ?? [],
    paddleCancelNow: async (ids) => void calls.push(`paddle:${ids.join(',')}`),
    clerkDelete: async (id) => {
      calls.push(`clerk:${id}`);
      if (opts.clerk) await opts.clerk();
    },
    personasForPurge: async () => ({ personas: opts.owners ?? [], links: opts.links ?? [] }),
    forgetAccount: (id) => void calls.push(`forget:${id}`),
    dropKeys: async (p) => void calls.push(`drop:${p}`),
    purgePersonaRows: async (id) => void calls.push(`rows:${id}`),
    unlinkUser: async (id, u) => void calls.push(`unlink:${id}:${u}`),
    anonymizeEvents: async (u, ids) => void calls.push(`anon:${u}:${ids.join(',')}`),
    purgeUserRows: async (u) => void calls.push(`user:${u}`),
  };
  return { calls, deps };
}

test('purgeUser: Paddle, Clerk, personas, events, then the user row last', async () => {
  const { calls, deps } = fakes({
    subs: ['sub_1'],
    owners: [
      { personaId: 1, ownerId: 'u1' },
      { personaId: 2, ownerId: 'u2' },
    ],
    links: [
      { personaId: 1, userId: 'u1' },
      { personaId: 2, userId: 'u1' },
      { personaId: 2, userId: 'u2' },
    ],
  });
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['paddle:sub_1', 'clerk:u1', 'forget:1', 'drop:accounts/1', 'rows:1', 'unlink:2:u1', 'anon:u1:1', 'user:u1']);
});

test('purgeUser: no subscriptions to cancel → no Paddle call', async () => {
  const { calls, deps } = fakes();
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['clerk:u1', 'anon:u1:', 'user:u1']);
});

test('purgeUser: a persona another user owns now is only unlinked, never dropped', async () => {
  const { calls, deps } = fakes({ owners: [{ personaId: 7, ownerId: 'u2' }], links: [{ personaId: 7, userId: 'u1' }] });
  await purgeUser('u1', deps);
  assert.ok(calls.includes('unlink:7:u1'));
  assert.ok(!calls.some((c) => c.startsWith('drop:') || c.startsWith('rows:') || c.startsWith('forget:')));
});

test('purgeUser: a Clerk failure stops before the personas; the next run completes', async () => {
  let fail = true;
  const { calls, deps } = fakes({
    owners: [{ personaId: 1, ownerId: 'u1' }],
    clerk: async () => {
      if (fail) throw new Error('clerk down');
    },
  });
  await assert.rejects(purgeUser('u1', deps), /clerk down/);
  assert.deepEqual(calls, ['clerk:u1']);
  fail = false;
  calls.length = 0;
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['clerk:u1', 'forget:1', 'drop:accounts/1', 'rows:1', 'anon:u1:1', 'user:u1']);
});

test('purgeUser: Clerk 404 (already deleted) counts as done', async () => {
  const { calls, deps } = fakes({
    clerk: async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    },
  });
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['clerk:u1', 'anon:u1:', 'user:u1']);
});

test('deletionMail: the date and the way back in every language', () => {
  const at = new Date('2026-10-20T10:00:00Z');
  for (const lang of ['en', 'ro', 'it'] as const) {
    const m = deletionMail(lang, at, { siteUrl: 'https://fc-solver.app/dashboard' });
    assert.match(m.subject, /2026/);
    assert.match(m.text, /2026/);
    assert.match(m.text, /https:\/\/fc-solver\.app\/dashboard/);
    assert.match(m.html, /href="https:\/\/fc-solver\.app\/dashboard"/);
  }
  assert.match(deletionMail('en', at, { siteUrl: 'x' }).text, /Cancel deletion/);
  assert.match(deletionMail('ro', at, { siteUrl: 'x' }).text, /Anulează ștergerea/);
});
