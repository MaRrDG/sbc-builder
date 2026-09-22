import { useState } from 'react';
import { ArrowCounterClockwise, Check, Copy, Prohibit, X } from '@phosphor-icons/react';
import type { Meta, Player } from '../api';
import { Card } from './Card';
import { useI18n } from '../i18n';

const OUTFIELD = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
const KEEPER = ['DIV', 'HAN', 'KIC', 'REF', 'SPE', 'POS'];

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={t('player.copyWhat', { what: label })}
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
      {done ? t('player.copied') : t('player.copy')}
    </button>
  );
}

function Pips({ value, max = 5 }: { value: number; max?: number }) {
  const { t } = useI18n();
  return (
    <span className="pips" aria-label={t('player.pips', { value, max })}>
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

export function PlayerPanel({ player: p, meta, chem, inSquad, onExclude, onClose, excluded, excludeLabel }: Props) {
  const { t } = useI18n();
  const labels = p.preferredPosition === 'GK' ? KEEPER : OUTFIELD;
  const base = `${meta.contentBase}/items/images/mobile`;
  const facts: [string, string, string][] = [
    [t('player.nation'), meta.names.nation[p.nation] ?? `#${p.nation}`, `${base}/flags/dark/${p.nation}.png`],
    [t('player.league'), meta.names.league[p.league] ?? `#${p.league}`, `${base}/leagues/dark/${p.league}.png`],
    [t('player.club'), meta.names.club[p.club] ?? `#${p.club}`, `${base}/clubs/dark/${p.club}.png`],
  ];

  return (
    <section className="player-panel" aria-label={t('player.details', { name: p.name })}>
      <header>
        <Card player={p} meta={meta} size="sm" />
        <div className="player-title">
          <h2>{p.name}</h2>
          {p.fullName && p.fullName !== p.name && <p className="muted">{p.fullName}</p>}
          <p className="player-tags">
            <span>{p.rarityName || (p.tier === 3 ? t('player.gold') : p.tier === 2 ? t('player.silver') : t('player.bronze'))}</span>
            <span>{p.untradeable ? t('player.untradeable') : t('player.tradeable')}</span>
            {inSquad && <span className="warn">{t('player.activeSquad', { role: inSquad === 'XI' ? t('player.roleXI') : t('player.roleSubs') })}</span>}
          </p>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t('player.close')}>
          <X weight="bold" />
        </button>
      </header>

      <div className="names">
        <div>
          <span className="muted">{t('player.searchName')}</span>
          <b>{p.name}</b>
          <CopyButton text={p.name} label={t('player.searchNameLc')} />
        </div>
        {p.fullName && p.fullName !== p.name && (
          <div>
            <span className="muted">{t('player.fullName')}</span>
            <b>{p.fullName}</b>
            <CopyButton text={p.fullName} label={t('player.fullNameLc')} />
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
          <dt>{t('player.positions')}</dt>
          <dd>{p.possiblePositions.join(' · ')}</dd>
        </div>
        <div>
          <dt>{t('player.skillMoves')}</dt>
          <dd><Pips value={p.skillMoves} /></dd>
        </div>
        <div>
          <dt>{t('player.weakFoot')}</dt>
          <dd><Pips value={p.weakFoot} /></dd>
        </div>
        <div>
          <dt>{t('player.foot')}</dt>
          <dd>{p.foot === 'Left' ? t('player.footLeft') : t('player.footRight')}</dd>
        </div>
        {chem !== undefined && (
          <div>
            <dt>{t('player.chemHere')}</dt>
            <dd>{chem} / 3</dd>
          </div>
        )}
      </dl>

      {excluded ? (
        <button type="button" className="ghost wide" onClick={onExclude}>
          <ArrowCounterClockwise weight="bold" /> {t('player.allowAgain')}
        </button>
      ) : (
        <button type="button" className="ghost wide danger" onClick={onExclude}>
          <Prohibit weight="bold" /> {excludeLabel ?? t('player.keepOutResolve')}
        </button>
      )}
    </section>
  );
}
