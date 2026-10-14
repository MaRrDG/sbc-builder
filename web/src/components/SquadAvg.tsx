// The found squad's worth in EA's AVG (what the solver minimised, before the untradeable discount) and
// the "How it's calculated" dialog; the rules also sit on the /guide page (CostRules).
import { useEffect, useRef, useState } from 'react';
import { Info } from '@phosphor-icons/react';
import type { Player } from '../api';
import { useI18n } from '../i18n';
import { CoinValue } from './squads/SquadsView';

/** The pricing rules the solver uses (server/cost.ts), as a list. */
export function CostRules() {
  const { t } = useI18n();
  return (
    <ol className="cost-rules">
      <li>{t('cost.rule1')}</li>
      <li>{t('cost.rule2')}</li>
      <li>{t('cost.rule3')}</li>
      <li>{t('cost.rule4')}</li>
      <li>{t('cost.rule5')}</li>
      <li>{t('cost.rule6')}</li>
    </ol>
  );
}

function CostDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="cost-dialog" aria-labelledby="cost-title" onClose={onClose} onCancel={onClose}>
      <h2 id="cost-title">{t('cost.title')}</h2>
      <CostRules />
      <p className="muted">{t('cost.note')}</p>
      <button type="button" className="ghost bordered" onClick={onClose} autoFocus>{t('cost.close')}</button>
    </dialog>
  );
}

/** "Squad AVG" line under the pitch: total, untradeable and tradeable parts, and the rules button. */
export function SquadAvg({ players }: { players: Player[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const sum = (f: (p: Player) => boolean) => players.filter(f).reduce((s, p) => s + (p.price ?? 0), 0);
  const untradeable = sum((p) => p.untradeable);
  const tradeable = sum((p) => !p.untradeable);
  const unknown = players.filter((p) => !p.price).length;
  return (
    <div className="squad-avg">
      <span className="squad-avg-total">
        {t('cost.avg')} <CoinValue value={untradeable + tradeable} />
      </span>
      <span className="squad-avg-parts muted">
        {t('cost.untradeable')} <CoinValue value={untradeable} /> · {t('cost.tradeable')} <CoinValue value={tradeable} />
        {unknown > 0 && <> · {t('cost.noPrice', { count: unknown })}</>}
      </span>
      <button type="button" className="squad-avg-how" onClick={() => setOpen(true)}>
        <Info weight="bold" aria-hidden="true" /> {t('cost.how')}
      </button>
      {open && <CostDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
