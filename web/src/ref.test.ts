import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refFromUrl, shouldOfferRef } from './ref.js';

test('refFromUrl', () => {
  assert.equal(refFromUrl('?ref=k7m2qx'), 'K7M2QX');
  assert.equal(refFromUrl('?utm=x&ref=K7M2-QX'), 'K7M2QX');
  assert.equal(refFromUrl('?ref=<script>'), null);
  assert.equal(refFromUrl(''), null);
});

test('shouldOfferRef', () => {
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: false, ownCode: 'AAAAAA' }), true);
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: true, ownCode: 'AAAAAA' }), false); // already used one
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: false, ownCode: 'K7M2QX' }), false); // own link
  assert.equal(shouldOfferRef(null, { usedInvite: false, ownCode: 'AAAAAA' }), false);
});
