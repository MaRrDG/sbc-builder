import type { EaRequests } from '../api';
import { ago } from '../api';

/** How many requests FC Solver sent to EA today with this account's session, and to which endpoints. */
export function EaRequestsCard({ ea }: { ea: EaRequests }) {
  const pct = Math.min(100, (ea.today / ea.limit) * 100);
  const paths = Object.entries(ea.byPath).sort((a, b) => b[1] - a[1]);
  return (
    <section className="settings-card ea-card">
      <h2>EA requests today</h2>
      <p className="ea-count">
        <b>{ea.today}</b> / {ea.limit}
      </p>
      <span className="req-bar ea-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <p className="muted">
        Only syncs ask EA. Opening SBCs and solving use the cache, and what you open in the web app updates it for free. FC Solver
        stops at {ea.limit} a day.
      </p>
      {ea.pausedUntil && (
        <p className="ea-paused" role="status">
          EA asked us to slow down. Paused until {new Date(ea.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
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
          <summary>Last requests</summary>
          <ul className="ea-list">
            {ea.recent.map((r, i) => (
              <li key={i}>
                <code>
                  {r.method} {r.path}
                </code>
                <span className={r.status && r.status < 300 ? 'muted' : 'bad'}>
                  {r.status ?? 'failed'} · {ago(r.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
