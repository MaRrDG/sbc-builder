import { ArrowLeft, CheckCircle, Circle, ClockCounterClockwise, Crown, House } from '@phosphor-icons/react';
import { useEffect } from 'react';
import type { GallerySetResult, Meta } from '../../api';
import { useI18n } from '../../i18n';
import { Card, EmptyCard } from '../Card';
import { GRADE_ORDER } from './gallery';
import { GradeBadges, GradeBar, GradePill, SetCrest, setNote } from './GalleryList';

/** One Gallery set: the best lineup from recorded players, its score, grades and bonus tags. */
export function GallerySet({ set, meta, onBack }: { set: GallerySetResult; meta: Meta; onBack: () => void }) {
  const { t, lang } = useI18n();
  const fmt = (n: number) => n.toLocaleString(lang);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [set.id]);
  return (
    <div className="gallery-view gallery-set">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" /> {t('gallery.back')}
      </button>
      <header className="gallery-hero">
        <SetCrest set={set} meta={meta} size="lg" />
        <div className="gallery-hero-head">
          <div className="gallery-hero-title">
            <span className="gallery-cat">{t(`gallery.cat.${set.category}`)}</span>
            <h1>{set.name}</h1>
          </div>
          <GradePill grade={set.grade} />
        </div>
        <div className="gallery-hero-grades">
          <GradeBadges set={set} />
          <GradeBar set={set} />
          <p className="gallery-note">{setNote(set, t, lang)}</p>
        </div>
        <p className="gallery-breakdown">
          {t('gallery.score')}: {t('gallery.base')} {fmt(set.base)} + {t('gallery.bonus')} {fmt(set.bonus)}
        </p>
      </header>

      <div className="gallery-set-body">
        <section className="gallery-lineup-wrap">
          <ul className="gallery-lineup">
            {set.lineup.map((p) => (
              <li key={p.id}>
                <Card player={p} meta={meta} size="sm" />
                <span className="gallery-item-score">{fmt(p.score)}</span>
                <span className={`own-tag ${p.inClub ? 'in' : 'out'}`}>
                  {p.inClub ? <House aria-hidden="true" /> : <ClockCounterClockwise aria-hidden="true" />}
                  {p.inClub ? t('gallery.inClub') : t('gallery.ownedBefore')}
                </span>
                {p.firstOwner && (
                  <span className="fo-badge">
                    <Crown weight="fill" aria-hidden="true" /> {t('gallery.firstOwner')}
                  </span>
                )}
              </li>
            ))}
            {[...Array(set.missing)].map((_, k) => (
              <li key={`e${k}`}>
                <EmptyCard size="sm" />
              </li>
            ))}
          </ul>
        </section>

        <div className="gallery-side">
          <section className="settings-card">
            <h2>{t('gallery.thresholds')}</h2>
            <table className="gallery-grades">
              <tbody>
                {GRADE_ORDER.map((g) => {
                  const need = set.grades[g];
                  const met = set.missing === 0 && set.score >= need;
                  return (
                    <tr key={g} className={met ? 'met' : undefined}>
                      <th scope="row">{g}</th>
                      <td className="num">{fmt(need)}</td>
                      <td className="reward">{set.rewards[g] ?? ''}</td>
                      <td className="state">
                        {met ? (
                          <>
                            <CheckCircle weight="fill" aria-hidden="true" /> {t('gallery.reached')}
                          </>
                        ) : (
                          <>
                            <Circle weight="bold" aria-hidden="true" />{' '}
                            {set.score >= need ? t('gallery.missing', { count: set.missing }) : t('gallery.toNext', { need: fmt(need - set.score), g })}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="settings-card">
            <h2>{t('gallery.tags')}</h2>
            {set.tags.length === 0 ? (
              <p className="muted">{t('gallery.noTags')}</p>
            ) : (
              <ul className="gallery-tags">
                {/* met first (server order), then the unmet ones with the tier they need */}
                {set.tags.map((tag) => {
                  const met = tag.pct > 0;
                  return (
                    <li key={tag.id} className={met ? 'met' : 'unmet'}>
                      {met ? (
                        <CheckCircle weight="fill" aria-hidden="true" />
                      ) : (
                        <Circle weight="bold" aria-hidden="true" />
                      )}
                      <span>
                        <strong>{t(`gallery.tag.${tag.id}`)}</strong>
                        <span className="muted">
                          <span className="sr-only">{met ? t('gallery.tagMet') : t('gallery.tagUnmet')}: </span>
                          {met
                            ? t('gallery.tagLine', { count: tag.count, pct: tag.pct })
                            : tag.next && t('gallery.tagNext', { count: tag.count, min: tag.next.min, pct: tag.next.pct })}
                        </span>
                      </span>
                      <span className="num">+{fmt(tag.bonus)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
