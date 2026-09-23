// Landing motion helpers. useInView and useTilt do nothing under prefers-reduced-motion (the CSS then shows the final state).
import { useEffect, useState, type RefObject } from 'react';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n: number) => Math.max(-0.5, Math.min(0.5, n));

/** True once the element has been on screen in a visible tab (lets its motion play once); stays true.
 *  Reduced motion or no IntersectionObserver: true at once (the CSS then shows the final state). */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      setSeen(true);
      return;
    }
    // "Seen" also when the element is already above the viewport (an anchor jump past it, a reload
    // mid-page): otherwise content scrolled past without intersecting would never show its final state.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting || e.boundingClientRect.bottom < 0) {
          // a hidden tab would hold the motion on its first frame; there the final state just stays
          if (document.visibilityState === 'visible') setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return seen;
}

/** Pointer tilt: sets --rx / --ry (deg) on the element, once per frame. Off for touch and reduced motion. */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 7) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    const set = (x: number, y: number) => {
      el.style.setProperty('--rx', `${(x * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(-y * max).toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        set(clamp((e.clientX - r.left) / r.width - 0.5), clamp((e.clientY - r.top) / r.height - 0.5));
      });
    };
    const onLeave = () => set(0, 0);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, max]);
}

/** Index of the element crossing the middle band of the viewport (the step "in focus"). Starts at 0. */
export function useActiveIndex(refs: RefObject<(Element | null)[]>): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = (refs.current ?? []).filter((e): e is Element => !!e);
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(els.indexOf(e.target));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [refs]);
  return active;
}
