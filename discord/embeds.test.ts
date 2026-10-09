import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotApiError } from './api.js';
import { errorText, solutionMessage, statsMessage } from './embeds.js';
import { clip } from './text.js';
import type { BotSolution } from '../server/discord/solution.js';

const base: BotSolution = {
  found: true, set: 'Bronze Upgrade', challenge: 'Bronze', setId: 16, challengeId: 35, rating: 64, chemistry: 21,
  slots: [
    { pos: 'GK', name: 'Ana', rating: 64, chem: 3, storage: false, brick: false },
    { pos: 'ST', name: 'Io`n', rating: 65, chem: 1, storage: true, brick: false },
    { pos: 'CB', name: '', rating: 0, chem: 0, storage: false, brick: true },
  ],
  points: null, reasons: [], quota: { used: 5, limit: 20, resetsAt: 1790605200000 }, lang: 'en',
};

test('found squad: title, one line per slot with pips, storage and locked marks, no pings, link button', () => {
  const m = solutionMessage(base, 'en', '42', 'https://fcsolver.gg', 'https://cdn/icon.png');
  const e = m.embeds[0].toJSON();
  assert.equal(e.author?.name, 'FC Solver');
  assert.equal(e.color, 0xc8f53c);
  assert.equal(e.title, 'Bronze Upgrade — Bronze');
  assert.equal(e.url, 'https://fcsolver.gg/dashboard/sbc/16/35');
  assert.match(e.description!, /GK\s+64\s+●●●\s+Ana/);
  assert.match(e.description!, /ST\s+65\s+●○○\s+Io'n \(S\)/);
  assert.match(e.description!, /CB\s+locked/);
  assert.deepEqual(e.fields?.map((f) => f.value), ['64', '21']);
  assert.match(e.footer!.text, /Free: 5\/20/);
  assert.deepEqual(m.allowedMentions, { parse: [] });
  assert.equal(m.content, '<@42> · /sbc');
  assert.equal((m.components[0].toJSON().components[0] as { url?: string }).url, 'https://fcsolver.gg/dashboard/sbc/16/35');
});

test('Premium: no quota in the footer', () => {
  const e = solutionMessage({ ...base, quota: null }, 'ro', '42', 'https://fcsolver.gg').embeds[0].toJSON();
  assert.doesNotMatch(e.footer!.text, /Free/);
  assert.match(e.footer!.text, /setări implicite/);
});

test('points answer lists the cards and total / target', () => {
  const e = solutionMessage({ ...base, slots: [], points: { target: 120, total: 124, cards: [{ name: 'Ana', rating: 70, points: 60 }] } }, 'en', '42', 'https://fcsolver.gg').embeds[0].toJSON();
  assert.match(e.description!, /70\s+Ana · 60 pts/);
  assert.deepEqual(e.fields?.map((f) => f.value), ['124/120']);
});

test('not found: worded reasons in the chosen language', () => {
  const e = solutionMessage({ ...base, found: false, slots: [], quota: null, reasons: [{ code: 'pool', have: 3, need: 11 }, { code: 'count', req: 'France: Min. 2', have: 0 }] }, 'ro', '42', 'https://fcsolver.gg').embeds[0].toJSON();
  assert.match(e.description!, /Doar 3 jucători se pot folosi, e nevoie de 11\./);
  assert.match(e.description!, /France: Min\. 2: ai 0 utilizabili\./);
});

test('stats: five numbers and when counting started', () => {
  const m = statsMessage({ sbcs: 112, challenges: 240, objectives: 104, club: 812, streak: 4, since: Date.UTC(2026, 9, 9), lang: 'en' }, 'en', '42');
  const e = m.embeds[0].toJSON();
  assert.deepEqual(e.fields?.map((f) => f.value), ['112', '240', '104', '812', '4']);
  assert.match(e.footer!.text, /since 2026-10-09/);
  assert.match(statsMessage({ sbcs: 0, challenges: 0, objectives: 0, club: 0, streak: 0, since: null, lang: 'en' }, 'en', '42').embeds[0].toJSON().footer!.text, /Nothing counted yet/);
});

test('errors: link, quota with a Discord timestamp, unknown and network', () => {
  assert.match(errorText(new BotApiError('x', 404, 'discordNotLinked'), 'en', 'https://fcsolver.gg'), /https:\/\/fcsolver\.gg\/dashboard\/settings/);
  const q = errorText(new BotApiError('x', 403, 'quotaExhausted', { limit: 20, resetsAt: 1790605200000 }), 'ro', 'https://fcsolver.gg');
  assert.match(q, /toate cele 20/);
  assert.match(q, /<t:1790605200:R>/);
  assert.match(errorText(new BotApiError('x', 500, null), 'en', 'x'), /didn't answer/);
  assert.match(errorText(new TypeError('fetch failed'), 'en', 'x'), /didn't answer/);
});

test('errors: set not available, bad request, solve already running', () => {
  assert.match(errorText(new BotApiError('x', 409, 'setNotAvailable'), 'en', 'x'), /done or cannot be repeated/);
  assert.match(errorText(new BotApiError('x', 400, 'badRequest'), 'ro', 'x'), /Alege SBC-ul/);
  assert.match(errorText(new BotApiError('x', 429, 'botRateLimited'), 'en', 'x'), /Too many solves/);
});

test('clip is code-point safe', () => {
  assert.equal(clip('abc', 5), 'abc');
  assert.equal(clip('ab🧩🧩🧩', 4), 'ab🧩…');
});

test('worst case stays within Discord limits', () => {
  const long = 'Ñ'.repeat(120);
  const slots = Array.from({ length: 11 }, (_, i) => ({ pos: 'CAM', name: long, rating: 99, chem: 3, storage: true, brick: i === 10 }));
  const reasons = Array.from({ length: 3 }, () => ({ code: 'count', req: long.repeat(5), have: 0 }));
  const sizes = (e: ReturnType<typeof solutionMessage>['embeds'][number]) => {
    const j = e.toJSON();
    for (const f of j.fields ?? []) assert.ok([...f.value].length <= 1024);
    assert.ok([...j.description!].length <= 4096);
    assert.ok([...j.title!].length <= 256);
    assert.ok([...j.footer!.text].length <= 2048);
    return [...(j.title ?? '')].length + [...j.description!].length + [...j.footer!.text].length + (j.fields ?? []).reduce((n, f) => n + [...f.name].length + [...f.value].length, 0) + [...(j.author?.name ?? '')].length;
  };
  const longSet = { ...base, set: long.repeat(4), challenge: long.repeat(4) };
  assert.ok(sizes(solutionMessage({ ...longSet, slots }, 'en', '42', 'https://fcsolver.gg').embeds[0]) <= 6000);
  assert.ok(sizes(solutionMessage({ ...longSet, found: false, slots: [], reasons }, 'ro', '42', 'https://fcsolver.gg').embeds[0]) <= 6000);
  const cards = Array.from({ length: 60 }, () => ({ name: long, rating: 99, points: 999 }));
  assert.ok(sizes(solutionMessage({ ...longSet, slots: [], points: { target: 1, total: 2, cards } }, 'en', '42', 'https://fcsolver.gg').embeds[0]) <= 6000);
});
