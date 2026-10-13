// My Squads (Premium): the user's saved FUT squads with the value of each (EA's market average, "AVG"),
// and one squad on the pitch with the AVG under every card. Read from the cache only.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowsClockwise, Calculator, Coins, HourglassMedium, Info, Star } from '@phosphor-icons/react';
import { api, ApiError, type Meta, type Player, type SquadDetailResponse, type SquadPreviewSlot, type SquadRow, type SquadSlotView, type SquadsResponse, type SquadValue } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { Card, cardFace, EmptyCard } from '../Card';
import { layout } from '../Pitch';
import { formationLabel } from '../objectives/objectives';
import { compactCoins, splitSlots } from './squads';
import { WebAppHint } from '../WebAppHint';

const POSITION_NAMES = ['GK', 'SW', 'RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB', 'RDM', 'CDM', 'LDM', 'RM', 'RCM', 'CM', 'LCM', 'LM', 'RAM', 'CAM', 'LAM', 'RF', 'CF', 'LF', 'RW', 'RS', 'ST', 'LS', 'LW'];

interface Props {
  meta: Meta;
  personaId: number;
  squadId: number | null;
  onOpen: (id: number | null) => void;
  onError: (e: unknown) => void;
  /** bumped when the account data changed (a sync, a web app edit) */
  reload: number;
}

/** Shared load pattern: in-place error with "Try again", persona errors go to App, a failed refetch keeps what is shown. */
function useLoad<T>(load: (() => Promise<T>) | null, deps: unknown[], onError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const has = useRef(false);
  has.current = data !== null;
  useEffect(() => {
    if (!load) return;
    let alive = true;
    setError(null);
    load().then(
      (d) => alive && setData(d),
      (e) => {
        if (!alive) return;
        if (e instanceof ApiError && (e.code === 'personaNotYours' || e.code === 'personaTakenOver' || e.code === 'premiumOnly')) onErrorRef.current(e);
        if (!has.current) setError(e);
      },
    );
    return () => {
      alive = false;
    };
  }, [...deps, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, error, retry: () => setTries((n) => n + 1) };
}

export function SquadsView({ meta, personaId, squadId, onOpen, onError, reload }: Props) {
  const list = useLoad(squadId === null ? () => api.squads() : null, [personaId, reload, squadId === null], onError);
  const [asking, setAsking] = useState(false);
  const [calcError, setCalcError] = useState<unknown>(null);
  const busy = asking || !!list.data?.calculating;
  // while the web app tab reads the squads, look again every few seconds until the job is done
  useEffect(() => {
    if (!list.data?.calculating || squadId !== null) return;
    const timer = window.setTimeout(list.retry, 4000);
    return () => window.clearTimeout(timer);
  }, [list.data, squadId]); // eslint-disable-line react-hooks/exhaustive-deps
  const calculate = () => {
    setAsking(true);
    setCalcError(null);
    api.squadsCalculate().then(
      () => {
        setAsking(false);
        list.retry();
      },
      (e) => {
        setAsking(false);
        setCalcError(e);
      },
    );
  };
  if (squadId !== null) return <SquadScreen key={squadId} meta={meta} id={squadId} reload={reload} onBack={() => onOpen(null)} onError={onError} />;
  return <SquadList data={list.data} meta={meta} error={list.error} retry={list.retry} onOpen={onOpen} calc={{ busy, error: calcError, run: calculate }} />;
}

/** "Calculate": the web app tab reads the squad list and every saved squad, only when the user asks. */
function CalcBar({ busy, error, run, missing }: { busy: boolean; error: unknown; run: () => void; missing: boolean }) {
  const { t } = useI18n();
  return (
    <div className="squads-calc">
      <button type="button" className="solve-sm" disabled={busy} onClick={run}>
        {busy ? <ArrowsClockwise weight="bold" className="spin" aria-hidden="true" /> : <Calculator weight="bold" aria-hidden="true" />}
        <span>{busy ? t('squads.calculating') : t('squads.calculate')}</span>
      </button>
      {!busy && error === null && missing ? (
        <WebAppHint>{t('squads.calculateHint')}</WebAppHint>
      ) : (
        <p className="muted" role="status">
          {error !== null ? <span className="squads-calc-error">{errorText(error, t)}</span> : busy ? t('squads.calculatingHint') : t('squads.recalculateHint')}
        </p>
      )}
    </div>
  );
}

function Retry({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="gallery-error" role="alert">
      <p className="muted">{errorText(error, t)}</p>
      <button type="button" className="ghost" onClick={retry}>
        <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('auth.retry')}
      </button>
    </div>
  );
}

/** Coin + number, EA's "AVG" style. */
export function CoinValue({ value, compact = false }: { value: number; compact?: boolean }) {
  const { lang } = useI18n();
  return (
    <span className="coin-value">
      <Coins weight="fill" aria-hidden="true" />
      {compact ? compactCoins(value, lang) : value.toLocaleString(lang)}
    </span>
  );
}

function ValueNotes({ value }: { value: SquadValue }) {
  const { t } = useI18n();
  if (!value.unknown && !value.loans) return null;
  return (
    <span className="squad-notes">
      {value.unknown > 0 && <span>{t('squads.unknown', { count: value.unknown })}</span>}
      {value.loans > 0 && <span>{t('squads.loans', { count: value.loans })}</span>}
    </span>
  );
}

export function SquadList({ data, meta, error, retry, onOpen, head = true, calc }: {
  data: SquadsResponse | null; meta: Meta; error: unknown; retry: () => void; onOpen: (id: number) => void; head?: boolean;
  calc?: { busy: boolean; error: unknown; run: () => void };
}) {
  const { t } = useI18n();
  const ago = useAgo();
  return (
    <section className="squads-view">
      {head && (
        <header className="page-head">
          <div>
            <h1>{t('squads.title')}</h1>
            <p className="muted">{t('squads.lede')}</p>
          </div>
        </header>
      )}
      {calc && data && <CalcBar {...calc} missing={!data.squads.length || data.squads.some((s) => !s.loaded)} />}
      {!data && error !== null ? (
        <Retry error={error} retry={retry} />
      ) : !data ? (
        <p className="muted" role="status">{t('admin.loading')}</p>
      ) : data.squads.length === 0 ? (
        <WebAppHint>{t('squads.empty')}</WebAppHint>
      ) : (
        <>
          <p className="squads-when muted">
            <Info weight="bold" aria-hidden="true" /> {t('squads.pricesAt', { when: ago(data.pricesAt) })}
          </p>
          <ul className="squads-grid">
            {data.squads.map((s) => (
              <li key={s.id}>
                <SquadTile squad={s} meta={meta} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** One saved squad as a tile: its starters on a small pitch (real formation), the value under it. */
function SquadTile({ squad: s, meta, onOpen }: { squad: SquadRow; meta: Meta; onOpen: (id: number) => void }) {
  const { t, lang } = useI18n();
  // no formation known (an old active-squad cache): the starters still show, on a plain 4-3-3
  const positions = (s.formation && meta.formations[s.formation]) || (s.preview.length ? meta.formations.f433 : undefined) || [];
  const { pos } = layout(positions.map((p) => p.uniqueId));
  const byIndex = new Map(s.preview.map((p) => [p.index, p]));
  const share = s.value.total ? Math.round((s.value.starters / s.value.total) * 100) : 50;
  return (
    <button type="button" className={`squad-tile${s.active ? ' is-active' : ''}${s.loaded ? '' : ' is-unloaded'}`} onClick={() => onOpen(s.id)}>
      <span className="squad-tile-pitch" aria-hidden="true">
        {positions.map((p, i) => {
          const c = byIndex.get(i);
          return (
            // squeezed up a little so the keeper clears the name under the pitch
            <span key={i} className="mini-slot" style={{ left: `${pos[i].x}%`, top: `${2 + pos[i].y * 0.82}%` }}>
              {c ? <MiniCard card={c} meta={meta} /> : <span className="mini-card mini-empty" />}
            </span>
          );
        })}
        <span className="squad-tile-fade" />
      </span>
      <span className="squad-tile-tags">
        {s.active && <span className="squad-tile-pill is-active">{t('squads.active')}</span>}
        {s.formation && <span className="squad-tile-pill">{formationLabel(s.formation)}</span>}
      </span>
      <span className="squad-tile-info">
        <span className="squad-tile-head">
          <strong>{s.name || t('squads.unnamed')}</strong>
          <span className="squad-tile-stats">
            {s.rating !== null && (
              <span>
                <Star weight="fill" aria-hidden="true" /> {s.rating}
              </span>
            )}
            {s.chemistry !== null && <span>{t('squads.chemShort', { chem: s.chemistry })}</span>}
          </span>
        </span>
        {s.loaded ? (
          <>
            <span className="squad-tile-value">
              <CoinValue value={s.value.total} />
            </span>
            <span className="squad-tile-split" style={{ ['--share' as string]: `${share}%` }} aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="squad-tile-legend">
              <span><i className="is-starters" />{t('squads.starters')} {s.value.starters.toLocaleString(lang)}</span>
              <span><i className="is-bench" />{t('squads.bench')} {s.value.bench.toLocaleString(lang)}</span>
            </span>
            <ValueNotes value={s.value} />
          </>
        ) : (
          <span className="squad-tile-unloaded">{t('squads.notLoaded')}</span>
        )}
      </span>
    </button>
  );
}

/** A small card for the tile's pitch: EA card art, face, rating and position. */
function MiniCard({ card, meta }: { card: SquadPreviewSlot; meta: Meta }) {
  const face = cardFace(card, meta);
  const [bgOk, setBgOk] = useState(true);
  return (
    <>
      <span className={`mini-card${bgOk && face.bg ? '' : ' mini-fallback'}`}>
        {face.bg && bgOk && <img className="mini-bg" src={face.bg} alt="" loading="lazy" decoding="async" onError={() => setBgOk(false)} />}
        <img className="mini-face" src={face.portrait} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="mini-label">
        <b>{card.rating}</b> {card.position}
      </span>
    </>
  );
}

function SlotCard({ slot, meta, position, size = 'md' }: { slot: SquadSlotView | undefined; meta: Meta; position?: string; size?: 'md' | 'sm' }) {
  const { t } = useI18n();
  const p: Player | null = slot?.player ?? null;
  return (
    <>
      {slot?.loan && (
        <span className="slot-loan" title={t('squads.loanTitle')}>
          <HourglassMedium weight="bold" aria-hidden="true" />
          <span className="slot-loan-full">{t('pitch.loan')}</span>
        </span>
      )}
      {p ? <Card player={p} meta={meta} position={position} size={size} /> : <EmptyCard size={size} />}
      {slot && (
        <span className="card-avg" title={t('squads.avgTitle')}>
          <span className="card-avg-label">{t('squads.avg')}</span>
          {slot.loan ? <span>{t('pitch.loan')}</span> : slot.value === null ? <span>{t('squads.noPrice')}</span> : <CoinValue value={slot.value} compact />}
        </span>
      )}
    </>
  );
}

function SquadScreen({ meta, id, reload, onBack, onError }: { meta: Meta; id: number; reload: number; onBack: () => void; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const ago = useAgo();
  const { data, error, retry } = useLoad(() => api.squad(id), [id, reload], onError);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);
  const back = (
    <button type="button" className="back" onClick={onBack}>
      <ArrowLeft weight="bold" aria-hidden="true" /> {t('squads.back')}
    </button>
  );
  if (!data) return <section className="squads-view">{back}{error !== null ? <Retry error={error} retry={retry} /> : <p className="muted" role="status">{t('admin.loading')}</p>}</section>;

  const positions = (data.formation && meta.formations[data.formation]) || [];
  const { pos, lines } = layout(positions.map((p) => p.uniqueId));
  const { starters, bench } = splitSlots(data.slots);
  const byIndex = new Map(starters.map((s) => [s.index, s]));
  return (
    <section className="squads-view squad-screen">
      {back}
      <header className="page-head">
        <div>
          <h1>
            {data.name || t('squads.unnamed')} {data.active && <span className="squad-active">{t('squads.active')}</span>}
          </h1>
          <p className="muted">
            {data.formation ? `${formationLabel(data.formation)} · ` : ''}
            {t('squads.pricesAt', { when: ago(data.pricesAt) })}
          </p>
        </div>
      </header>
      {!data.loaded ? (
        <WebAppHint>{t('squads.notLoadedDetail')}</WebAppHint>
      ) : (
        <div className="squad-body">
          <dl className="obj-stats squad-stats">
            <div className="squad-total">
              <dt>{t('squads.total')}</dt>
              <dd><CoinValue value={data.value.total} /></dd>
            </div>
            <div>
              <dt>{t('squads.starters')}</dt>
              <dd><CoinValue value={data.value.starters} /></dd>
            </div>
            <div>
              <dt>{t('squads.bench')}</dt>
              <dd><CoinValue value={data.value.bench} /></dd>
            </div>
            <div>
              <dt>{t('pitch.rating')}</dt>
              <dd>{data.rating ?? '–'}</dd>
            </div>
            {data.chemistry !== null && (
              <div>
                <dt>{t('pitch.chemistry')}</dt>
                <dd>{data.chemistry}/33</dd>
              </div>
            )}
          </dl>
          <ValueNotes value={data.value} />

          {positions.length > 0 ? (
            <div className="obj-pitch squad-pitch">
              <div className="pitch-wrap">
                <div className="pitch" data-lines={lines}>
                  <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="18" y="0" width="64" height="15" />
                    <rect x="35" y="0" width="30" height="6" />
                    <line x1="0" y1="45" x2="100" y2="45" />
                    <ellipse cx="50" cy="45" rx="14" ry="10" />
                    <rect x="18" y="80" width="64" height="20" />
                    <rect x="35" y="92" width="30" height="8" />
                  </svg>
                  {positions.map((p, i) => (
                    <div key={i} className="slot" style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                      <SlotCard slot={byIndex.get(i)} meta={meta} position={POSITION_NAMES[p.typeId]} />
                      <div className="slot-foot">
                        <span className="slot-pos">{p.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // no known formation: the starters as a row of cards
            <ul className="squad-bench">
              {starters.map((s) => (
                <li key={s.index}>
                  <SlotCard slot={s} meta={meta} size="sm" />
                </li>
              ))}
            </ul>
          )}

          {bench.length > 0 && (
            <section aria-labelledby="squad-bench-h">
              <h2 id="squad-bench-h" className="squad-bench-h">{t('squads.bench')}</h2>
              <ul className="squad-bench">
                {bench.map((s) => (
                  <li key={s.index}>
                    <SlotCard slot={s} meta={meta} size="sm" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
