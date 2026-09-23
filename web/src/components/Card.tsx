import { memo, useState } from 'react';
import { Coins, LockSimple, UserCircle } from '@phosphor-icons/react';
import type { BrickInfo, Meta, Player } from '../api';
import { useI18n } from '../i18n';

const hex = (n: number | undefined) => (n === undefined ? undefined : `#${n.toString(16).padStart(6, '0')}`);

export function cardArt(p: Player, meta: Meta) {
  const base = `${meta.contentBase}/items/images`;
  const rarity = meta.rarities[p.rareflag] ?? meta.rarities[0];
  const level = rarity?.levels ? p.tier : 0;
  return {
    bg: rarity ? `${base}/backgrounds/itemBGs/${rarity.guid}/cards_bg_e_1_${p.rareflag}_${level}.png` : undefined,
    portrait: `${base}/mobile/portraits/${p.assetId}.png`,
    flag: `${base}/mobile/flags/dark/${p.nation}.png`,
    league: `${base}/mobile/leagues/dark/${p.league}.png`,
    club: `${base}/mobile/clubs/dark/${p.club}.png`,
    // levelled rarities pack 3 colours per tier (bronze, silver, gold); text is the first
    text: hex(rarity ? rarity.colors[rarity.levels ? (p.tier - 1) * 3 : 0] : undefined) ?? '#2d2410',
  };
}

interface Props {
  player: Player;
  meta: Meta;
  position?: string;
  size?: 'md' | 'sm';
  selected?: boolean;
  onClick?: () => void;
  /** Above-the-fold usage (e.g. the landing hero): loads art eagerly instead of lazily. */
  eager?: boolean;
}

export const Card = memo(function Card({ player, meta, position, size = 'md', selected, onClick, eager = false }: Props) {
  const { t } = useI18n();
  const art = cardArt(player, meta);
  const [bgOk, setBgOk] = useState(true);
  const offPos = position !== undefined && !player.possiblePositions.includes(position);
  const Tag = onClick ? 'button' : 'div';
  const loading = eager ? 'eager' : 'lazy';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': !!selected } : {})}
      className={`card card-${size} tier-${player.tier}${bgOk ? '' : ' card-fallback'}${selected ? ' selected' : ''}`}
      style={{ color: art.text }}
      title={`${player.name} · ${player.possiblePositions.join(', ')} · ${player.untradeable ? t('card.untradeable') : t('card.tradeable')}`}
    >
      {art.bg && bgOk && <img className="card-bg" src={art.bg} alt="" loading={loading} decoding="async" onError={() => setBgOk(false)} />}
      <div className="card-rating">{player.rating}</div>
      <div className={`card-pos${offPos ? ' off' : ''}`}>{player.preferredPosition}</div>
      <img className="card-face" src={art.portrait} alt="" loading={loading} decoding="async" />
      <div className="card-name">{player.name}</div>
      <div className="card-badges">
        <img src={art.flag} alt={meta.names.nation[player.nation] ?? ''} loading={loading} />
        <img src={art.league} alt={meta.names.league[player.league] ?? ''} loading={loading} />
        <img src={art.club} alt={meta.names.club[player.club] ?? ''} loading={loading} />
      </div>
      {!player.untradeable && <Coins className="card-tradeable" weight="fill" aria-label={t('card.tradeableIcon')} />}
    </Tag>
  );
});

/** A slot EA locked in this SBC. Custom bricks show the club / league / nation they stand for. */
export function BrickCard({ brick, meta, size = 'md' }: { brick: BrickInfo; meta: Meta; size?: 'md' | 'sm' }) {
  const { t } = useI18n();
  const base = `${meta.contentBase}/items/images/mobile`;
  const label = brick.custom
    ? t('card.brickCustom', {
        what: [meta.names.club[brick.club], meta.names.league[brick.league], meta.names.nation[brick.nation]].filter(Boolean).join(', '),
      })
    : t('card.brickPlain');
  return (
    <div className={`card card-${size} card-empty card-brick`} role="img" aria-label={label} title={label}>
      <LockSimple className="brick-lock" weight="fill" aria-hidden="true" />
      {brick.custom && (
        <div className="brick-badges">
          {brick.club > 0 && <img src={`${base}/clubs/dark/${brick.club}.png`} alt="" />}
          {brick.league > 0 && <img src={`${base}/leagues/dark/${brick.league}.png`} alt="" />}
          {brick.nation > 0 && <img src={`${base}/flags/dark/${brick.nation}.png`} alt="" />}
        </div>
      )}
    </div>
  );
}

export function EmptyCard({ size = 'md', loading = false }: { size?: 'md' | 'sm'; loading?: boolean }) {
  return (
    <div className={`card card-${size} card-empty${loading ? ' is-loading' : ''}`} aria-hidden="true">
      <UserCircle weight="duotone" />
    </div>
  );
}
