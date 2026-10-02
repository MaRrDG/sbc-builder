// Card images for evolution emails: EA card art (static CDN files, not the EA API) cached on disk,
// composed with server/evo-card-svg.ts and rendered to PNG by resvg. Rendered cards are served by
// GET /api/evos/card/:file.png and pruned after CARD_KEEP_DAYS.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { DATA_DIR } from './store.js';
import type { Meta } from './meta.js';
import { cardFileName, cardSvg, textColor, tierOf, type CardImages } from './evo-card-svg.js';

const ART_DIR = join(DATA_DIR, 'cache', 'card-art');
export const CARD_DIR = join(DATA_DIR, 'evo-cards');
const CARD_KEEP_DAYS = 30;
const OUT_W = 360; // shown at 180 px in the email: sharp on 2x screens
const FONTS = ['BarlowCondensed-Bold.ttf', 'BarlowCondensed-SemiBold.ttf'].map((f) => join(dirname(fileURLToPath(import.meta.url)), 'assets', f));

/** One EA image, from the disk cache or the CDN; null when EA has none (404) or the fetch fails. */
async function art(url: string): Promise<Buffer | null> {
  const file = join(ART_DIR, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.png`);
  try {
    return await readFile(file);
  } catch { /* not cached yet */ }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    await mkdir(ART_DIR, { recursive: true });
    await writeFile(file, b);
    return b;
  } catch {
    return null;
  }
}

/** The EA item fields a card needs (slot.player in an academy response). */
export interface CardItem { assetId?: number; rating?: number; rareflag?: number; preferredPosition?: string; nation?: number; leagueId?: number; teamid?: number }

/** Renders the card of `item` once per training level and returns its file name; null when the item is unusable. */
export async function renderEvoCard(item: CardItem | null, meta: Meta, key: { personaId: number; slotId: number; level: number }, secret: string): Promise<string | null> {
  if (!item || !Number.isInteger(item.assetId) || !Number.isInteger(item.rating)) return null;
  const name = cardFileName(secret, key);
  const out = join(CARD_DIR, `${name}.png`);
  try {
    await stat(out);
    return name; // a retry of the same training
  } catch { /* render it */ }
  const rating = item.rating as number;
  const rareflag = item.rareflag ?? 0;
  const tier = tierOf(rating);
  const rarity = meta.rarities[rareflag] ?? meta.rarities[0];
  const base = `${meta.contentBase}/items/images`;
  // same files as cardArt() in web/src/components/Card.tsx
  const [bg, portrait, flag, league, club] = await Promise.all([
    rarity ? art(`${base}/backgrounds/itemBGs/${rarity.guid}/cards_bg_e_1_${rareflag}_${rarity.levels ? tier : 0}.png`) : null,
    art(`${base}/mobile/portraits/${item.assetId}.png`),
    item.nation ? art(`${base}/mobile/flags/dark/${item.nation}.png`) : null,
    item.leagueId ? art(`${base}/mobile/leagues/dark/${item.leagueId}.png`) : null,
    item.teamid ? art(`${base}/mobile/clubs/dark/${item.teamid}.png`) : null,
  ]);
  const images: CardImages = { bg, portrait, flag, league, club };
  const svg = cardSvg(
    { rating, position: item.preferredPosition ?? '', name: meta.players[String(item.assetId)]?.name ?? '', tier, text: textColor(rarity, tier) },
    images,
  );
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OUT_W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();
  await mkdir(CARD_DIR, { recursive: true });
  await writeFile(out, png);
  return name;
}

/** Drops rendered cards older than CARD_KEEP_DAYS (an old email then shows its alt text). */
export async function pruneEvoCards(now = Date.now()): Promise<void> {
  let files: string[];
  try {
    files = await readdir(CARD_DIR);
  } catch {
    return;
  }
  for (const f of files) {
    const p = join(CARD_DIR, f);
    const s = await stat(p).catch(() => null);
    if (s && now - s.mtimeMs > CARD_KEEP_DAYS * 86400_000) await rm(p, { force: true });
  }
}
