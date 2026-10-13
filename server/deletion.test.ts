import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUser, type PurgeDeps } from './deletion.js';
import { deletionMail } from './deletion-mail.js';

/** Fakes that record every call in order; `opts` shapes the persona rows and failures. */
function fakes(
  opts: {
    owners?: { personaId: number; ownerId: string | null }[];
    links?: { personaId: number; userId: string }[];
    subs?: string[];
    clerk?: () => Promise<void>;
    unlink?: () => Promise<void>;
    /** the owner read right before acting; default: the same rows the plan saw */
    ownerNow?: (personaId: number) => string | null;
  } = {},
) {
  const calls: string[] = [];
  const deps: PurgeDeps = {
    subsToCancel: async () => opts.subs ?? [],
    paddleCancelNow: async (ids) => void calls.push(`paddle:${ids.join(',')}`),
    clerkDelete: async (id) => {
      calls.push(`clerk:${id}`);
      if (opts.clerk) await opts.clerk();
    },
    personasForPurge: async () => ({ personas: opts.owners ?? [], links: opts.links ?? [] }),
    ownerOf: async (id) => (opts.ownerNow ? opts.ownerNow(id) : ((opts.owners ?? []).find((o) => o.personaId === id)?.ownerId ?? null)),
    forgetAccount: (id) => void calls.push(`forget:${id}`),
    dropKeys: async (p) => void calls.push(`drop:${p}`),
    anonymizePersonaEvents: async (id) => void calls.push(`anonP:${id}`),
    purgePersonaRows: async (id) => void calls.push(`rows:${id}`),
    unlinkUser: async (id, u) => {
      calls.push(`unlink:${id}:${u}`);
      if (opts.unlink) await opts.unlink();
    },
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
  assert.deepEqual(calls, ['paddle:sub_1', 'clerk:u1', 'forget:1', 'drop:accounts/1', 'anonP:1', 'rows:1', 'unlink:2:u1', 'anon:u1:1', 'user:u1']);
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

test('purgeUser: ownership changes between plan and act → only unlinked, the data stays', async () => {
  const { calls, deps } = fakes({
    owners: [
      { personaId: 1, ownerId: 'u1' },
      { personaId: 3, ownerId: 'u1' },
    ],
    links: [{ personaId: 1, userId: 'u1' }],
    ownerNow: (id) => (id === 1 ? 'u2' : 'u1'), // u2 took over persona 1 after the plan was read
  });
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['clerk:u1', 'unlink:1:u1', 'forget:3', 'drop:accounts/3', 'anonP:3', 'rows:3', 'anon:u1:3', 'user:u1']);
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
  assert.deepEqual(calls, ['clerk:u1', 'forget:1', 'drop:accounts/1', 'anonP:1', 'rows:1', 'anon:u1:1', 'user:u1']);
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

test('purgeUser: a crash after a persona\'s rows went keeps its events anonymous (done before the rows)', async () => {
  let crash = true;
  const owners = [
    { personaId: 1, ownerId: 'u1' as string | null },
    { personaId: 2, ownerId: 'u2' as string | null },
  ];
  const { calls, deps } = fakes({
    owners,
    links: [{ personaId: 2, userId: 'u1' }],
    unlink: async () => {
      if (crash) throw new Error('db down');
    },
  });
  const rows = deps.purgePersonaRows;
  deps.purgePersonaRows = async (id, u) => {
    await rows(id, u);
    owners.splice(owners.findIndex((o) => o.personaId === id), 1); // committed: the next run no longer sees it
  };
  await assert.rejects(purgeUser('u1', deps), /db down/);
  assert.ok(calls.indexOf('anonP:1') >= 0 && calls.indexOf('anonP:1') < calls.indexOf('rows:1'));
  crash = false;
  calls.length = 0;
  await purgeUser('u1', deps);
  assert.deepEqual(calls, ['clerk:u1', 'unlink:2:u1', 'anon:u1:', 'user:u1']);
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
