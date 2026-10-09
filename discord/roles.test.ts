import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleDiff } from './roles.js';

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
