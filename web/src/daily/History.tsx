// The past days dialog body: each day's answer card, how many games finished and the share that guessed it,
// and the visitor's own result (from the server when signed in, from this browser's saved plays otherwise).
import { useEffect, useRef, useState } from 'react';
import { CheckCircle, MinusCircle, XCircle } from '@phosphor-icons/react';
import { api, type DailyHistoryDay, type Meta } from '../api';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { toCardPlayer } from './MysteryCard';
import { loadPlays } from './store';

/** Signed out (no `me` from the server): the own result comes from the plays this browser saved. */
function withLocal(days: DailyHistoryDay[]): DailyHistoryDay[] {
  if (days.some((x) => x.me !== undefined)) return days;
  const local = new Map(loadPlays().map((p) => [p.day, p]));
  return days.map((x) => {
    const p = local.get(x.day);
    return { ...x, me: p ? { won: p.won, guesses: p.guesses } : null };
  });
}

export function History({ signedIn, meta }: { signedIn: boolean; meta: Meta | null }) {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<DailyHistoryDay[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  // fetched each time the dialog opens (the body mounts with it)
  useEffect(() => {
    live.current = true;
    api.daily
      .history()
      .then((d) => {
        if (!live.current) return;
        setDays(withLocal(d.days));
        setMore(d.more);
      })
      .catch((e) => live.current && setError(errorText(e, t)));
    return () => {
      live.current = false;
    };
  }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // the next 30 older days, before the oldest one shown
  const loadMore = () => {
    const oldest = days?.[days.length - 1]?.day;
    if (oldest === undefined || loadingMore) return;
    setLoadingMore(true);
    api.daily
      .history(oldest)
      .then((d) => {
        if (!live.current) return;
        setDays((cur) => [...(cur ?? []), ...withLocal(d.days).filter((x) => !cur?.some((c) => c.day === x.day))]);
        setMore(d.more);
      })
      .catch((e) => live.current && setError(errorText(e, t)))
      .finally(() => live.current && setLoadingMore(false));
  };

  const num = new Intl.NumberFormat(lang);
  const pct = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }); // the server sends 0-100
  const fmtDate = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  if (error)
    return (
      <p className="dg-err" role="alert">
        {error}
      </p>
    );
  if (!days)
    return (
      <p className="dg-lb-note" role="status">
        {t('daily.lb.loading')}
      </p>
    );
  if (!days.length) return <p className="dg-lb-note">{t('daily.hist.empty')}</p>;
  return (
    <div className="dg-hist">
      <ul className="dg-hist-list">
        {days.map((d) => (
          <li key={d.day} className="dg-hist-day">
            <div className="dg-hist-card">{d.answer && meta ? <Card player={toCardPlayer(d.answer)} meta={meta} size="sm" /> : <div className="dg-hist-nocard" aria-hidden="true" />}</div>
            <div className="dg-hist-info">
              <p className="dg-hist-when">
                <b>{t('daily.hist.day', { n: d.day })}</b> · {fmtDate.format(new Date(`${d.date}T12:00:00Z`))}
              </p>
              <p className="dg-hist-name">{d.answer?.fullName || d.answer?.name || '–'}</p>
              <p className={`dg-hist-me${d.me ? (d.me.won ? ' won' : ' lost') : ''}`}>
                {d.me ? (
                  d.me.won ? (
                    <CheckCircle weight="fill" aria-hidden="true" />
                  ) : (
                    <XCircle weight="fill" aria-hidden="true" />
                  )
                ) : (
                  <MinusCircle weight="bold" aria-hidden="true" />
                )}
                <span>
                  {t('daily.hist.you')}: {d.me ? (d.me.won ? t('daily.hist.won', { count: d.me.guesses }) : t('daily.hist.lost')) : t('daily.hist.notPlayed')}
                </span>
              </p>
              <p className="dg-hist-all">
                {d.winPct === null
                  ? t('daily.hist.noGames')
                  : `${t('daily.hist.rate', { pct: pct.format(d.winPct / 100) })} · ${t('daily.hist.games', { count: d.played, countText: num.format(d.played) })}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {more && (
        <button type="button" className="dg-btn dg-hist-more" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
          {loadingMore ? t('daily.lb.loading') : t('daily.hist.more')}
        </button>
      )}
      {!signedIn && <p className="dg-lb-note">{t('daily.hist.localNote')}</p>}
    </div>
  );
}
