import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConditions, resolveName, normName } from './parse.js';
import type { Names } from './types.js';

// ids copied from the real FC 27 meta (server/meta.ts names)
const names: Names = {
  nation: { 14: 'England', 18: 'France', 34: 'Netherlands', 45: 'Spain', 52: 'Argentina', 95: 'United States' },
  league: {
    10: 'Eredivisie', 13: 'Premier League', 31: 'Serie A Enilive', 53: 'LALIGA EA SPORTS',
    2216: 'Barclays Women’s Super League', 2218: 'Arkema Première Ligue',
  },
  club: { 1: 'Arsenal', 245: 'Ajax' },
  rarity: { 1: 'Rare', 151: 'Ultimate Scream', 168: 'Ultimate Scream Hero' },
};
const p = (d: string) => parseConditions(d, names);

test('normName folds case, accents and curly quotes', () => {
  assert.equal(normName('  Arkema  Première Ligue'), 'arkema premiere ligue');
  assert.equal(normName('Barclays Women’s Super League'), "barclays women's super league");
});

test('resolveName: aliases, exact names, prefix names, unknown', () => {
  assert.deepEqual(resolveName('Dutch', names), { nation: [34] });
  assert.deepEqual(resolveName('USA', names), { nation: [95] });
  assert.deepEqual(resolveName('WSL', names), { league: [2216] });
  assert.deepEqual(resolveName("Women's Super League", names), { league: [2216] });
  assert.deepEqual(resolveName('Serie A', names), { league: [31] });
  assert.deepEqual(resolveName('Ultimate Scream', names), { rarity: [151] });
  assert.deepEqual(resolveName('Ajax', names), { club: [245] });
  assert.equal(resolveName('Argentine Primera División', names), null);
});

test('score / assist using a filtered player', () => {
  assert.deepEqual(p('Score 6 goals using a Dutch player in any FUT game mode.'), [{ role: 'score', min: 1, filter: { nation: [34] } }]);
  assert.deepEqual(p('Score 6 goals in Squad Battles on Min. Semi-Pro difficulty (or Rivals/Live Events/Rush) using a player from France.'),
    [{ role: 'score', min: 1, filter: { nation: [18] } }]);
  assert.deepEqual(p('Assist 3 goals in Squad Battles on Min. Semi-Pro difficulty (or Rivals/Live Events/Rush) using a Arkema Première Ligue player.'),
    [{ role: 'assist', min: 1, filter: { league: [2218] } }]);
  assert.deepEqual(p('Assist 6 goals in Squad Battles on Min. Semi-Pro difficulty (or Rush) using a player from Serie A.'),
    [{ role: 'assist', min: 1, filter: { league: [31] } }]);
  assert.deepEqual(p('Score 10 goals in any FUT game mode using a Spanish player.'), [{ role: 'score', min: 1, filter: { nation: [45] } }]);
});

test('score and assist together give two conditions', () => {
  assert.deepEqual(p('Score and Assist in 3 separate matches using a Eredivisie player in any FUT game mode.'), [
    { role: 'score', min: 1, filter: { league: [10] } },
    { role: 'assist', min: 1, filter: { league: [10] } },
  ]);
});

test('positions and attributes', () => {
  assert.deepEqual(p('Assist 5 goals using a CAM (Preferred position only) in any FUT game mode.'),
    [{ role: 'assist', min: 1, filter: { position: 'CAM', preferredOnly: true } }]);
  assert.deepEqual(p('Assist 5 goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) using a ST.'),
    [{ role: 'assist', min: 1, filter: { position: 'ST' } }]);
  assert.deepEqual(p('Score 6 goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) using Players with 85+ Pace.'),
    [{ role: 'score', min: 1, filter: { attr: { stat: 'PAC', min: 85 } } }]);
});

test('starting 11 conditions', () => {
  assert.deepEqual(p('Win 4 matches while having min. 1 Dutch player in your starting 11 in any FUT game mode.'),
    [{ role: 'xi', min: 1, filter: { nation: [34] } }]);
  assert.deepEqual(p('Play 5 matches while having min. 1 Eredivisie player in your starting 11 in any FUT game mode.'),
    [{ role: 'xi', min: 1, filter: { league: [10] } }]);
  assert.deepEqual(p('Play 3 matches in any Football Ultimate Team game mode while having at least 2 players from USA in your starting 11.'),
    [{ role: 'xi', min: 2, filter: { nation: [95] } }]);
  assert.deepEqual(p('Play 5 matches in any Ultimate Team game mode while having Min. 1 Ultimate Scream player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { rarity: [151] } }]);
  assert.deepEqual(p('Win 5 matches in Rivals or Live Events while having min. 1 English Player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { nation: [14] } }]);
  assert.deepEqual(p('Assist 1 goal while having min. 1 Spanish player in your starting XI in the Ones We Watched World Class Challenge.'),
    [{ role: 'xi', min: 1, filter: { nation: [45] } }]);
  assert.deepEqual(
    p("Score 5 goals in any Football Ultimate Team game mode while having at least 1 player from any Premier League team and 1 player from any Women's Super League team in your starting 11."),
    [{ role: 'xi', min: 1, filter: { league: [13] } }, { role: 'xi', min: 1, filter: { league: [2216] } }],
  );
  assert.deepEqual(p('Win 3 matches by 2 or more goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) while having min. 1 WSL Player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { league: [2216] } }]);
});

test('no squad condition', () => {
  for (const d of [
    'Win 4 matches in Rivals.',
    'Play 15 Draft matches.',
    'Win 100 matches in any FUT game mode with a starting squad of First Owned players.',
    'Win 3 matches in any FUT game mode while having the Icon Home Kit equipped.',
    'Build 20+ Chemistry in your squad.',
    'Play 5 Matches in any Ultimate Team Game mode while having Min. 1 Argentine Primera División player in your starting 11.',
  ])
    assert.deepEqual(p(d), [], d);
});
