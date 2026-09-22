import { useId, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Meta, Player } from '../api';

export type FacetKind = 'nation' | 'league' | 'club';

export interface Exclusions {
  excludeNations: number[];
  excludeLeagues: number[];
  excludeClubs: number[];
}

const FIELD: Record<FacetKind, keyof Exclusions> = {
  nation: 'excludeNations',
  league: 'excludeLeagues',
  club: 'excludeClubs',
};

const KIND_LABEL: Record<FacetKind, string> = { nation: 'Nation', league: 'League', club: 'Club' };

interface Facet {
  kind: FacetKind;
  id: number;
  name: string;
  count: number;
}

function logo(meta: Meta, kind: FacetKind, id: number) {
  const dir = kind === 'nation' ? 'flags' : kind === 'league' ? 'leagues' : 'clubs';
  return `${meta.contentBase}/items/images/mobile/${dir}/dark/${id}.png`;
}

interface Props {
  meta: Meta;
  club: Player[];
  value: Exclusions;
  onChange: (next: Exclusions) => void;
}

/** Search the nations, leagues and clubs that exist in the user's club and keep them out of SBCs. */
export function ExcludePicker({ meta, club, value, onChange }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();

  const facets = useMemo(() => {
    const counts = new Map<string, Facet>();
    const bump = (kind: FacetKind, id: number) => {
      const key = `${kind}:${id}`;
      const f = counts.get(key);
      if (f) f.count++;
      else {
        const name = meta.names[kind][id] ?? `${KIND_LABEL[kind]} ${id}`;
        counts.set(key, { kind, id, name, count: 1 });
      }
    };
    for (const p of club) {
      if (p.isLoan) continue;
      bump('nation', p.nation);
      bump('league', p.league);
      bump('club', p.club);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [club, meta]);

  const isExcluded = (f: Facet) => value[FIELD[f.kind]].includes(f.id);
  const needle = q.trim().toLowerCase();
  const matches = facets.filter((f) => !isExcluded(f) && (!needle || f.name.toLowerCase().includes(needle))).slice(0, 8);
  const chosen = facets.filter(isExcluded);

  const toggle = (f: Facet) => {
    const field = FIELD[f.kind];
    const list = value[field];
    onChange({ ...value, [field]: list.includes(f.id) ? list.filter((x) => x !== f.id) : [...list, f.id] });
  };

  return (
    <div className="exclude">
      <h3>Never use players from</h3>
      <div className="exclude-search">
        <MagnifyingGlass aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-label="Search nations, leagues and clubs to exclude"
          placeholder="Nation, league or club"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              toggle(matches[0]);
              setQ('');
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <ul className="exclude-list" id={listId} role="listbox">
          {matches.map((f) => (
            <li key={`${f.kind}:${f.id}`} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  toggle(f);
                  setQ('');
                }}
              >
                <img src={logo(meta, f.kind, f.id)} alt="" loading="lazy" />
                <span className="exclude-name">{f.name}</span>
                <span className="exclude-kind">{KIND_LABEL[f.kind]}</span>
                <span className="exclude-count">{f.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <ul className="chips">
          {chosen.map((f) => (
            <li key={`${f.kind}:${f.id}`}>
              <img src={logo(meta, f.kind, f.id)} alt="" />
              <span>{f.name}</span>
              <button type="button" className="icon" aria-label={`Allow ${f.name} again`} onClick={() => toggle(f)}>
                <X weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
