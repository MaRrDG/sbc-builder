import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_TARGET } from './paddle';

test('the inline checkout container does not use a class Paddle.js gives its own iframes', () => {
  // Paddle.js removes old `paddle-frame*` elements before it opens a checkout; a container with that
  // class is deleted under React, which then crashes in insertBefore
  assert.ok(!FRAME_TARGET.startsWith('paddle'), FRAME_TARGET);
  assert.match(FRAME_TARGET, /^[a-z][a-z0-9-]*$/);
});
