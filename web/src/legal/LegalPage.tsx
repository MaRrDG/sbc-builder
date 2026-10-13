// /terms, /privacy, /cookies, /refunds: public for everyone, signed in or not, and not waiting for Clerk.
import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { routePath, type Route } from '../route';
import { linkTo } from './LegalLinks';
import { LEGAL, LEGAL_DOCS, UPDATED, type LegalDoc } from './docs';

export function LegalPage({ doc, navigate }: { doc: LegalDoc; navigate: (r: Route) => void }) {
  const { t, lang, setLang } = useI18n();
  const d = LEGAL[lang][doc];
  useEffect(() => {
    document.title = `${d.title} · FC Solver`;
  }, [d.title]);
  const go = linkTo(navigate);
  const updated = new Date(`${UPDATED}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="onboarding legal">
      <div className="brand onboarding-top">
        <a href="/" onClick={go({ view: 'landing' })} aria-label={t('top.home')}>
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
        </a>
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </div>
      <nav className="legal-nav" aria-label={t('legal.nav')}>
        {LEGAL_DOCS.map((k) => (
          <a key={k} href={`/${k}`} aria-current={k === doc ? 'page' : undefined} onClick={go({ view: 'legal', doc: k })}>
            {LEGAL[lang][k].title}
          </a>
        ))}
      </nav>
      <article>
        <h1>{d.title}</h1>
        <p className="legal-intro">{d.intro}</p>
        {d.sections.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>{s.h}</h2>
            {groups(s.p).map((g, i) =>
              Array.isArray(g) ? (
                <ul key={i}>
                  {g.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ) : (
                <p key={i}>{g}</p>
              ),
            )}
          </section>
        ))}
        <p className="muted legal-updated">{t('legal.updated', { date: updated })}</p>
      </article>
      <p>
        <a className="text" href={routePath({ view: 'landing' })} onClick={go({ view: 'landing' })}>
          {t('auth.publicHome')}
        </a>
      </p>
    </div>
  );
}

/** Paragraphs as they are; consecutive "- " lines become one list. */
function groups(ps: string[]): (string | string[])[] {
  const out: (string | string[])[] = [];
  for (const p of ps) {
    if (!p.startsWith('- ')) out.push(p);
    else if (Array.isArray(out.at(-1))) (out.at(-1) as string[]).push(p.slice(2));
    else out.push([p.slice(2)]);
  }
  return out;
}
