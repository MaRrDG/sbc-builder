// Re-renders the Discord emoji / avatar PNGs from the brand SVGs (web/public/brand). Run only when the brand changes:
// it overwrites discord/assets/{avatar-check,avatar-fc,avatar-fc-lime}.png. banner.png is art, not rendered here.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ROOT } from '../server/store.js';

const MAP = [
  ['icon-green.svg', 'avatar-check.png'],
  ['mark-fc.svg', 'avatar-fc.png'],
  ['icon-lime.svg', 'avatar-fc-lime.png'],
];
for (const [svg, png] of MAP) {
  const src = await readFile(join(ROOT, 'web/public/brand', svg), 'utf8');
  const out = new Resvg(src, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
  await writeFile(join(ROOT, 'discord/assets', png), out);
  console.log(`${svg} → discord/assets/${png} (${Math.round(out.length / 1024)} KB)`);
}
