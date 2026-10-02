import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_FILE, cardFileName, cardSvg, nameSize, pngSize, textColor, tierOf } from './evo-card-svg.js';

// 1x1 PNG header is enough for pngSize(); 30 x 20 here
const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test('pngSize', () => {
  assert.deepEqual(pngSize(png(30, 20)), { w: 30, h: 20 });
  assert.equal(pngSize(Buffer.from('not a png at all, really')), null);
});

test('tierOf and textColor follow cardArt()', () => {
  assert.deepEqual([tierOf(64), tierOf(65), tierOf(74), tierOf(75)], [1, 2, 2, 3]);
  assert.equal(textColor({ levels: true, colors: [0x111111, 0, 0, 0x222222, 0, 0, 0x333333] }, 2), '#222222');
  assert.equal(textColor({ levels: false, colors: [0xabcdef] }, 3), '#abcdef');
  assert.equal(textColor(undefined, 1), '#2d2410');
});

test('nameSize shrinks long names, not below 60%', () => {
  assert.equal(nameSize('Maxim', 75, 438), 75);
  assert.ok(nameSize('Alexander-Arnold Junior', 75, 438) < 75);
  assert.equal(nameSize('x'.repeat(200), 75, 438), 45);
});

test('cardSvg: escapes the name, falls back to a shield without art', () => {
  const svg = cardSvg({ rating: 54, position: 'GK', name: 'A <b> & "c"', tier: 1, text: '#2d2410' }, {});
  assert.ok(svg.includes('A &lt;b&gt; &amp; &quot;c&quot;') && !svg.includes('<b>'));
  assert.ok(svg.includes('>54<') && svg.includes('>GK<'));
  assert.ok(svg.includes('<rect') && !svg.includes('<image'));
  const full = cardSvg({ rating: 80, position: 'RB', name: 'Rațiu', tier: 3, text: '#000000' }, { bg: png(576, 800), portrait: png(10, 10), flag: png(30, 20), league: png(20, 20), club: png(20, 20) });
  assert.equal(full.match(/<image /g)?.length, 5);
  assert.ok(!full.includes('<rect'));
});

test('cardFileName: stable per training, depends on the secret', () => {
  const k = { personaId: 1, slotId: 2736, level: 2 };
  assert.equal(cardFileName('s', k), cardFileName('s', k));
  assert.notEqual(cardFileName('s', k), cardFileName('t', k));
  assert.notEqual(cardFileName('s', k), cardFileName('s', { ...k, level: 1 }));
  assert.match(cardFileName('s', k), CARD_FILE);
  assert.doesNotMatch('../../etc/passwd', CARD_FILE);
});
