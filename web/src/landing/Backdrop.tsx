// Decorative page background: EA-style angular shapes and a few big blurred club cards behind the
// sections. Each zone is a full-bleed layer stack (landing.css "backdrop") that reaches past its
// section's edges, so the shapes run on across the seams. No text, no events, hidden from AT.
import type { CSSProperties } from 'react';
import { Card } from '../components/Card';
import { DEMO_META, DEMO_SQUAD } from './demo';

export type Zone = 'hero' | 'club' | 'optimal' | 'how' | 'pricing' | 'end';

/** A blurred card: squad index, width (px), rotation, blur (px), position in the zone.
 *  `wide`: left out under 860px (phones keep one or two per zone). */
interface Ghost {
  i: number;
  w: number;
  r: number;
  b: number;
  at: CSSProperties;
  wide?: boolean;
}

/** Layers from far to near: nearer layers move more with the scroll (parallax) and blur less. */
interface Layer {
  depth: 'far' | 'mid' | 'near';
  shards?: string[];
  ghosts?: Ghost[];
}

const ZONES: Record<Zone, Layer[]> = {
  hero: [
    { depth: 'far', shards: ['s1', 's3'] },
    { depth: 'near', shards: ['s2', 's4', 'edge', 'edge e2'] },
  ],
  club: [
    { depth: 'far', ghosts: [{ i: 5, w: 190, r: -12, b: 14, at: { left: '-3%', top: '4%' } }] },
    { depth: 'mid', ghosts: [{ i: 6, w: 220, r: 14, b: 11, at: { right: '-7%', top: '-16%' } }] },
    { depth: 'near', ghosts: [{ i: 0, w: 150, r: 8, b: 7, at: { left: '34%', bottom: '-30%' }, wide: true }] },
  ],
  optimal: [
    { depth: 'far', shards: ['s1', 's3'] },
    { depth: 'near', shards: ['s2', 'edge'] },
  ],
  how: [
    { depth: 'far', shards: ['s1', 's3'] },
    { depth: 'mid', shards: ['s2', 'edge'] },
  ],
  pricing: [
    { depth: 'far', ghosts: [{ i: 3, w: 170, r: -8, b: 13, at: { right: '-3%', top: '46%' } }] },
    {
      depth: 'mid',
      ghosts: [
        // inside the empty columns 9-12, next to the plans
        { i: 1, w: 200, r: 10, b: 10, at: { right: 'max(9%, calc((100% - var(--lp-max)) / 2 + 60px))', top: '8%' }, wide: true },
        { i: 4, w: 150, r: -14, b: 12, at: { left: '-5%', bottom: '-4%' }, wide: true },
      ],
    },
  ],
  end: [{ depth: 'far', shards: ['s1', 'edge'] }],
};

export function Backdrop({ zone }: { zone: Zone }) {
  return (
    <div className={`lp-bg lp-bg-${zone}`} aria-hidden="true">
      {ZONES[zone].map((layer, n) => (
        <div key={n} className={`lp-layer lp-${layer.depth}`}>
          {layer.shards?.map((s) => <i key={s} className={`lp-shard ${s}`} />)}
          {layer.ghosts?.map((g) => (
            <div
              key={g.i}
              className={`lp-ghost${g.wide ? ' lp-ghost-wide' : ''}`}
              style={{ ...g.at, rotate: `${g.r}deg`, '--gw': g.w, '--b': `${g.b}px` } as CSSProperties}
            >
              <Card player={DEMO_SQUAD[g.i]} meta={DEMO_META} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
