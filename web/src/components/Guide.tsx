import { ArrowRight, ArrowsLeftRight, Browser, Cloud, PuzzlePiece, Lightning } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

interface Props {
  clubSyncs: number;
  eaLimit: number;
}

/** "How it works": the extension, its link with the web app, statuses, data freshness, limits. */
export function Guide({ clubSyncs, eaLimit }: Props) {
  const { t } = useI18n();
  return (
    <article className="howto">
      <header className="page-head">
        <div>
          <h1>{t('guide.title')}</h1>
          <p className="muted">{t('guide.lede')}</p>
        </div>
      </header>

      <section className="howto-card">
        <h2>{t('guide.flowTitle')}</h2>
        <div className="flow" role="img" aria-label={t('guide.flowCaption')}>
          <div className="flow-node flow-ea">
            <Cloud weight="bold" aria-hidden="true" />
            {t('guide.flowEa')}
          </div>
          <ArrowsLeftRight className="flow-arrow" weight="bold" aria-hidden="true" />
          <div className="flow-group">
            <span className="flow-group-label">{t('guide.flowBrowser')}</span>
            <div className="flow-node">
              <Browser weight="bold" aria-hidden="true" />
              {t('guide.flowWebApp')}
            </div>
            <ArrowsLeftRight className="flow-arrow" weight="bold" aria-hidden="true" />
            <div className="flow-node">
              <PuzzlePiece weight="bold" aria-hidden="true" />
              {t('guide.flowExt')}
            </div>
          </div>
          <ArrowRight className="flow-arrow" weight="bold" aria-hidden="true" />
          <div className="flow-node flow-server">
            <Lightning weight="fill" aria-hidden="true" />
            {t('guide.flowServer')}
          </div>
        </div>
        <p className="muted">{t('guide.flowCaption')}</p>
      </section>

      <div className="howto-grid">
        <section className="howto-card">
          <h2>{t('guide.extTitle')}</h2>
          <ul className="howto-list">
            <li>{t('guide.ext1')}</li>
            <li>{t('guide.ext2')}</li>
            <li>{t('guide.ext3')}</li>
          </ul>
        </section>

        <section className="howto-card">
          <h2>{t('guide.statusTitle')}</h2>
          <ul className="status-legend">
            <li>
              <span className="st-dot st-live" aria-hidden="true" />
              {t('guide.green')}
            </li>
            <li>
              <span className="st-dot st-busy" aria-hidden="true" />
              {t('guide.yellow')}
            </li>
            <li>
              <span className="st-dot st-off" aria-hidden="true" />
              {t('guide.red')}
            </li>
          </ul>
        </section>

        <section className="howto-card">
          <h2>{t('guide.dataTitle')}</h2>
          <ul className="howto-list">
            <li>{t('guide.dataClub', { n: clubSyncs })}</li>
            <li>{t('guide.dataSbc')}</li>
            <li>{t('guide.dataSquad')}</li>
            <li>{t('guide.dataMoves')}</li>
          </ul>
        </section>

        <section className="howto-card">
          <h2>{t('guide.limitsTitle')}</h2>
          <ul className="howto-list">
            <li>{t('guide.limits1', { n: eaLimit })}</li>
            <li>{t('guide.limits2')}</li>
            <li>{t('guide.limits3')}</li>
          </ul>
        </section>

        <section className="howto-card">
          <h2>{t('guide.solveTitle')}</h2>
          <ul className="howto-list">
            <li>{t('guide.solve1')}</li>
            <li>{t('guide.solve2')}</li>
            <li>{t('guide.solve3')}</li>
          </ul>
        </section>

        <section className="howto-card">
          <h2>{t('guide.faqTitle')}</h2>
          <dl className="howto-faq">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <dt>{t(`guide.faq${i}q`)}</dt>
                <dd>{t(`guide.faq${i}a`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </article>
  );
}
