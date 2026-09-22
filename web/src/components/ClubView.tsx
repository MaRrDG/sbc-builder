import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, Prohibit } from '@phosphor-icons/react';
import type { Meta, Player } from '../api';
import { Card } from './Card';
import { PlayerPanel } from './PlayerPanel';
import { Pager, clampPage } from './Pager';

const PER_PAGE = 60;

type Filter = 'all' | 'untradeable' | 'tradeable' | 'special' | 'squad' | 'kept';
type Sort = 'rating' | 'name' | 'position';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['untradeable', 'Untradeable'],
  ['tradeable', 'Tradeable'],
  ['special', 'Special'],
  ['squad', 'Active squad'],
  ['kept', 'Kept out'],
];

const POS_ORDER = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'RM', 'CM', 'LM', 'CAM', 'RW', 'LW', 'CF', 'ST'];

interface Props {
  club: Player[];
  meta: Meta;
  squad: { starters: number[]; bench: number[] } | null;
  excludeIds: number[];
  onToggleExclude: (playerId: number) => void;
}

/** The players in the club, searchable; a card opens its details and can be kept out of SBCs. */
export function ClubView({ club, meta, squad, excludeIds, onToggleExclude }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('rating');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  // typing stays responsive; the grid catches up on the next idle render
  const deferredQ = useDeferredValue(q);

  const kept = useMemo(() => new Set(excludeIds), [excludeIds]);
  const starters = useMemo(() => new Set(squad?.starters ?? []), [squad]);
  const bench = useMemo(() => new Set(squad?.bench ?? []), [squad]);
  // one handler per player id, kept across renders so memoized cards skip re-rendering
  const handlers = useRef(new Map<number, () => void>());
  const onCardClick = useCallback((id: number) => {
    let h = handlers.current.get(id);
    if (!h) {
      h = () => setSelectedId((c) => (c === id ? null : id));
      handlers.current.set(id, h);
    }
    return h;
  }, []);
  const role = (id: number) => (starters.has(id) ? 'XI' : bench.has(id) ? 'Subs' : null);

  const shown = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    const list = club.filter((p) => {
      if (p.isLoan) return false;
      if (needle && !p.name.toLowerCase().includes(needle) && !p.fullName.toLowerCase().includes(needle)) return false;
      switch (filter) {
        case 'untradeable': return p.untradeable;
        case 'tradeable': return !p.untradeable;
        case 'special': return p.rareflag > 1;
        case 'squad': return starters.has(p.id) || bench.has(p.id);
        case 'kept': return kept.has(p.id);
        default: return true;
      }
    });
    const pos = (p: Player) => {
      const i = POS_ORDER.indexOf(p.preferredPosition);
      return i < 0 ? POS_ORDER.length : i;
    };
    return list.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'position' ? pos(a) - pos(b) || b.rating - a.rating
      : b.rating - a.rating || a.name.localeCompare(b.name),
    );
  }, [club, deferredQ, filter, sort, starters, bench, kept]);

  const current = clampPage(page, shown.length, PER_PAGE);
  const pageItems = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const selected = club.find((p) => p.id === selectedId) ?? null;
  const owned = useMemo(() => club.filter((p) => !p.isLoan), [club]);
  const untradeable = useMemo(() => owned.filter((p) => p.untradeable).length, [owned]);
  const turnPage = (n: number) => {
    setPage(n);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="club-view">
      <header className="page-head">
        <div>
          <h1>Club</h1>
          <p className="muted">
            {owned.length} players · {untradeable} untradeable · {kept.size} kept out of SBCs
          </p>
        </div>
        <label className="search">
          <MagnifyingGlass aria-hidden="true" />
          <input
            placeholder="Search players"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Search players"
          />
        </label>
      </header>

      <div className="club-tools">
        <div className="chips-row" role="group" aria-label="Filter players">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sort">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
          >
            <option value="rating">Rating</option>
            <option value="position">Position</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="club-body">
        {shown.length === 0 ? (
          <p className="muted">No players match.</p>
        ) : (
          <div className="club-list">
            <ul className="club-grid">
              {pageItems.map((p) => (
                <li key={p.id} className={kept.has(p.id) ? 'kept-out' : ''}>
                  <Card player={p} meta={meta} size="sm" selected={p.id === selectedId} onClick={onCardClick(p.id)} />
                  {kept.has(p.id) && <Prohibit className="kept-mark" weight="bold" aria-label="Kept out of SBCs" />}
                </li>
              ))}
            </ul>
            <Pager page={current} total={shown.length} perPage={PER_PAGE} onPage={turnPage} label="Club pages" />
          </div>
        )}
        {selected && (
          <div className="club-side">
            <PlayerPanel
              key={selected.id}
              player={selected}
              meta={meta}
              inSquad={role(selected.id)}
              excluded={kept.has(selected.id)}
              excludeLabel="Keep out of SBCs"
              onExclude={() => onToggleExclude(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
