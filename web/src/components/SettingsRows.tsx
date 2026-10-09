// Settings page building blocks: a titled section holding a box of rows, each row a label + one-line
// hint on the left and its control on the right (stacked on phones, see .srow in styles.css).
import { useId, type ReactNode } from 'react';
import { Crown } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

export function Section({ title, lede, locked, children }: { title: string; lede?: ReactNode; locked?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className="sset" aria-labelledby={id}>
      <div className="sset-head">
        <h2 id={id}>{title}</h2>
        {locked && <PremiumTag label={t('settings.premiumTag')} />}
      </div>
      {lede && <p className="sset-lede">{lede}</p>}
      <div className={`sbox${locked ? ' locked' : ''}`}>{children}</div>
    </section>
  );
}

export function PremiumTag({ label }: { label: string }) {
  return (
    <em className="premium-tag">
      <Crown weight="fill" aria-hidden="true" /> {label}
    </em>
  );
}

/** A row with any control. `labelFor` ties the title to a single input; `stack` puts the control under the text. */
export function Row({ title, hint, hintId, labelFor, stack, children, className }: {
  title: ReactNode;
  hint?: ReactNode;
  /** id for the hint, so the control can point aria-describedby at it */
  hintId?: string;
  labelFor?: string;
  stack?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`srow${stack ? ' stack' : ''}${className ? ` ${className}` : ''}`}>
      <div className="srow-text">
        {labelFor ? (
          <label className="srow-label" htmlFor={labelFor}>{title}</label>
        ) : (
          <span className="srow-label">{title}</span>
        )}
        {hint && <span className="srow-hint" id={hintId}>{hint}</span>}
      </div>
      {children && <div className="srow-ctl">{children}</div>}
    </div>
  );
}

/** A whole-row switch: clicking the text toggles it too. */
export function SwitchRow({ title, hint, checked, onChange, disabled, busy }: {
  title: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** saving: blocks input without the dimmed disabled look */
  busy?: boolean;
}) {
  const hintId = useId();
  return (
    <label className={`srow switch-row${disabled ? ' off' : ''}`}>
      <span className="srow-text">
        <span className="srow-label">{title}</span>
        {hint && <span className="srow-hint" id={hintId}>{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="toggle"
        checked={checked}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? hintId : undefined}
      />
    </label>
  );
}
