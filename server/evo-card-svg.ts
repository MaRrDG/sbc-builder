// Pure: one player card as SVG for evolution emails, laid out like web/src/components/Card.tsx (.card-* in styles.css).
// Images come in as PNG bytes (server/evo-card.ts fetches them); a missing one is left out, a missing background
// draws the same plain shield as .card-fallback.
import { createHmac } from 'node:crypto';

export const CARD_W = 576; // EA card art is 576 x 800
export const CARD_H = 800;

export interface CardFace {
  rating: number;
  position: string;
  name: string;
  tier: 1 | 2 | 3;
  text: string; // #rrggbb, from the rarity colours like cardArt()
}
export interface CardImages { bg?: Buffer | null; portrait?: Buffer | null; flag?: Buffer | null; league?: Buffer | null; club?: Buffer | null }

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);
const uri = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;

/** Width x height from a PNG header; null when the bytes are not a PNG. */
export function pngSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Same tiers as toPlayer() in server/squad.ts. */
export const tierOf = (rating: number): 1 | 2 | 3 => (rating <= 64 ? 1 : rating <= 74 ? 2 : 3);

/** Text colour like cardArt(): levelled rarities pack 3 colours per tier, text is the first. */
export function textColor(rarity: { levels: boolean; colors: number[] } | undefined, tier: number): string {
  const n = rarity ? rarity.colors[rarity.levels ? (tier - 1) * 3 : 0] : undefined;
  return n === undefined ? '#2d2410' : `#${n.toString(16).padStart(6, '0')}`;
}

/** Fits a long name into the name box the way the narrow condensed face allows (~0.5 em per glyph). */
export function nameSize(name: string, base: number, box: number): number {
  const est = name.length * base * 0.5;
  return est <= box ? base : Math.max(base * 0.6, Math.floor((base * box) / est));
}

const FALLBACK: Record<1 | 2 | 3, string> = { 1: '#a8774a', 2: '#c5c9cf', 3: '#e3c25c' };

export function cardSvg(face: CardFace, img: CardImages): string {
  const W = CARD_W, H = CARD_H;
  const parts: string[] = [];
  if (img.bg) parts.push(`<image href="${uri(img.bg)}" x="0" y="0" width="${W}" height="${H}"/>`);
  else {
    // .card-fallback::before: inset 12% 9% 7%, rounded shield
    const x = W * 0.09, y = H * 0.12, w = W * 0.82, h = H * 0.81;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.18}" fill="${FALLBACK[face.tier]}"/>`);
  }
  if (img.portrait) {
    // .card-face: top 15%, right 9%, width 60%, square, contain, bottom aligned
    const s = W * 0.6;
    parts.push(`<image href="${uri(img.portrait)}" x="${W - W * 0.09 - s}" y="${H * 0.15}" width="${s}" height="${s}" preserveAspectRatio="xMidYMax meet"/>`);
  }
  const fill = esc(face.text);
  // line-height 1 boxes in CSS: the baseline sits ~0.84 em under the box top for Barlow Condensed
  const rs = W * 0.25, ps = W * 0.12, ns = W * 0.13;
  parts.push(`<text x="${W * 0.17}" y="${H * 0.19 + rs * 0.84}" font-size="${rs}" font-weight="700" fill="${fill}">${face.rating}</text>`);
  parts.push(`<text x="${W * 0.185}" y="${H * 0.4 + ps * 0.84}" font-size="${ps}" font-weight="600" fill="${fill}">${esc(face.position)}</text>`);
  const box = W * 0.76;
  const size = nameSize(face.name, ns, box);
  parts.push(`<text x="${W / 2}" y="${H * 0.645 + ns * 0.84}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${fill}">${esc(face.name)}</text>`);

  // .card-badges: row at top 77%, 9% high, centred, gap 5%, each at most 22% wide; the flag is 72% high
  const rowH = H * 0.09, gap = W * 0.05, maxW = W * 0.22;
  const badges = [img.flag, img.league, img.club]
    .map((b, i) => {
      if (!b) return null;
      const sz = pngSize(b);
      const h = rowH * (i === 0 ? 0.72 : 1);
      if (!sz || !sz.h) return { b, w: Math.min(h, maxW), h };
      const w = Math.min(maxW, (h * sz.w) / sz.h);
      return { b, w, h: (w * sz.h) / sz.w };
    })
    .filter((x): x is { b: Buffer; w: number; h: number } => !!x);
  let x = (W - (badges.reduce((s, b) => s + b.w, 0) + gap * Math.max(0, badges.length - 1))) / 2;
  for (const b of badges) {
    parts.push(`<image href="${uri(b.b)}" x="${x}" y="${H * 0.77 + (rowH - b.h) / 2}" width="${b.w}" height="${b.h}"/>`);
    x += b.w + gap;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Barlow Condensed">${parts.join('')}</svg>`;
}

/** Unguessable file name for a rendered card (the image URL is public, the training behind it is not). */
export function cardFileName(secret: string, key: { personaId: number; slotId: number; level: number }): string {
  return createHmac('sha256', secret).update(`evo-card:${key.personaId}:${key.slotId}:${key.level}`).digest('hex').slice(0, 32);
}
export const CARD_FILE = /^[a-f0-9]{32}$/;
