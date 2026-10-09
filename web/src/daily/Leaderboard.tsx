// The all-time leaderboard dialog body: top 50 opted-in players, "your place" below when outside
// them, and a way in for signed-in players who are not on it (or for signed-out visitors).
import { useEffect, useState, type ReactNode } from 'react';
import { Fire } from '@phosphor-icons/react';
import { api, type DailyLbRow, type DailyLeaderboard, type DailyProfile } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';

interface Props {
  signedIn: boolean;
  me: DailyProfile | undefined;
  /** the sign-in link (a real <a>) for signed-out visitors */
  signIn: ReactNode;
  onJoin: () => void;
}

export function Leaderboard({ signedIn, me, signIn, onJoin }: Props) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<DailyLeaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // fetched each time the dialog opens (the body mounts with it), so a fresh opt-in shows up
  useEffect(() => {
    let live = true;
    api.daily
      .leaderboard()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorText(e, t)));
    return () => {
      live = false;
    };
  }, [signedIn, me?.leaderboard, me?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = new Intl.NumberFormat(lang);
  const pct = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }); // the server sends 0-100
  const avg = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const shown = signedIn && !!me?.leaderboard && !!me.username;
  const mine = (r: DailyLbRow) => shown && r.username.toLowerCase() === me!.username!.toLowerCase();

  const row = (r: DailyLbRow, you = false) => {
    const own = you || mine(r);
    return (
      <tr key={r.username} className={own ? 'me' : undefined} aria-current={own ? 'true' : undefined}>
        <td className="dg-lb-rank">
          <span className={r.rank <= 3 ? `dg-medal m${r.rank}` : undefined}>{num.format(r.rank)}</span>
        </td>
        <td className="dg-lb-name">
          <span className="dg-lb-who">
            <span className="dg-lb-uname">{r.username}</span>
            {own && <span className="dg-lb-me">{t('daily.lb.me')}</span>}
          </span>
        </td>
        <td>{num.format(r.wins)}</td>
        <td className="dg-lb-opt">{num.format(r.played)}</td>
        <td>{pct.format(r.winPct / 100)}</td>
        <td className="dg-lb-opt">{r.avgGuesses === null ? '–' : avg.format(r.avgGuesses)}</td>
        <td>
          <span className="dg-lb-streak">
            <Fire weight="fill" aria-hidden="true" />
            {num.format(r.streak)}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="dg-lb">
      {error ? (
        <p className="dg-err" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="dg-lb-note" role="status">
          {t('daily.lb.loading')}
        </p>
      ) : data.rows.length === 0 ? (
        <p className="dg-lb-note">{t('daily.lb.empty')}</p>
      ) : (
        <table className="dg-lb-table">
          <thead>
            <tr>
              <th scope="col" className="dg-lb-rank">{t('daily.lb.rank')}</th>
              <th scope="col" className="dg-lb-name">{t('daily.lb.player')}</th>
              <th scope="col">{t('daily.lb.wins')}</th>
              <th scope="col" className="dg-lb-opt">{t('daily.stats.played')}</th>
              <th scope="col">{t('daily.lb.winPct')}</th>
              <th scope="col" className="dg-lb-opt">{t('daily.lb.avg')}</th>
              <th scope="col">{t('daily.lb.streak')}</th>
            </tr>
          </thead>
          <tbody>{data.rows.map((r) => row(r))}</tbody>
          {data.me && !data.me.inTop && (
            <tbody className="dg-lb-you">
              <tr>
                <th scope="rowgroup" colSpan={7}>
                  {t('daily.lb.you')}
                </th>
              </tr>
              {row(data.me, true)}
            </tbody>
          )}
        </table>
      )}
      {!signedIn ? (
        <p className="dg-lb-foot">
          {t('daily.lb.signIn')} {signIn}
        </p>
      ) : (
        me &&
        !shown && (
          <div className="dg-lb-foot">
            <p>{t('daily.lb.notIn')}</p>
            <button type="button" className="dg-btn go" onClick={onJoin}>
              {t('daily.lb.join')}
            </button>
          </div>
        )
      )}
    </div>
  );
}
