import { X } from '@phosphor-icons/react';
import type { Meta, Player, SolveOptions } from '../api';
import { ExcludePicker } from './ExcludePicker';

export const DEFAULT_OPTIONS: SolveOptions = {
  excludeIds: [],
  excludeActiveSquad: true,
  excludeSquadReserves: false,
  excludeNations: [],
  excludeLeagues: [],
  excludeClubs: [],
  onlyUntradeable: false,
  maxRating: 99,
  excludeSpecial: true,
};

export const exclusionCount = (o: SolveOptions) =>
  o.excludeIds.length + o.excludeNations.length + o.excludeLeagues.length + o.excludeClubs.length;

interface Props {
  options: SolveOptions;
  onChange: (o: SolveOptions) => void;
  clubById: Map<number, Player>;
  club: Player[];
  meta: Meta;
}

/** The solver switches, exclusions and kept-out players; used by Settings and by one SBC's local settings. */
export function SolverOptions({ options, onChange, clubById, club, meta }: Props) {
  const toggle = (k: 'excludeActiveSquad' | 'excludeSquadReserves' | 'excludeSpecial' | 'onlyUntradeable') =>
    onChange({ ...options, [k]: !options[k] });
  return (
    <>
      <label className="switch">
        <input type="checkbox" checked={options.excludeActiveSquad} onChange={() => toggle('excludeActiveSquad')} />
        <span>Keep my active squad XI</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSquadReserves} onChange={() => toggle('excludeSquadReserves')} />
        <span>Keep my active squad subs</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSpecial} onChange={() => toggle('excludeSpecial')} />
        <span>Keep special and promo cards</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.onlyUntradeable} onChange={() => toggle('onlyUntradeable')} />
        <span>Only use untradeables</span>
      </label>
      <ExcludePicker
        meta={meta}
        club={club}
        value={{ excludeNations: options.excludeNations, excludeLeagues: options.excludeLeagues, excludeClubs: options.excludeClubs }}
        onChange={(ex) => onChange({ ...options, ...ex })}
      />
      <label className="range">
        <span>
          Highest OVR allowed <b>{options.maxRating}</b>
        </span>
        <input type="range" min={60} max={99} value={options.maxRating} onChange={(e) => onChange({ ...options, maxRating: Number(e.target.value) })} />
      </label>
      {options.excludeIds.length > 0 && (
        <div className="kept">
          <h3>Kept out of SBCs</h3>
          <ul>
            {options.excludeIds.map((id) => {
              const p = clubById.get(id);
              return (
                <li key={id}>
                  <b>{p?.rating ?? '?'}</b> {p?.name ?? `#${id}`}
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Allow ${p?.name ?? 'player'} again`}
                    onClick={() => onChange({ ...options, excludeIds: options.excludeIds.filter((x) => x !== id) })}
                  >
                    <X weight="bold" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="text" onClick={() => onChange({ ...options, excludeIds: [] })}>
            Allow all again
          </button>
        </div>
      )}
    </>
  );
}
