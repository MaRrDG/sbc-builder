import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SBC_DATA_DIR = await mkdtemp(join(tmpdir(), 'shared-obj-'));
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EaCategory } from './types.js';

const cats: EaCategory[] = [{ categoryId: 1, name: 'Campaigns', groupsList: [{ groupId: 7, title: 'T', startTime: 1, endTime: 0, awardsList: [],
  objectives: [{ objectiveId: 9, name: 'O', description: 'Play 1 match.', state: 'IN_PROGRESS', currentProgress: 1, multiplier: 3, awards: [] }] }] }];

test('only a trusted account\'s list becomes the shared catalogue, stripped; a failing lookup counts as untrusted', async () => {
  const { shareObjectives } = await import('./shared-io.js');
  const { readCache } = await import('../store.js');
  const { SHARED_OBJECTIVES_KEY } = await import('./shared.js');
  assert.equal(await shareObjectives(1, cats, async () => false), false);
  assert.equal(await shareObjectives(1, cats, async () => { throw new Error('no db'); }), false);
  assert.equal(await readCache(SHARED_OBJECTIVES_KEY), null);
  assert.equal(await shareObjectives(1, cats, async (id) => id === 1), true);
  const saved = await readCache<{ categories: EaCategory[] }>(SHARED_OBJECTIVES_KEY);
  const o = saved!.data.categories[0].groupsList[0].objectives[0];
  assert.equal(o.objectiveId, 9);
  assert.equal(o.state, undefined);
  assert.equal(o.currentProgress, undefined);
});

test('without a database (default lookup) nothing is shared and nothing throws', async () => {
  const { shareObjectives } = await import('./shared-io.js');
  assert.equal(await shareObjectives(2, cats), false);
});
