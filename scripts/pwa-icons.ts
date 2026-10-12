// Renders the maskable app icon (Android masks it into a circle / squircle) from the brand mark:
// the mark sits inside the 80 % safe zone on the app background. Run when the brand changes: npm run pwa:icons
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ROOT } from '../server/store.js';

const SIZE = 512;
const MARK = Math.round(SIZE * 0.6); // inside the 80 % safe circle with room to spare
const mark = await readFile(join(ROOT, 'web/public/brand/mark-fc.svg'), 'utf8');
const inner = Buffer.from(mark).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#0d1411"/>
  <image href="data:image/svg+xml;base64,${inner}" x="${(SIZE - MARK) / 2}" y="${(SIZE - MARK) / 2}" width="${MARK}" height="${MARK}"/>
</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
await writeFile(join(ROOT, 'web/public/icon-maskable-512.png'), png);
console.log(`icon-maskable-512.png (${Math.round(png.length / 1024)} KB)`);
