import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE } from './layout.js';
import { acceptRules, langOf, languageClick, roleDiff, withdrawRules } from './roles.js';

const group = ['Real Madrid', 'Barcelona', 'Milan'];

test('selection becomes exactly the roles of the group the member has', () => {
  assert.deepEqual(roleDiff(group, ['Barcelona', 'Member'], ['Real Madrid', 'Milan']), { add: ['Real Madrid', 'Milan'], remove: ['Barcelona'] });
});

test('roles outside the group are never touched, values outside the group ignored', () => {
  assert.deepEqual(roleDiff(group, ['Member', 'FCSB'], ['Hacked', 'Milan']), { add: ['Milan'], remove: [] });
});

test('empty selection removes the whole group', () => {
  assert.deepEqual(roleDiff(group, ['Milan', 'Barcelona'], []), { add: [], remove: ['Barcelona', 'Milan'] });
});

// language-first onboarding
test('language button, new joiner: toggles the pending role of that language, can hold both', () => {
  assert.deepEqual(languageClick([], 'EN'), { add: [ROLE.pendingEn], remove: [], now: ['EN'], member: false });
  assert.deepEqual(languageClick([ROLE.pendingEn], 'RO'), { add: [ROLE.pendingRo], remove: [], now: ['EN', 'RO'], member: false });
  assert.deepEqual(languageClick([ROLE.pendingEn, ROLE.pendingRo], 'EN'), { add: [], remove: [ROLE.pendingEn], now: ['RO'], member: false });
});

test('language button, Member: toggles the real language role directly, pending never added', () => {
  assert.deepEqual(languageClick([ROLE.member], 'RO'), { add: [ROLE.ro], remove: [], now: ['RO'], member: true });
  assert.deepEqual(languageClick([ROLE.member, ROLE.en, ROLE.ro], 'EN'), { add: [], remove: [ROLE.en], now: ['RO'], member: true });
});

test('accept rules: Member + the real roles of the pending ones, pending removed', () => {
  assert.deepEqual(acceptRules([ROLE.pendingRo, ROLE.pendingEn]), { add: [ROLE.member, ROLE.en, ROLE.ro], remove: [ROLE.pendingEn, ROLE.pendingRo] });
  assert.deepEqual(acceptRules([ROLE.pendingRo]), { add: [ROLE.member, ROLE.ro], remove: [ROLE.pendingRo] });
});

test('accept rules: real language roles already held count and are kept; no language at all = nothing', () => {
  assert.deepEqual(acceptRules([ROLE.en]), { add: [ROLE.member], remove: [] });
  assert.deepEqual(acceptRules([ROLE.member, ROLE.ro, ROLE.pendingEn]), { add: [ROLE.en], remove: [ROLE.pendingEn] });
  assert.equal(acceptRules([]), null);
  assert.equal(acceptRules([ROLE.member, 'FCSB']), null);
});

test('withdraw rules: Member and both real language roles go', () => {
  assert.deepEqual(withdrawRules(), [ROLE.member, ROLE.en, ROLE.ro]);
});

test('langOf reads the button id, only EN / RO', () => {
  assert.equal(langOf('lang:EN'), 'EN');
  assert.equal(langOf('lang:RO'), 'RO');
  assert.equal(langOf('lang:Admin'), null);
  assert.equal(langOf('pick:lang'), null);
});
