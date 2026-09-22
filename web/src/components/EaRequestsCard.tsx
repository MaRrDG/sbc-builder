import type { EaRequests } from '../api';
import { useAgo, useI18n } from '../i18n';

/** How many requests FC Solver sent to EA today with this account's session, and to which endpoints. */
export function EaRequestsCard({ ea }: { ea: EaRequests }) {
  const { t } = useI18n();
  const ago = useAgo();
  const pct = Math.min(100, (ea.today / ea.limit) * 100);
  const paths = Object.entries(ea.byPath).sort((a, b) => b[1] - a[1]);
  return (
    <section className="settings-card ea-card">
      <h2>{t('ea.title')}</h2>
      <p className="ea-count">
        <b>{ea.today}</b> / {ea.limit}
      </p>
      <span className="req-bar ea-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <p className="muted">{t('ea.lede', { limit: ea.limit })}</p>
      {ea.pausedUntil && (
        <p className="ea-paused" role="status">
          {t('ea.paused', { time: new Date(ea.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
        </p>
      )}
      {paths.length > 0 && (
        <ul className="ea-list">
          {paths.map(([p, n]) => (
            <li key={p}>
              <code>{p}</code>
              <b>{n}</b>
            </li>
          ))}
        </ul>
      )}
      {ea.recent.length > 0 && (
        <details className="ea-recent">
          <summary>{t('ea.recent')}</summary>
          <ul className="ea-list">
            {ea.recent.map((r, i) => (
              <li key={i}>
                <code>
                  {r.method} {r.path}
                </code>
                <span className={r.status && r.status < 300 ? 'muted' : 'bad'}>
                  {r.status ?? t('ea.failed')} · {ago(r.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
