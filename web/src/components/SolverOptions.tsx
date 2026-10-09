import { X } from '@phosphor-icons/react';
import type { Meta, Player, SolveOptions } from '../api';
import { ExcludePicker } from './ExcludePicker';
import { Row, SwitchRow } from './SettingsRows';
import { useI18n } from '../i18n';

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
  keepPlaced: false, // Solve gives a fresh squad; placed players are only shown until then
};

export const exclusionCount = (o: SolveOptions) =>
  o.excludeIds.length + o.excludeNations.length + o.excludeLeagues.length + o.excludeClubs.length;

interface Props {
  options: SolveOptions;
  onChange: (o: SolveOptions) => void;
  clubById: Map<number, Player>;
  club: Player[];
  meta: Meta;
  /** Settings page layout: one row per setting with a short hint */
  rows?: boolean;
}

type Flag = 'excludeActiveSquad' | 'excludeSquadReserves' | 'excludeSpecial' | 'onlyUntradeable' | 'keepPlaced';
const FLAGS: [Flag, string, string][] = [
  ['excludeActiveSquad', 'opt.keepXI', 'opt.keepXIHint'],
  ['excludeSquadReserves', 'opt.keepSubs', 'opt.keepSubsHint'],
  ['excludeSpecial', 'opt.keepSpecial', 'opt.keepSpecialHint'],
  ['onlyUntradeable', 'opt.onlyUntradeable', 'opt.onlyUntradeableHint'],
  ['keepPlaced', 'opt.keepPlaced', 'opt.keepPlacedHint'],
];

/** The solver switches, exclusions and kept-out players; used by Settings and by one SBC's local settings. */
export function SolverOptions({ options, onChange, clubById, club, meta, rows }: Props) {
  const { t } = useI18n();
  const toggle = (k: Flag) => onChange({ ...options, [k]: !options[k] });
  if (rows) return <OptionRows options={options} onChange={onChange} clubById={clubById} club={club} meta={meta} />;
  return (
    <>
      <label className="switch">
        <input type="checkbox" checked={options.excludeActiveSquad} onChange={() => toggle('excludeActiveSquad')} />
        <span>{t('opt.keepXI')}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSquadReserves} onChange={() => toggle('excludeSquadReserves')} />
        <span>{t('opt.keepSubs')}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSpecial} onChange={() => toggle('excludeSpecial')} />
        <span>{t('opt.keepSpecial')}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.onlyUntradeable} onChange={() => toggle('onlyUntradeable')} />
        <span>{t('opt.onlyUntradeable')}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.keepPlaced} onChange={() => toggle('keepPlaced')} />
        <span>{t('opt.keepPlaced')}</span>
      </label>
      <ExcludePicker
        meta={meta}
        club={club}
        value={{ excludeNations: options.excludeNations, excludeLeagues: options.excludeLeagues, excludeClubs: options.excludeClubs }}
        onChange={(ex) => onChange({ ...options, ...ex })}
      />
      <label className="range">
        <span>
          {t('opt.maxOvr')} <b>{options.maxRating}</b>
        </span>
        <input type="range" min={60} max={99} value={options.maxRating} onChange={(e) => onChange({ ...options, maxRating: Number(e.target.value) })} />
      </label>
      {options.excludeIds.length > 0 && (
        <div className="kept">
          <h3>{t('opt.keptOut')}</h3>
          <ul>
            {options.excludeIds.map((id) => {
              const p = clubById.get(id);
              return (
                <li key={id}>
                  <b>{p?.rating ?? '?'}</b> {p?.name ?? `#${id}`}
                  <button
                    type="button"
                    className="icon"
                    aria-label={t('opt.allowPlayer', { name: p?.name ?? t('opt.player') })}
                    onClick={() => onChange({ ...options, excludeIds: options.excludeIds.filter((x) => x !== id) })}
                  >
                    <X weight="bold" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="text" onClick={() => onChange({ ...options, excludeIds: [] })}>
            {t('opt.allowAll')}
          </button>
        </div>
      )}
    </>
  );
}

function KeptOut({ options, onChange, clubById }: Pick<Props, 'options' | 'onChange' | 'clubById'>) {
  const { t } = useI18n();
  return (
    <ul className="kept-list">
      {options.excludeIds.map((id) => {
        const p = clubById.get(id);
        return (
          <li key={id}>
            <b>{p?.rating ?? '?'}</b> {p?.name ?? `#${id}`}
            <button
              type="button"
              className="icon"
              aria-label={t('opt.allowPlayer', { name: p?.name ?? t('opt.player') })}
              onClick={() => onChange({ ...options, excludeIds: options.excludeIds.filter((x) => x !== id) })}
            >
              <X weight="bold" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OptionRows({ options, onChange, clubById, club, meta }: Props) {
  const { t } = useI18n();
  return (
    <>
      {FLAGS.map(([k, label, hint]) => (
        <SwitchRow key={k} title={t(label)} hint={t(hint)} checked={options[k]} onChange={(v) => onChange({ ...options, [k]: v })} />
      ))}
      <Row title={t('opt.maxOvr')} hint={t('opt.maxOvrHint')} labelFor="opt-max-ovr" className="range-row">
        <input
          id="opt-max-ovr"
          type="range"
          min={60}
          max={99}
          value={options.maxRating}
          onChange={(e) => onChange({ ...options, maxRating: Number(e.target.value) })}
        />
        <output htmlFor="opt-max-ovr" className="range-value">{options.maxRating}</output>
      </Row>
      <Row title={t('exclude.title')} hint={t('exclude.hint')} stack>
        <ExcludePicker
          meta={meta}
          club={club}
          value={{ excludeNations: options.excludeNations, excludeLeagues: options.excludeLeagues, excludeClubs: options.excludeClubs }}
          onChange={(ex) => onChange({ ...options, ...ex })}
        />
      </Row>
      {options.excludeIds.length > 0 && (
        <Row title={t('opt.keptOut')} hint={t('opt.keptOutHint')} stack>
          <KeptOut options={options} onChange={onChange} clubById={clubById} />
          <button type="button" className="ghost bordered" onClick={() => onChange({ ...options, excludeIds: [] })}>
            {t('opt.allowAll')}
          </button>
        </Row>
      )}
    </>
  );
}
