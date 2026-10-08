import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confederationOf, leagueCountry, positionLine } from './regions.js';

test('nations map to football confederations', () => {
  assert.equal(confederationOf(14), 'UEFA'); // England
  assert.equal(confederationOf(26), 'UEFA'); // Israel
  assert.equal(confederationOf(165), 'UEFA'); // Kazakhstan
  assert.equal(confederationOf(219), 'UEFA'); // Kosovo
  assert.equal(confederationOf(54), 'CONMEBOL'); // Brazil
  assert.equal(confederationOf(95), 'CONCACAF'); // United States
  assert.equal(confederationOf(207), 'CONCACAF'); // Dominican Republic
  assert.equal(confederationOf(108), 'CAF'); // Ivory Coast
  assert.equal(confederationOf(218), 'CAF'); // South Sudan
  assert.equal(confederationOf(167), 'AFC'); // Korea Republic
  assert.equal(confederationOf(195), 'AFC'); // Australia
  assert.equal(confederationOf(198), 'OFC'); // New Zealand
  assert.equal(confederationOf(75), undefined); // International
  assert.equal(confederationOf(211), undefined); // Rest of World
});

test('leagues map to countries; same country = same code', () => {
  assert.equal(leagueCountry(13), 'ENG');
  assert.equal(leagueCountry(14), 'ENG');
  assert.equal(leagueCountry(53), leagueCountry(54));
  assert.equal(leagueCountry(31), leagueCountry(32));
  assert.equal(leagueCountry(19), leagueCountry(2076));
  assert.equal(leagueCountry(16), leagueCountry(17));
  assert.notEqual(leagueCountry(13), leagueCountry(50)); // England vs Scotland
  assert.equal(leagueCountry(2118), undefined); // Icons
});

test('positions map to lines; GK alone', () => {
  assert.equal(positionLine('GK'), 'gk');
  for (const p of ['CB', 'LB', 'RB', 'LWB', 'RWB']) assert.equal(positionLine(p), 'def', p);
  for (const p of ['CDM', 'CM', 'CAM', 'LM', 'RM']) assert.equal(positionLine(p), 'mid', p);
  for (const p of ['LW', 'RW', 'CF', 'ST']) assert.equal(positionLine(p), 'att', p);
  assert.equal(positionLine('SUB'), undefined);
});
