// Evolutions screen: timed evolution trainings from the cache, with how long each one has left.
// Premium only: a Free user sees the locked panel and the page never asks the server.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Crown, Timer } from '@phosphor-icons/react';
import { api, type Evo, type Meta } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { timeLeft } from '../evos';
import { Card } from './Card';

export function EvosView({ premium, meta, reload, onUpgrade, onSettings }: {
  premium: boolean;
  meta: Meta;
  /** Bumps when a sync ends or the web app changes the cache (same moments the club reloads). */
  reload: number;
  onUpgrade: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  const [evos, setEvos] = useState<Evo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!premium) return;
    let live = true;
    api
      .evos()
      .then((r) => {
        if (!live) return;
        setEvos(r.evos);
        setError(null);
      })
      .catch((e) => live && setError(errorText(e, t)));
    return () => {
      live = false;
    };
  }, [premium, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!premium) return;
    const id = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(id);
  }, [premium]);

  // ready first, then the one that ends soonest
  const sorted = useMemo(() => {
    const done = (e: Evo) => e.ready || (e.endsAt !== null && timeLeft(e.endsAt, now).done);
    return [...(evos ?? [])].sort(
      (a, b) => Number(done(b)) - Number(done(a)) || (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity),
    );
  }, [evos, now]);

  return (
    <section className="evos-page">
      <header className="page-head">
        <div>
          <h1>{t('evos.title')}</h1>
          <p className="muted">{t('evos.lede')}</p>
        </div>
      </header>

      {!premium ? (
        <div className="settings-card locked evo-locked">
          <h2>{t('evos.lockedTitle')}</h2>
          <p className="locked-note">
            <Crown weight="fill" aria-hidden="true" /> {t('evos.lockedBody')}
          </p>
          <button type="button" className="ghost" onClick={onUpgrade}>
            {t('evos.seePlan')}
          </button>
        </div>
      ) : (
        <>
          {error && <div className="banner" role="alert">{error}</div>}
          {evos === null && !error && <p className="muted">{t('evos.loading')}</p>}
          {evos && evos.length === 0 && <p className="muted evo-empty">{t('evos.empty')}</p>}
          {sorted.length > 0 && (
            <ul className="evo-list">
              {sorted.map((e) => (
                <EvoItem key={e.slotId} evo={e} meta={meta} now={now} />
              ))}
            </ul>
          )}
          <p className="muted evo-foot">
            {t('evos.emailNote')}{' '}
            <button type="button" className="text" onClick={onSettings}>
              {t('nav.settings')}
            </button>
          </p>
        </>
      )}
    </section>
  );
}

function EvoItem({ evo: e, meta, now }: { evo: Evo; meta: Meta; now: number }) {
  const { t, lang } = useI18n();
  const left = e.endsAt !== null ? timeLeft(e.endsAt, now) : null;
  const ready = e.ready || !!left?.done;
  let status: string;
  if (ready) status = t('evos.ready');
  else if (left) {
    const { days, hours, minutes } = left;
    const when = days ? t('evos.left.dhm', { days, hours, minutes }) : hours ? t('evos.left.hm', { hours, minutes }) : t('evos.left.m', { minutes });
    status = t('evos.training', { left: when });
  } else status = t('evos.inTraining');

  return (
    <li className="evo-card">
      {e.player && <Card player={e.player} meta={meta} size="sm" />}
      <div className="evo-info">
        <h3>{e.slotName}</h3>
        <p className="muted">{t('evos.level', { level: e.level, count: e.levelCount })}</p>
        <p className={`evo-status${ready ? ' ready' : ''}`} aria-label={status}>
          {ready ? <CheckCircle weight="fill" aria-hidden="true" /> : <Timer weight="bold" aria-hidden="true" />}
          <span>{status}</span>
        </p>
        {!ready && e.endsAt !== null && (
          <p className="muted evo-ends">
            {t('evos.endsAt', {
              time: new Date(e.endsAt).toLocaleString(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
            })}
          </p>
        )}
      </div>
    </li>
  );
}
