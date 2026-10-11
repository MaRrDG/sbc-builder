// The guess grid: one row of 7 compared tiles per guess, then dashed empty rows up to the limit,
// and under it the legend of when a tile turns amber (≈), mirroring server/daily/compare.ts.
// State is shown by colour, a glyph (✓ ≈ ✕) and screen-reader text, never by colour alone.
import {
  ArrowDown, ArrowUp, Cards, Crosshair, Flag, GenderFemale, GenderIntersex, GenderMale, Shield, Star, Trophy, type Icon,
} from '@phosphor-icons/react';
import { useId, type CSSProperties } from 'react';
import type { DailyRow, DailyTile, Meta } from '../api';
import { useI18n } from '../i18n';

export const COLS = ['nation', 'league', 'club', 'position', 'rating', 'cardType', 'gender'] as const;
type Col = (typeof COLS)[number];

const ICON: Record<Col, Icon> = {
  nation: Flag, league: Trophy, club: Shield, position: Crosshair, rating: Star, cardType: Cards, gender: GenderIntersex,
};
export const GLYPH = { hit: '✓', near: '≈', miss: '✕' } as const;

function TileValue({ col, row, meta }: { col: Col; row: DailyRow; meta: Meta | null }) {
  const { t } = useI18n();
  const p = row.player;
  const img = (kind: 'flags' | 'leagues' | 'clubs', id: number, name: string | undefined) =>
    meta ? <img src={`${meta.contentBase}/items/images/mobile/${kind}/dark/${id}.png`} alt={name ?? ''} decoding="async" /> : <span>{name ?? id}</span>;
  switch (col) {
    case 'nation':
      return img('flags', p.nation, meta?.names.nation[p.nation]);
    case 'league':
      return img('leagues', p.league, meta?.names.league[p.league]);
    case 'club':
      return img('clubs', p.club, meta?.names.club[p.club]);
    case 'position':
      return <span className="dg-val">{p.position}</span>;
    case 'rating':
      return <span className="dg-val">{p.rating}</span>;
    case 'cardType':
      return <span className="dg-val dg-val-sm">{t(`daily.card.${p.cardType}`)}</span>;
    case 'gender': {
      const G = p.gender === 1 ? GenderFemale : GenderMale;
      return (
        <span className="dg-val dg-val-icon">
          <G weight="bold" aria-hidden="true" />
          <span className="sr-only">{p.gender === 1 ? t('daily.gender.f') : t('daily.gender.m')}</span>
        </span>
      );
    }
  }
}

function Tile({ col, row, tile, i, meta }: { col: Col; row: DailyRow; tile: DailyTile; i: number; meta: Meta | null }) {
  const { t } = useI18n();
  const Dir = tile.dir === 'up' ? ArrowUp : tile.dir === 'down' ? ArrowDown : null;
  return (
    <div role="cell" className={`dg-tile is-${tile.state}`} style={{ '--i': i } as CSSProperties}>
      <span className="sr-only">{t(`daily.col.${col}`)}: </span>
      <span className="dg-tile-v">
        <TileValue col={col} row={row} meta={meta} />
        {Dir && <Dir className="dg-dir" weight="bold" aria-hidden="true" />}
      </span>
      <span className="dg-strip-s" aria-hidden="true">
        {GLYPH[tile.state]}
      </span>
      <span className="sr-only">
        , {t(`daily.state.${tile.state}`)}
        {tile.dir ? `, ${t(`daily.dir.${tile.dir}`)}` : ''}
      </span>
    </div>
  );
}

interface Props {
  rows: DailyRow[];
  max: number;
  /** index of the row that just came in: only that one flips in */
  fresh: number | null;
  meta: Meta | null;
}

export function Grid({ rows, max, fresh, meta }: Props) {
  const { t } = useI18n();
  const empty = Math.max(0, max - rows.length);
  return (
    <div className="dg-grid" role="table" aria-label={t('daily.search.label')}>
      <div role="rowgroup">
        <div role="row" className="dg-head">
          <span role="columnheader" className="sr-only">
            {t('daily.card.normal')}
          </span>
          {COLS.map((c) => {
            const I = ICON[c];
            return (
              <span role="columnheader" key={c} className="dg-head-c">
                <I aria-hidden="true" weight="bold" />
                <span className="dg-head-l">{t(`daily.col.${c}`)}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((r, i) => (
          <div role="row" key={`${i}-${r.player.id}`} className={`dg-row${i === fresh ? ' fresh' : ''}`}>
            <span role="rowheader" className="dg-name">
              <span className="dg-name-n">{r.player.name}</span>
              <span className="dg-chip" aria-hidden="true">
                <b>{r.player.rating}</b> {r.player.position}
              </span>
            </span>
            {COLS.map((c, k) =>
              // a row saved in this browser before a column existed has no tile for it: leave the cell blank
              r.tiles[c] ? (
                <Tile key={c} col={c} row={r} tile={r.tiles[c]} i={k} meta={meta} />
              ) : (
                <div key={c} role="cell" className="dg-tile is-empty" />
              ),
            )}
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} className="dg-row empty" aria-hidden="true">
            {COLS.map((c) => (
              <div key={c} className="dg-tile is-empty" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Always-visible legend: which columns can turn amber (≈) and when (server/daily/compare.ts + regions.ts). */
export function NearLegend() {
  const { t } = useI18n();
  const id = useId();
  const near: Col[] = ['nation', 'league', 'position', 'rating'];
  const never: Col[] = ['club', 'cardType', 'gender'];
  return (
    <section className="dg-legend" aria-labelledby={id}>
      <h3 id={id} className="dg-legend-h">
        <span className="dg-sample is-near" aria-hidden="true">
          {GLYPH.near}
        </span>
        {t('daily.near.title')}
      </h3>
      <ul className="dg-legend-l">
        {near.map((c) => {
          const I = ICON[c];
          return (
            <li key={c}>
              <span className="dg-legend-i" aria-hidden="true">
                <I weight="bold" />
              </span>
              <span>
                <b>{t(`daily.col.${c}`)}:</b> {t(`daily.near.${c}`)}
              </span>
            </li>
          );
        })}
        <li className="is-never">
          <span className="dg-legend-i" aria-hidden="true">
            {never.map((c) => {
              const I = ICON[c];
              return <I key={c} weight="bold" />;
            })}
          </span>
          <span>
            <b>{never.map((c) => t(`daily.col.${c}`)).join(', ')}:</b> {t('daily.near.never')}
          </span>
        </li>
      </ul>
    </section>
  );
}
