import { useState } from 'react';
import { Coins, UserCircle } from '@phosphor-icons/react';
import type { Meta, Player } from '../api';

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
}

export function Card({ player, meta, position, size = 'md', selected, onClick }: Props) {
  const art = cardArt(player, meta);
  const [bgOk, setBgOk] = useState(true);
  const offPos = position !== undefined && !player.possiblePositions.includes(position);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': !!selected } : {})}
      className={`card card-${size} tier-${player.tier}${bgOk ? '' : ' card-fallback'}${selected ? ' selected' : ''}`}
      style={{ color: art.text }}
      title={`${player.name} · ${player.possiblePositions.join(', ')}${player.untradeable ? ' · untradeable' : ' · tradeable'}`}
    >
      {art.bg && bgOk && <img className="card-bg" src={art.bg} alt="" onError={() => setBgOk(false)} />}
      <div className="card-rating">{player.rating}</div>
      <div className={`card-pos${offPos ? ' off' : ''}`}>{player.preferredPosition}</div>
      <img className="card-face" src={art.portrait} alt="" loading="lazy" />
      <div className="card-name">{player.name}</div>
      <div className="card-badges">
        <img src={art.flag} alt={meta.names.nation[player.nation] ?? ''} loading="lazy" />
        <img src={art.league} alt={meta.names.league[player.league] ?? ''} loading="lazy" />
        <img src={art.club} alt={meta.names.club[player.club] ?? ''} loading="lazy" />
      </div>
      {!player.untradeable && <Coins className="card-tradeable" weight="fill" aria-label="Tradeable" />}
    </Tag>
  );
}

export function EmptyCard({ size = 'md', loading = false }: { size?: 'md' | 'sm'; loading?: boolean }) {
  return (
    <div className={`card card-${size} card-empty${loading ? ' is-loading' : ''}`} aria-hidden="true">
      <UserCircle weight="duotone" />
    </div>
  );
}
