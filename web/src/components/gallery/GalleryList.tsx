import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Diamond, Flag, Medal, ShieldStar, Sparkle, Trophy } from '@phosphor-icons/react';
import type { GalleryGrade, GalleryResponse, GallerySetResult, Meta } from '../../api';
import { useI18n } from '../../i18n';
import { GRADE_ORDER, filterSort, type GalleryFilter, type GallerySort } from './gallery';

const CATEGORIES = ['all', 'league', 'club', 'nation', 'rarity', 'campaign'] as const;
const STATES = ['all', 'complete', 'incomplete'] as const;
const SORTS: GallerySort[] = ['score', 'progress', 'grade', 'name'];
const CATEGORY_ICON = { league: Trophy, club: ShieldStar, nation: Flag, rarity: Sparkle, campaign: Medal } as const;

// filters, sort and scroll survive opening a set and coming back (for this page load only)
let kept: { filter: GalleryFilter; sort: GallerySort; scroll: number } = {
  filter: { category: 'all', state: 'all', minGrade: null },
  sort: 'score',
  scroll: 0,
};

/** The set's crest in a bracket frame: club / league crest or rarity card art from EA, else an icon. */
export function SetCrest({ set, meta, size = 'md' }: { set: GallerySetResult; meta: Meta; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const base = `${meta.contentBase}/items/images`;
  const b = set.badge;
  const rarity = b?.kind === 'rarity' ? meta.rarities[b.id] : undefined;
  const src =
    !b || failed ? null
    : b.kind === 'club' ? `${base}/mobile/clubs/dark/${b.id}.png`
    : b.kind === 'league' ? `${base}/mobile/leagues/dark/${b.id}.png`
    : rarity ? `${base}/backgrounds/itemBGs/${rarity.guid}/cards_bg_e_1_${b.id}_${rarity.levels ? 3 : 0}.png`
    : null;
  const Icon = CATEGORY_ICON[set.category];
  return (
    <span className={`set-crest set-crest-${size}${b?.kind === 'rarity' ? ' is-card' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Icon weight="duotone" />}
    </span>
  );
}

/** Five grade badges D..S: reached ones tinted, the current one solid, the rest dimmed; letters always shown. */
export function GradeBadges({ set }: { set: GallerySetResult }) {
  const { t } = useI18n();
  const at = set.grade ? GRADE_ORDER.indexOf(set.grade) : -1;
  return (
    <span className="grade-badges" role="img" aria-label={set.grade ? t('gallery.grade', { g: set.grade }) : t('gallery.noGrade')}>
      {GRADE_ORDER.map((g, i) => (
        <span key={g} className={`grade-hex${i < at ? ' met' : ''}${i === at ? ' current' : ''}`} aria-hidden="true">
          {g}
        </span>
      ))}
    </span>
  );
}

/** Score toward the next grade (or S): "score / threshold" and a bar; green only once S is reached. */
export function GradeBar({ set }: { set: GallerySetResult }) {
  const { t, lang } = useI18n();
  const fmt = (n: number) => n.toLocaleString(lang);
  const target = set.next ? set.grades[set.next.grade] : set.grades.S;
  const share = target > 0 ? Math.min(1, set.score / target) : 1;
  const done = set.missing === 0 && !set.next;
  return (
    <span className="grade-progress">
      <span className="grade-score">
        <span className="sr-only">{t('gallery.score')} </span>
        <Diamond weight="fill" aria-hidden="true" />
        <strong>{fmt(set.score)}</strong> / {fmt(target)}
      </span>
      <span className={`grade-track${done ? ' done' : ''}`} aria-hidden="true">
        <span className="grade-fill" style={{ width: `${share * 100}%` }} />
      </span>
    </span>
  );
}

export function GradePill({ grade }: { grade: GalleryGrade | null }) {
  const { t } = useI18n();
  return <span className={`grade-pill${grade ? ' met' : ''}`}>{grade ? t('gallery.grade', { g: grade }) : t('gallery.noGrade')}</span>;
}

/** What the set still needs, in words. */
export function setNote(set: GallerySetResult, t: (k: string, p?: Record<string, string | number>) => string, lang: string) {
  if (set.missing) return `${t('gallery.slots', { filled: set.filled, size: set.size })} · ${t('gallery.missing', { count: set.missing })}`;
  if (set.next) return t('gallery.toNext', { need: set.next.need.toLocaleString(lang), g: set.next.grade });
  return t('gallery.best');
}

/** Every Gallery set as a tile with its crest and the best grade the recorded players reach. */
export function GalleryList({ data, meta, onOpen }: { data: GalleryResponse; meta: Meta; onOpen: (setId: string) => void }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<GalleryFilter>(kept.filter);
  const [sort, setSort] = useState<GallerySort>(kept.sort);
  useEffect(() => {
    kept = { ...kept, filter, sort };
  }, [filter, sort]);
  useEffect(() => {
    window.scrollTo({ top: kept.scroll });
  }, []);
  const open = (id: string) => {
    kept = { ...kept, scroll: window.scrollY };
    onOpen(id);
  };
  const shown = useMemo(() => filterSort(data.sets, filter, sort), [data.sets, filter, sort]);
  return (
    <div className="gallery-view">
      <header className="page-head">
        <div>
          <h1>{t('gallery.title')}</h1>
          <p className="muted">{t('gallery.lede')}</p>
        </div>
      </header>
      <p className="gallery-history">
        <strong>{t('gallery.seen', { count: data.ledgerSize })}</strong>
        <span className="muted">{t('gallery.historyNote')}</span>
      </p>

      <div className="gallery-tools">
        <label className="sort">
          <span>{t('gallery.filter.category')}</span>
          <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value as GalleryFilter['category'] })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`gallery.cat.${c}`)}</option>
            ))}
          </select>
        </label>
        <label className="sort">
          <span>{t('gallery.filter.state')}</span>
          <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value as GalleryFilter['state'] })}>
            {STATES.map((s) => (
              <option key={s} value={s}>{t(`gallery.state.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="sort">
          <span>{t('gallery.filter.minGrade')}</span>
          <select
            value={filter.minGrade ?? ''}
            onChange={(e) => setFilter({ ...filter, minGrade: (e.target.value || null) as GalleryGrade | null })}
          >
            <option value="">{t('gallery.cat.all')}</option>
            {GRADE_ORDER.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="sort gallery-sort">
          <span>{t('gallery.sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as GallerySort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>{t(`gallery.sort.${s}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="muted">{t('gallery.empty')}</p>
      ) : (
        <ul className="gallery-grid">
          {shown.map((s) => {
            const done = s.missing === 0 && !s.next;
            return (
              <li key={s.id}>
                <button type="button" className={`gallery-tile${s.missing ? ' incomplete' : ''}`} onClick={() => open(s.id)}>
                  <span className="gallery-tile-top">
                    <SetCrest set={s} meta={meta} />
                    <span className="gallery-tile-title">
                      <span className="gallery-name">{s.name}</span>
                      <span className="gallery-cat muted">{t(`gallery.cat.${s.category}`)}</span>
                    </span>
                    {done ? (
                      <CheckCircle className="gallery-done" weight="fill" aria-hidden="true" />
                    ) : (
                      <span className="gallery-done ring" aria-hidden="true" />
                    )}
                  </span>
                  <GradeBadges set={s} />
                  <GradeBar set={s} />
                  <span className="gallery-note">{setNote(s, t, lang)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
