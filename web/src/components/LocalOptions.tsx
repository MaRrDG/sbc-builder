import { useState } from 'react';
import { Warning, X } from '@phosphor-icons/react';
import type { Meta, Player, SolveOptions } from '../api';
import { SolverOptions } from './SolverOptions';
import { useI18n } from '../i18n';

interface Props {
  setName: string;
  global: SolveOptions;
  local: SolveOptions | null;
  onSetLocal: (o: SolveOptions | null) => void;
  clubById: Map<number, Player>;
  club: Player[];
  meta: Meta;
  onClose: () => void;
}

/**
 * Settings for one SBC. Starts as a view of the global settings; the first change asks
 * to switch this SBC to its own copy, after which the global settings no longer apply to it.
 */
export function LocalOptions({ setName, global, local, onSetLocal, clubById, club, meta, onClose }: Props) {
  const { t } = useI18n();
  const [pending, setPending] = useState<SolveOptions | null>(null);
  const shown = local ?? pending ?? global;
  const change = (o: SolveOptions) => (local ? onSetLocal(o) : setPending(o));

  return (
    <section className="options">
      <header>
        <div>
          <h2>{t('local.title')}</h2>
          <p className="muted">{setName}</p>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label={t('local.close')}>
          <X weight="bold" />
        </button>
      </header>

      {local ? (
        <div className="scope-note local">
          <p>
            <strong>{t('local.active')}</strong> {t('local.activeRest')}
          </p>
          <button type="button" className="text" onClick={() => onSetLocal(null)}>
            {t('local.useGlobal')}
          </button>
        </div>
      ) : pending ? (
        <div className="scope-note confirm" role="alert">
          <Warning weight="fill" aria-hidden="true" />
          <p>{t('local.confirm')}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="solve-sm"
              onClick={() => {
                onSetLocal(pending);
                setPending(null);
              }}
            >
              {t('local.use')}
            </button>
            <button type="button" className="ghost" onClick={() => setPending(null)}>
              {t('local.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="scope-note">
          <p>{t('local.showingGlobal')}</p>
        </div>
      )}

      <SolverOptions options={shown} onChange={change} clubById={clubById} club={club} meta={meta} />
    </section>
  );
}
