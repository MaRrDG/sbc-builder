import { useDeferredValue, useMemo, useState } from 'react';
import { Diamond, MagnifyingGlass, SlidersHorizontal } from '@phosphor-icons/react';
import type { SbcSet } from '../api';
import { repeatOf } from '../repeat';
import { SetBadge } from './SetBadge';
import { Pager, clampPage } from './Pager';
import { useI18n } from '../i18n';

const PER_PAGE = 24;
const KIND_KEY = 'sbc-set-kind';
const KINDS = [
  ['all', 'sets.kindAll'],
  ['squad', 'sets.kindSquad'],
  ['points', 'sets.kindPoints'],
] as const;
type Kind = (typeof KINDS)[number][0];

// a points SBC is known from its cached challenges (/api/sets adds pointsTarget, 0 once done)
const isPoints = (s: SbcSet) => s.pointsTarget !== undefined;

const OPEN_KEY = 'sbc-set-open';

function savedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

function savedKind(): Kind {
  try {
    const v = localStorage.getItem(KIND_KEY);
    return v === 'squad' || v === 'points' ? v : 'all';
  } catch {
    return 'all';
  }
}

interface Props {
  categories: { categoryId: number; name: string; sets: SbcSet[] }[];
  filter: string;
  onFilter: (q: string) => void;
  onPick: (setId: number) => void;
  localSets: Set<number>;
  now: number;
}

/** Every SBC set, grouped by category like the web app; a click opens the set. */
export function SetList({ categories, filter, onFilter, onPick, localSets, now }: Props) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<Kind>(savedKind);
  const [onlyOpen, setOnlyOpen] = useState(savedOpen);
  const q = useDeferredValue(filter).trim().toLowerCase();
  const total = categories.reduce((n, c) => n + c.sets.length, 0);
  // paginate the flat list, then regroup the page by category so headings stay in place
  const matches = useMemo(
    () => categories.flatMap((cat) => cat.sets.filter((s) => (!q || s.name.toLowerCase().includes(q)) && (kind === 'all' || isPoints(s) === (kind === 'points')) && (!onlyOpen || repeatOf(s, now).available)).map((s) => ({ cat, s }))),
    [categories, q, kind, onlyOpen, now],
  );
  const current = clampPage(page, matches.length, PER_PAGE);
  const groups = useMemo(() => {
    const out: { cat: Props['categories'][number]; sets: SbcSet[] }[] = [];
    for (const { cat, s } of matches.slice((current - 1) * PER_PAGE, current * PER_PAGE)) {
      const last = out[out.length - 1];
      if (last?.cat === cat) last.sets.push(s);
      else out.push({ cat, sets: [s] });
    }
    return out;
  }, [matches, current]);
  return (
    <div className="set-list">
      <header className="page-head">
        <div>
          <h1>{t('sets.title')}</h1>
          <p className="muted">{t('sets.count', { count: total })}</p>
        </div>
        <label className="search">
          <MagnifyingGlass aria-hidden="true" />
          <input
            placeholder={t('sets.search')}
            value={filter}
            onChange={(e) => {
              onFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t('sets.search')}
          />
        </label>
      </header>
      <div className="chips-row set-kinds" role="group" aria-label={t('sets.kind')}>
        {KINDS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setPage(1);
              remember(KIND_KEY, k);
            }}
          >
            {t(label)}
          </button>
        ))}
        <span className="chips-sep" aria-hidden="true" />
        <button
          type="button"
          className="chip"
          aria-pressed={onlyOpen}
          onClick={() => {
            setOnlyOpen(!onlyOpen);
            setPage(1);
            remember(OPEN_KEY, onlyOpen ? '0' : '1');
          }}
        >
          {t('sets.onlyOpen')}
        </button>
      </div>
      {categories.length === 0 && <p className="muted">{t('sets.empty')}</p>}
      {categories.length > 0 && matches.length === 0 && <p className="muted">{q ? t('sets.noMatch', { q: filter }) : t('sets.noneOfKind')}</p>}
      {groups.map(({ cat, sets }) => (
          <section key={cat.categoryId} className="set-section">
            <h2>{cat.name}</h2>
            <div className="set-grid">
              {sets.map((s) => {
                const done = !repeatOf(s, now).available;
                return (
                  <button key={s.setId} type="button" className={`set-tile${done ? ' done' : ''}`} onClick={() => onPick(s.setId)}>
                    <span className="set-tile-top">
                      <span className="set-name">{s.name}</span>
                      <SetBadge set={s} now={now} />
                      {s.pointsTarget ? (
                        <span className="points-pill">
                          <Diamond weight="fill" aria-hidden="true" /> {t('points.tile', { n: s.pointsTarget.toLocaleString(lang), count: s.pointsTarget })}
                        </span>
                      ) : null}
                    </span>
                    {s.description && <span className="set-desc">{s.description}</span>}
                    {localSets.has(s.setId) && (
                      <span className="set-local">
                        <SlidersHorizontal weight="bold" aria-hidden="true" /> {t('sets.ownSettings')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
      ))}
      <Pager
        page={current}
        total={matches.length}
        perPage={PER_PAGE}
        onPage={(n) => {
          setPage(n);
          window.scrollTo({ top: 0 });
        }}
        label={t('sets.pages')}
      />
    </div>
  );
}
