import { useState } from 'react';
import { ArrowCounterClockwise, Check, Copy, Prohibit, X } from '@phosphor-icons/react';
import type { Meta, Player } from '../api';
import { Card } from './Card';

const OUTFIELD = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
const KEEPER = ['DIV', 'HAN', 'KIC', 'REF', 'SPE', 'POS'];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked: the name is still selectable */
        }
      }}
    >
      {done ? <Check weight="bold" /> : <Copy weight="bold" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Pips({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="pips" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}

interface Props {
  player: Player;
  meta: Meta;
  chem?: number;
  inSquad: 'XI' | 'Subs' | null;
  onExclude: () => void;
  onClose: () => void;
  /** Club view: already kept out, so the button lets it back in instead. */
  excluded?: boolean;
  excludeLabel?: string;
}

export function PlayerPanel({ player: p, meta, chem, inSquad, onExclude, onClose, excluded, excludeLabel = 'Keep out of SBCs and re-solve' }: Props) {
  const labels = p.preferredPosition === 'GK' ? KEEPER : OUTFIELD;
  const base = `${meta.contentBase}/items/images/mobile`;
  const facts: [string, string, string][] = [
    ['Nation', meta.names.nation[p.nation] ?? `#${p.nation}`, `${base}/flags/dark/${p.nation}.png`],
    ['League', meta.names.league[p.league] ?? `#${p.league}`, `${base}/leagues/dark/${p.league}.png`],
    ['Club', meta.names.club[p.club] ?? `#${p.club}`, `${base}/clubs/dark/${p.club}.png`],
  ];

  return (
    <section className="player-panel" aria-label={`${p.name} details`}>
      <header>
        <Card player={p} meta={meta} size="sm" />
        <div className="player-title">
          <h2>{p.name}</h2>
          {p.fullName && p.fullName !== p.name && <p className="muted">{p.fullName}</p>}
          <p className="player-tags">
            <span>{p.rarityName || (p.tier === 3 ? 'Gold' : p.tier === 2 ? 'Silver' : 'Bronze')}</span>
            <span>{p.untradeable ? 'Untradeable' : 'Tradeable'}</span>
            {inSquad && <span className="warn">Active squad {inSquad}</span>}
          </p>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label="Close player details">
          <X weight="bold" />
        </button>
      </header>

      <div className="names">
        <div>
          <span className="muted">Search name</span>
          <b>{p.name}</b>
          <CopyButton text={p.name} label="search name" />
        </div>
        {p.fullName && p.fullName !== p.name && (
          <div>
            <span className="muted">Full name</span>
            <b>{p.fullName}</b>
            <CopyButton text={p.fullName} label="full name" />
          </div>
        )}
      </div>

      {p.attributes.length === 6 && (
        <dl className="attrs">
          {labels.map((l, i) => (
            <div key={l}>
              <dt>{l}</dt>
              <dd className={p.attributes[i] >= 80 ? 'hi' : p.attributes[i] < 60 ? 'lo' : ''}>{p.attributes[i]}</dd>
            </div>
          ))}
        </dl>
      )}

      <dl className="facts">
        {facts.map(([k, v, img]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <img src={img} alt="" />
              {v}
            </dd>
          </div>
        ))}
        <div>
          <dt>Positions</dt>
          <dd>{p.possiblePositions.join(' · ')}</dd>
        </div>
        <div>
          <dt>Skill moves</dt>
          <dd><Pips value={p.skillMoves} /></dd>
        </div>
        <div>
          <dt>Weak foot</dt>
          <dd><Pips value={p.weakFoot} /></dd>
        </div>
        <div>
          <dt>Foot</dt>
          <dd>{p.foot}</dd>
        </div>
        {chem !== undefined && (
          <div>
            <dt>Chemistry here</dt>
            <dd>{chem} / 3</dd>
          </div>
        )}
      </dl>

      {excluded ? (
        <button type="button" className="ghost wide" onClick={onExclude}>
          <ArrowCounterClockwise weight="bold" /> Allow in SBCs again
        </button>
      ) : (
        <button type="button" className="ghost wide danger" onClick={onExclude}>
          <Prohibit weight="bold" /> {excludeLabel}
        </button>
      )}
    </section>
  );
}
