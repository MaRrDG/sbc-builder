// /sbcs (hub) and /sbcs/<slug>-<id> (one SBC): public pages with requirements and rewards, in the site language.
// The server already puts crawlable HTML inside #root; React replaces it. Data comes from /api/public/sbcs (no sign-in).
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { publicSbc, publicSbcs, type SbcChallengeView, type SbcListItem, type SbcSetView } from '../api';
import { formationLabel } from '../../../shared/formation';
import { track, yn } from '../track';
import type { Route } from '../route';
import './sbcpages.css';

type Nav = (r: Route, replace?: boolean) => void;

/** Loads once and again on retry(); `error` stays set until the next try finishes. */
function useLoad<T>(load: () => Promise<T>, key: unknown) {
  const [state, setState] = useState<{ data: T | null; error: Error | null }>({ data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null });
    load().then(
      (data) => live && setState({ data, error: null }),
      (error: Error) => live && setState({ data: null, error }),
    );
    return () => {
      live = false;
    };
  }, [key, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, retry: useCallback(() => setN((x) => x + 1), []) };
}

function Shell({ navigate, signedIn, children }: { navigate: Nav; signedIn: boolean; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const go = (r: Route) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(r);
    window.scrollTo(0, 0);
  };
  return (
    <div className="onboarding legal sbcp">
      <div className="brand onboarding-top">
        <a href="/" onClick={go({ view: 'landing' })} aria-label={t('top.home')}>
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
        </a>
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </div>
      {children}
      <p>
        <a className="text" href={signedIn ? '/dashboard' : '/'} onClick={go(signedIn ? { view: 'sbcs', setId: null, challengeId: null } : { view: 'landing' })}>
          {signedIn ? t('sbcpages.toApp') : t('auth.publicHome')}
        </a>
      </p>
    </div>
  );
}

const Failed = ({ retry }: { retry: () => void }) => {
  const { t } = useI18n();
  return (
    <div className="sbcp-error" role="alert">
      <p>{t('sbcpages.error')}</p>
      <button type="button" className="step-action ghost-strong" onClick={retry}>
        {t('sbcpages.retry')}
      </button>
    </div>
  );
};

const Skeleton = () => (
  <div className="sbcp-skel" aria-busy="true">
    <span />
    <span />
    <span />
  </div>
);

function useDate() {
  const { lang } = useI18n();
  return (sec: number) => new Date(sec * 1000).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

function Crumbs({ navigate, name }: { navigate: Nav; name?: string }) {
  const { t } = useI18n();
  const go = (r: Route) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(r);
    window.scrollTo(0, 0);
  };
  return (
    <nav className="sbcp-crumbs" aria-label={t('sbcpages.crumbs')}>
      <a href="/" onClick={go({ view: 'landing' })}>
        FC Solver
      </a>
      <span aria-hidden="true">›</span>
      {name ? (
        <>
          <a href="/sbcs" onClick={go({ view: 'sbcHub' })}>
            SBCs
          </a>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{name}</span>
        </>
      ) : (
        <span aria-current="page">SBCs</span>
      )}
    </nav>
  );
}

function ItemRow({ item, navigate }: { item: SbcListItem; navigate: Nav }) {
  const { t } = useI18n();
  const date = useDate();
  const open = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate({ view: 'sbcPage', setId: item.id, slug: item.path.replace(/^\/sbcs\//, '').replace(/-\d+$/, '') });
    window.scrollTo(0, 0);
  };
  return (
    <li className="sbcp-item">
      <a href={item.path} onClick={open}>
        {item.name}
      </a>
      <span className="sbcp-sub">
        {item.expired ? t('sbcpages.expired') : item.endTime ? t('sbcpages.ends', { date: date(item.endTime) }) : null}
        {item.challenges > 0 && <> · {t('sbcpages.challenges', { count: item.challenges })}</>}
      </span>
      {item.rewards.length > 0 && <span className="sbcp-sub">{item.rewards.join(' · ')}</span>}
    </li>
  );
}

export function SbcHub({ navigate, signedIn }: { navigate: Nav; signedIn: boolean }) {
  const { t } = useI18n();
  const { data, error, retry } = useLoad(publicSbcs, 'hub');
  useEffect(() => {
    document.title = t('meta.sbcHub');
  }, [t]);
  const sets = data?.sets ?? [];
  const live = sets.filter((s) => !s.expired);
  const old = sets.filter((s) => s.expired);
  const list = (title: string, items: SbcListItem[]) =>
    items.length > 0 && (
      <section>
        <h2>{title}</h2>
        <ul className="sbcp-list">
          {items.map((s) => (
            <ItemRow key={s.id} item={s} navigate={navigate} />
          ))}
        </ul>
      </section>
    );
  return (
    <Shell navigate={navigate} signedIn={signedIn}>
      <article>
        <Crumbs navigate={navigate} />
        <h1>{t('sbcpages.hubTitle')}</h1>
        <p className="legal-intro">{t('sbcpages.hubIntro')}</p>
        {error ? <Failed retry={retry} /> : !data ? <Skeleton /> : sets.length === 0 ? <p>{t('sbcpages.empty')}</p> : (
          <>
            {list(t('sbcpages.live'), live)}
            {list(t('sbcpages.expiredList'), old)}
          </>
        )}
      </article>
    </Shell>
  );
}

function Challenge({ c }: { c: SbcChallengeView }) {
  const { t } = useI18n();
  return (
    <li className="sbcp-card">
      <h3>{c.name}</h3>
      {c.formation && (
        <p className="sbcp-sub">
          {t('sbcpages.formation')}: {formationLabel(c.formation)}
        </p>
      )}
      {c.requirements.length > 0 && (
        <>
          <h4>{t('sbcpages.requirements')}</h4>
          <ul>
            {c.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {c.rewards.length > 0 && (
        <p className="sbcp-reward">
          <strong>{t('sbcpages.rewards')}:</strong> {c.rewards.join(' · ')}
        </p>
      )}
    </li>
  );
}

export function SbcPage({ setId, navigate, signedIn }: { setId: number; navigate: Nav; signedIn: boolean }) {
  const { t } = useI18n();
  const date = useDate();
  const { data, error, retry } = useLoad(() => publicSbc(setId), setId);
  const set: SbcSetView | undefined = data?.set;
  useEffect(() => {
    if (error?.message === 'not found') navigate({ view: 'notFound', path: window.location.pathname }, true);
  }, [error, navigate]);
  useEffect(() => {
    if (!set) return;
    document.title = t('meta.sbcSet', { name: set.name });
    if (window.location.pathname !== set.path) history.replaceState(history.state, '', set.path + window.location.search + window.location.hash);
  }, [set, t]);
  if (error && error.message !== 'not found')
    return (
      <Shell navigate={navigate} signedIn={signedIn}>
        <Failed retry={retry} />
      </Shell>
    );
  if (!set)
    return (
      <Shell navigate={navigate} signedIn={signedIn}>
        <Skeleton />
      </Shell>
    );
  const repeat =
    set.repeatability === 'refresh' && set.repeats && set.refreshHours
      ? t('sbcpages.repeat.refresh', { n: set.repeats, h: set.refreshHours })
      : set.repeatability === 'once'
        ? t('sbcpages.repeat.once')
        : t('sbcpages.repeat.unlimited');
  const ctaPath = signedIn ? `/dashboard/sbc/${set.id}` : `/signin?next=${encodeURIComponent(`/dashboard/sbc/${set.id}`)}`;
  const solve = (e: MouseEvent) => {
    track('sbc_page_cta', { signed_in: yn(signedIn) });
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(signedIn ? { view: 'sbcs', setId: set.id, challengeId: null } : { view: 'signin', next: `/dashboard/sbc/${set.id}` });
    window.scrollTo(0, 0);
  };
  const toHub = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate({ view: 'sbcHub' });
    window.scrollTo(0, 0);
  };
  return (
    <Shell navigate={navigate} signedIn={signedIn}>
      <article>
        <Crumbs navigate={navigate} name={set.name} />
        <h1>{set.name} SBC</h1>
        {set.description && <p className="legal-intro">{set.description}</p>}
        <ul className="sbcp-chips">
          <li className={set.expired ? 'expired' : undefined}>{set.expired ? t('sbcpages.expired') : set.endTime ? t('sbcpages.ends', { date: date(set.endTime) }) : null}</li>
          <li>{repeat}</li>
          <li>{t('sbcpages.challenges', { count: set.challenges.length })}</li>
        </ul>
        {set.rewards.length > 0 && (
          <p>
            <strong>{t('sbcpages.rewards')}:</strong> {set.rewards.join(' · ')}
          </p>
        )}
        {set.stats && <p className="sbcp-stats">{t('sbcpages.stats', { count: set.stats.solvers, pct: set.stats.foundPct })}</p>}
        <p>
          {set.expired ? (
            <a className="step-action ghost-strong" href="/sbcs" onClick={toHub}>
              {t('sbcpages.seeLive')}
            </a>
          ) : (
            <a className="step-action primary" href={ctaPath} onClick={solve}>
              {t('sbcpages.cta')}
            </a>
          )}
        </p>
        <h2>{t('sbcpages.challengesTitle')}</h2>
        <ul className="sbcp-grid">
          {set.challenges.map((c) => (
            <Challenge key={c.id} c={c} />
          ))}
        </ul>
        <section>
          <h2>{t('sbcpages.howTitle', { name: set.name })}</h2>
          <p>{t('sbcpages.howBody', { name: set.name })}</p>
        </section>
      </article>
    </Shell>
  );
}
