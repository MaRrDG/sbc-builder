// "Back to top": a small fixed button that shows once the hero has left the viewport
// and no page button is under it (IntersectionObserver, no scroll listener). Inert while hidden,
// so it is never tabbed to unseen.
import { useEffect, useState } from 'react';
import { ArrowUp } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

/** `ctaKey` changes when the page buttons are re-rendered as new elements (auth settled), so they are observed again. */
export function ToTop({ ctaKey }: { ctaKey: string }) {
  const { t } = useI18n();
  const [pastHero, setPastHero] = useState(false);
  const [overCta, setOverCta] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('.lp-hero');
    if (!hero || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting));
    io.observe(hero);
    // step aside while a page button passes through the bottom band the button sits in
    // (on phones the plan buttons span the full width)
    const near = new Set<Element>();
    const band = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) near.add(e.target);
          else near.delete(e.target);
        }
        setOverCta(near.size > 0);
      },
      { rootMargin: '-86% 0px 0px 0px' },
    );
    document.querySelectorAll('main .lp-btn').forEach((b) => band.observe(b));
    return () => {
      io.disconnect();
      band.disconnect();
    };
  }, [ctaKey]);
  const shown = pastHero && !overCta;
  const up = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // keyboard users continue from the top of the page, not from the now hidden button
    document.querySelector<HTMLElement>('.lp-skip')?.focus({ preventScroll: true });
  };
  return (
    <button type="button" className={`lp-totop${shown ? ' on' : ''}`} inert={!shown} aria-label={t('landing.toTop')} onClick={up}>
      <ArrowUp weight="bold" aria-hidden="true" />
    </button>
  );
}
