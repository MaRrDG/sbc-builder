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

  const avg = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const shown = signedIn && !!me?.leaderboard && !!me.username;
  const mine = (r: DailyLbRow) => shown && r.username.toLowerCase() === me!.username!.toLowerCase();

  const row = (r: DailyLbRow, you = false) => (
    <tr key={r.username} className={you || mine(r) ? 'me' : undefined} aria-current={you || mine(r) ? 'true' : undefined}>
      <td className="dg-lb-rank">
        <span className={r.rank <= 3 ? `dg-medal m${r.rank}` : undefined}>{r.rank}</span>
      </td>
      <td className="dg-lb-name">{r.username}</td>
      <td>{r.wins}</td>
      <td className="dg-lb-opt">{r.played}</td>
      <td>{r.winPct}</td>
      <td className="dg-lb-opt">{r.avgGuesses === null ? '–' : avg.format(r.avgGuesses)}</td>
      <td>
        <span className="dg-lb-streak">
          <Fire weight="fill" aria-hidden="true" />
          {r.streak}
        </span>
      </td>
    </tr>
  );

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
