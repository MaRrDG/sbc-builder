// The FUT Gallery set catalogue: static, transcribed from fut.gg (scripts/gallery-catalogue.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../store.js';
import type { GallerySet } from './types.js';

let cached: GallerySet[] | null = null;

export function loadCatalogue(): GallerySet[] {
  cached ??= JSON.parse(readFileSync(join(ROOT, 'server/gallery/sets.json'), 'utf8')) as GallerySet[];
  return cached;
}
