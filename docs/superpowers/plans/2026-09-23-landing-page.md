# Landing Page + App under /dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, animated landing page at `/` that explains FC Solver and its three advantages, with the signed-in app moved to `/dashboard`.

**Architecture:** `route.ts` gains a `landing` view and a `/dashboard` prefix for app screens (old paths still parse and get rewritten). `Root.tsx` renders the lazy `landing/Landing.tsx` for everyone on `/` without waiting for Clerk. The landing is plain React + one CSS file; depth comes from CSS 3D transforms, motion from CSS scroll-driven animations (`animation-timeline`) with a load-time fallback, `IntersectionObserver` for section reveals and one rAF pointer-tilt hook. No new dependencies.

**Tech Stack:** React 19, Vite 8, TypeScript, plain CSS (OKLCH tokens in `web/src/styles.css`), `@phosphor-icons/react`, `node:test` via `npm test`.

**Spec:** `docs/superpowers/specs/2026-09-23-landing-page-design.md`

## Global Constraints

- No new npm dependencies.
- Colors only from existing tokens: `--bg-0`, `--surface`, `--surface-2`, `--surface-3`, `--line`, `--pitch-a`, `--pitch-b`, `--pitch-line`, `--ink`, `--ink-2`, `--ink-3`, `--go`/`--go-ink` (primary CTA, met ticks, selected toggle ONLY), `--pos` (position pills ONLY), `--bad` (not used on the landing).
- Anti-slop: no purple/blue gradients, no glassmorphism cards, no hero-metric tiles, no emoji, no "✨ AI-powered" copy, no generic stock illustrations. Real FUT card art only.
- Display type Barlow Condensed (`--font-num`), UI text Geist (`--font-ui`). Controls `var(--r-ctl)` 8px, containers `var(--r-box)` 14px.
- Animate only `transform`, `translate`, `opacity` and registered custom properties. `prefers-reduced-motion: reduce` → no animation, final state shown.
- Every string through `t()`; keys in `web/src/locales/en.ts` AND `ro.ts` (same keys, same `{params}`); `npm run i18n:check` must pass. EA names (players, clubs, leagues, nations) stay as EA sends them.
- Works at 390px width with 16px gutters and no horizontal scroll; under 860px the landing top bar hides the section anchors.
- Requirement state never by color alone (✓ glyph + text).
- Pricing: Free = "a limited number of SBCs" (no number). Pro = €5 / month, or €3 / month billed yearly (€36). Pro button disabled, "Coming soon". No billing code.
- Commits: conventional `type(scope): subject`, `git pull --rebase` first, never push.
- Spec amendment: the landing top bar does not use the app hamburger; under 860px it simply hides the anchors (logo, language, CTA stay).

---

## File map

| File | Responsibility |
|---|---|
| `web/src/route.ts` (modify) | `landing` view, `/dashboard` paths, `canonicalPath()` for old URLs |
| `web/src/route.test.ts` (create) | parse / path / canonical tests |
| `web/src/next.ts` + `next.test.ts` (modify) | post-sign-in fallback `/dashboard` |
| `web/src/Root.tsx` (modify) | render Landing on `/`, SSO + sign-in defaults to `/dashboard` |
| `web/src/App.tsx:455` (modify) | brand link → `/dashboard` |
| `web/src/landing/Landing.tsx` (create) | page shell: top bar, sections, footer, CTA logic |
| `web/src/landing/Hero.tsx` (create) | 3D pitch hero |
| `web/src/landing/Pillars.tsx` (create) | three advantage rows + their scenes |
| `web/src/landing/Steps.tsx` (create) | three steps |
| `web/src/landing/Pricing.tsx` (create) | Free / Pro with monthly-yearly toggle |
| `web/src/landing/Faq.tsx` (create) | `<details>` FAQ |
| `web/src/landing/pricing.ts` + `pricing.test.ts` (create) | pure price math + EUR formatting |
| `web/src/landing/motion.ts` (create) | `useInView`, `useTilt` |
| `web/src/landing/demo.ts` (create) | static demo squad + minimal `Meta` |
| `web/src/landing/landing.css` (create) | all landing styles (lazy chunk) |
| `web/public/landing/items/images/...` (create) | self-hosted demo card art (no EA hotlinking from a public page) |
| `web/src/locales/en.ts`, `ro.ts` (modify) | `landing.*` keys |
| `docs/architecture.md:123`, `CLAUDE.md` (modify) | routes + layout |

---

### Task 1: Foundations — price math, motion hooks, demo squad art

**Files:**
- Create: `web/src/landing/pricing.ts`, `web/src/landing/pricing.test.ts`, `web/src/landing/motion.ts`, `web/src/landing/demo.ts`
- Create: `web/public/landing/items/images/**` (downloaded PNGs)

**Interfaces:**
- Produces:
  - `type Billing = 'monthly' | 'yearly'`
  - `proPrice(b: Billing): { perMonth: number; billed: number }`
  - `yearlySaving(): number` (24)
  - `formatEur(n: number, lang: string): string`
  - `useInView(ref: RefObject<Element | null>): boolean`
  - `useTilt(ref: RefObject<HTMLElement | null>, max?: number): void` (writes `--rx`, `--ry` on the element)
  - `DEMO_META: Meta`, `DEMO_SQUAD: Player[]` (7 players, order: ST Undav, RW Saka, LM Kelly, CAM Dybala, CAM Weir, CB Cubarsí, GK Carnesecchi)

- [ ] **Step 1: Write the failing test**

`web/src/landing/pricing.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEur, proPrice, yearlySaving } from './pricing.js';

test('pro is 5 a month, or 3 a month billed 36 a year', () => {
  assert.deepEqual(proPrice('monthly'), { perMonth: 5, billed: 5 });
  assert.deepEqual(proPrice('yearly'), { perMonth: 3, billed: 36 });
  assert.equal(yearlySaving(), 24);
});

test('formatEur follows the site language, no decimals', () => {
  assert.equal(formatEur(5, 'en'), '€5');
  assert.match(formatEur(36, 'ro'), /^36\s€$/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL, cannot find module `./pricing.js`.

- [ ] **Step 3: Implement `pricing.ts`**

```ts
// Pro pricing shown on the landing page. Display only: billing does not exist yet.
export type Billing = 'monthly' | 'yearly';

const MONTHLY = 5;
const YEARLY_PER_MONTH = 3;

export function proPrice(b: Billing): { perMonth: number; billed: number } {
  return b === 'monthly' ? { perMonth: MONTHLY, billed: MONTHLY } : { perMonth: YEARLY_PER_MONTH, billed: YEARLY_PER_MONTH * 12 };
}

/** What a year costs less when paid yearly. */
export const yearlySaving = () => MONTHLY * 12 - YEARLY_PER_MONTH * 12;

export const formatEur = (n: number, lang: string) =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass, including the two new tests.

- [ ] **Step 5: Implement `motion.ts`**

```ts
// Landing motion helpers. Both do nothing under prefers-reduced-motion (the CSS then shows the final state).
import { useEffect, useState, type RefObject } from 'react';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n: number) => Math.max(-0.5, Math.min(0.5, n));

/** True once the element has been on screen; stays true. Reduced motion or no IntersectionObserver: true at once. */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !('IntersectionObserver' in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
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
```

- [ ] **Step 6: Download the demo card art (once, committed)**

The public page must not hotlink EA (be gentle with EA, and the content GUID can change). Mirror the paths `cardArt()` in `web/src/components/Card.tsx:8-21` builds, under `contentBase = '/landing'`:
```bash
B='https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E/2027/fut/items/images'
D=web/public/landing/items/images
get() { curl -sf --create-dirs -o "$D/$1" "$B/$1" || echo "FAILED $1"; }
for id in 244176 246669 257001 211110 245879 278046 252154; do get mobile/portraits/$id.png; done
for id in 14 45 27 42 52 21; do get mobile/flags/dark/$id.png; done
for id in 13 2216 53 31 19 2218; do get mobile/leagues/dark/$id.png; done
for id in 1 116009 241 115845 116033 52 36; do get mobile/clubs/dark/$id.png; done
get backgrounds/itemBGs/929f3299-a61e-4ff1-abda-7663f1c835db/cards_bg_e_1_0_3.png
find $D -type f | wc -l
```
Expected: no `FAILED` lines, `27` files. If the GUID 404s, read the current one from the running server (`server/ea.ts` `content.guid`) and retry.

- [ ] **Step 7: Implement `demo.ts`**

```ts
// A fixed example squad for the landing page (no account, no API). Art is self-hosted under
// web/public/landing, in the same folder layout Card's cardArt() builds from contentBase.
import type { Meta, Player } from '../api';

export const DEMO_META: Meta = {
  names: {
    nation: { 14: 'England', 45: 'Spain', 27: 'Italy', 42: 'Scotland', 52: 'Argentina', 21: 'Germany' },
    league: { 13: 'Premier League', 2216: 'Barclays Women’s Super League', 53: 'LALIGA EA SPORTS', 31: 'Serie A Enilive', 19: 'Bundesliga', 2218: 'Arkema Première Ligue' },
    club: { 1: 'Arsenal', 116009: 'Arsenal', 241: 'FC Barcelona', 115845: 'Bergamo Calcio', 116033: 'OL Lyonnes', 52: 'AS Roma', 36: 'VfB Stuttgart' },
    rarity: { 0: 'Common' },
  },
  formations: {},
  rarities: {
    0: {
      guid: '929f3299-a61e-4ff1-abda-7663f1c835db',
      levels: true,
      colors: [4073500, 15115371, 10249286, 1975594, 12698831, 5662576, 2958352, 14794333, 9073730],
      lgColorIndices: [1, 1, 1, 1, 1, 1, 2, 3, 1],
    },
  },
  contentBase: '/landing',
};

const p = (assetId: number, name: string, fullName: string, rating: number, pos: string, possible: string[], club: number, league: number, nation: number): Player => ({
  id: assetId, assetId, resourceId: assetId, name, fullName, rating, rareflag: 0, tier: 3,
  preferredPosition: pos, possiblePositions: possible, club, league, nation,
  untradeable: true, state: 'free', isLoan: false, rarityName: 'Gold', attributes: [], skillMoves: 3, weakFoot: 3, foot: 'Right',
});

export const DEMO_SQUAD: Player[] = [
  p(244176, 'Undav', 'Deniz Undav', 85, 'ST', ['ST', 'CAM'], 36, 19, 21),
  p(246669, 'Saka', 'Bukayo Saka', 87, 'RW', ['RW', 'RM'], 1, 13, 14),
  p(257001, 'Kelly', 'Chloe Kelly', 86, 'LM', ['LM', 'RM', 'LW', 'RW'], 116009, 2216, 14),
  p(211110, 'Dybala', 'Paulo Dybala', 85, 'CAM', ['CAM', 'ST'], 52, 31, 52),
  p(245879, 'Weir', 'Caroline Weir', 86, 'CAM', ['CAM', 'CM', 'CDM'], 116033, 2218, 42),
  p(278046, 'Pau Cubarsí', 'Pau Cubarsí', 86, 'CB', ['CB'], 241, 53, 45),
  p(252154, 'Carnesecchi', 'Marco Carnesecchi', 86, 'GK', ['GK'], 115845, 31, 27),
];
```

- [ ] **Step 8: Typecheck + commit**

Run: `npm run typecheck && npm test`
Expected: both pass. (`i18n:check` not affected yet.)
```bash
git pull --rebase
git add web/src/landing web/public/landing
git commit -m "feat(landing): price math, motion hooks and demo squad art"
```

---

### Task 2: Routing — landing at `/`, app under `/dashboard`, landing shell

**Files:**
- Modify: `web/src/route.ts` (whole file, 60 lines)
- Create: `web/src/route.test.ts`
- Modify: `web/src/next.ts`, `web/src/next.test.ts`
- Modify: `web/src/Root.tsx:14-16,34,51-53,63,70`, `web/src/App.tsx:455`
- Create: `web/src/landing/Landing.tsx`, `web/src/landing/landing.css`
- Modify: `web/src/locales/en.ts`, `web/src/locales/ro.ts` (append a `// landing` group before the closing `};`)

**Interfaces:**
- Consumes: nothing from Task 1 except `landing.css` living next to it.
- Produces:
  - `Route` gains `{ view: 'landing' }`
  - `canonicalPath(r: Route, pathname: string): string | null`
  - `default export Landing({ signedIn, navigate }: { signedIn: boolean; navigate: (r: Route, replace?: boolean) => void })`
  - Landing section ids: `#why`, `#how`, `#pricing`, `#faq` (Tasks 3–5 render into them)
  - CSS helpers in `landing.css`: `.lp-btn` (primary, `--go`), `.lp-btn.ghost-lp` (secondary), `.lp-section`, `.lp-h2`, `.lp-kicker`, `.lp-lede`, `.lp-reveal` + `.is-in`

- [ ] **Step 1: Write the failing route tests**

`web/src/route.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPath, parseRoute, routePath, type Route } from './route.js';

test('root is the landing page, the app lives under /dashboard', () => {
  assert.deepEqual(parseRoute('/'), { view: 'landing' });
  assert.deepEqual(parseRoute('/dashboard'), { view: 'sbcs', setId: null, challengeId: null });
  assert.deepEqual(parseRoute('/dashboard/sbc/16/39'), { view: 'sbcs', setId: 16, challengeId: 39 });
  assert.deepEqual(parseRoute('/dashboard/club'), { view: 'club' });
  assert.deepEqual(parseRoute('/dashboard/admin'), { view: 'admin' });
});

test('old top-level app paths still parse', () => {
  assert.deepEqual(parseRoute('/sbc/16'), { view: 'sbcs', setId: 16, challengeId: null });
  assert.deepEqual(parseRoute('/club'), { view: 'club' });
  assert.deepEqual(parseRoute('/settings'), { view: 'settings' });
});

test('routePath round-trips', () => {
  const routes: Route[] = [
    { view: 'landing' },
    { view: 'sbcs', setId: null, challengeId: null },
    { view: 'sbcs', setId: 16, challengeId: null },
    { view: 'sbcs', setId: 16, challengeId: 39 },
    { view: 'club' }, { view: 'settings' }, { view: 'admin' }, { view: 'setup' }, { view: 'guide' },
  ];
  for (const r of routes) assert.deepEqual(parseRoute(routePath(r)), r, routePath(r));
  assert.equal(routePath({ view: 'sbcs', setId: 16, challengeId: 39 }), '/dashboard/sbc/16/39');
  assert.equal(routePath({ view: 'setup' }), '/setup');
});

test('canonicalPath rewrites old app URLs only', () => {
  assert.equal(canonicalPath(parseRoute('/club'), '/club'), '/dashboard/club');
  assert.equal(canonicalPath(parseRoute('/sbc/16/39'), '/sbc/16/39'), '/dashboard/sbc/16/39');
  assert.equal(canonicalPath(parseRoute('/dashboard/club'), '/dashboard/club'), null);
  assert.equal(canonicalPath(parseRoute('/'), '/'), null);
  assert.equal(canonicalPath(parseRoute('/signin', '?next=%2Fclub'), '/signin'), null);
});
```
And in `web/src/next.test.ts` change the refused-input test's expected value from `'/'` to `'/dashboard'`:
```ts
test('safeNext refuses anything else', () => {
  for (const bad of [null, undefined, '', 'club', '//evil.com', '/\\evil.com', 'https://evil.com', '/signin', '/signin/callback', ' /club'])
    assert.equal(safeNext(bad), '/dashboard', String(bad));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL (`canonicalPath` not exported, `/` parses as sbcs, safeNext returns `/`).

- [ ] **Step 3: Rewrite `web/src/route.ts`**

```ts
// Tiny router on the History API: the URL is the source of truth for which screen is open,
// so browser / mouse Back moves between screens instead of leaving the site.
//   /                     landing page (public)
//   /dashboard            SBC list          /dashboard/sbc/16      a set (first open challenge)
//   /dashboard/sbc/16/39  a challenge       /dashboard/club        club
//   /dashboard/settings   settings          /dashboard/admin       admin dashboard (admins only)
//   /setup                extension setup   /guide                 how it works
//   /signin               sign in (?next=)  /signin/callback       Google redirect
// Old app paths without /dashboard (/sbc/16, /club, ...) still parse; useRoute rewrites the address bar.
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { view: 'landing' }
  | { view: 'sbcs'; setId: number | null; challengeId: number | null }
  | { view: 'club' }
  | { view: 'settings' }
  | { view: 'setup' }
  | { view: 'guide' }
  | { view: 'admin' }
  | { view: 'signin'; next: string }
  | { view: 'ssoCallback' };

const id = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

export function parseRoute(path: string, search = ''): Route {
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  if (a === undefined) return { view: 'landing' };
  if (a === 'signin') return b === 'callback' ? { view: 'ssoCallback' } : { view: 'signin', next: new URLSearchParams(search).get('next') ?? '/dashboard' };
  if (a === 'setup') return { view: 'setup' };
  if (a === 'guide') return { view: 'guide' };
  const [x, y, z] = a === 'dashboard' ? parts.slice(1) : parts;
  if (x === 'club') return { view: 'club' };
  if (x === 'settings') return { view: 'settings' };
  if (x === 'admin') return { view: 'admin' };
  if (x === 'sbc' && id(y) !== null) return { view: 'sbcs', setId: id(y), challengeId: id(z) };
  return { view: 'sbcs', setId: null, challengeId: null };
}

export function routePath(r: Route): string {
  switch (r.view) {
    case 'landing':
      return '/';
    case 'signin':
      return r.next && r.next !== '/dashboard' ? `/signin?next=${encodeURIComponent(r.next)}` : '/signin';
    case 'ssoCallback':
      return '/signin/callback';
    case 'setup':
    case 'guide':
      return `/${r.view}`;
    case 'club':
    case 'settings':
    case 'admin':
      return `/dashboard/${r.view}`;
    case 'sbcs':
      if (r.setId === null) return '/dashboard';
      return r.challengeId === null ? `/dashboard/sbc/${r.setId}` : `/dashboard/sbc/${r.setId}/${r.challengeId}`;
  }
}

/** Where the address bar should be for this route, or null when it already is (sign-in keeps its query). */
export function canonicalPath(r: Route, pathname: string): string | null {
  if (r.view === 'signin' || r.view === 'ssoCallback') return null;
  const want = routePath(r);
  return want === pathname ? null : want;
}

const here = (): Route => {
  const r = parseRoute(window.location.pathname, window.location.search);
  const fixed = canonicalPath(r, window.location.pathname);
  if (fixed) history.replaceState(history.state, '', fixed + window.location.search);
  return r;
};

/** Current route plus navigate(route, replace?). Back / Forward update it through popstate. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));

  useEffect(() => {
    here(); // old bookmark (/club, /sbc/16) → /dashboard/...
    const onPop = () => setRoute(here());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== window.location.pathname + window.location.search) {
      // query strings like ?update=1 only matter on arrival
      // entries we push are marked, so "close" can go back only when the previous page is ours
      if (replace) history.replaceState(history.state, '', path);
      else history.pushState({ fcSolver: true }, '', path);
    }
    setRoute(r);
  }, []);

  return [route, navigate];
}

/** True when Back would stay inside FC Solver. */
export const canGoBack = () => !!(history.state as { fcSolver?: boolean } | null)?.fcSolver;
```
Note: the old `signin` default `next` was `'/'`; it is now `'/dashboard'`.

- [ ] **Step 4: Update `web/src/next.ts`**

```ts
/** Where to go after signing in: only a path on this site, never back to the sign-in screen. Default: the app. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !/^\/(?![/\\])\S*$/.test(raw)) return '/dashboard';
  if (raw === '/signin' || raw.startsWith('/signin/') || raw.startsWith('/signin?')) return '/dashboard';
  return raw;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Add the shell's i18n keys**

Append to `web/src/locales/en.ts` (inside the object, as a new `// landing` group):
```ts
  // landing page (/)
  'landing.skip': 'Skip to content',
  'landing.nav.label': 'Sections',
  'landing.nav.why': 'Why FC Solver',
  'landing.nav.how': 'How it works',
  'landing.nav.pricing': 'Pricing',
  'landing.nav.faq': 'FAQ',
  'landing.signIn': 'Sign in',
  'landing.start': 'Start free',
  'landing.open': 'Open dashboard',
  'landing.footer.legal': 'FC Solver is not affiliated with or endorsed by Electronic Arts. EA SPORTS FC, Ultimate Team and the card art belong to EA.',
  'landing.footer.setup': 'Setup guide',
  'landing.footer.guide': 'How it works',
```
Append to `web/src/locales/ro.ts`:
```ts
  // landing page (/)
  'landing.skip': 'Sari la conținut',
  'landing.nav.label': 'Secțiuni',
  'landing.nav.why': 'De ce FC Solver',
  'landing.nav.how': 'Cum funcționează',
  'landing.nav.pricing': 'Prețuri',
  'landing.nav.faq': 'Întrebări',
  'landing.signIn': 'Intră în cont',
  'landing.start': 'Începe gratuit',
  'landing.open': 'Deschide dashboard',
  'landing.footer.legal': 'FC Solver nu este afiliat cu Electronic Arts și nu este susținut de EA. EA SPORTS FC, Ultimate Team și arta cardurilor aparțin EA.',
  'landing.footer.setup': 'Ghid de instalare',
  'landing.footer.guide': 'Cum funcționează',
```

- [ ] **Step 7: Create `web/src/landing/Landing.tsx` (shell)**

```tsx
// Public landing page (/): what FC Solver does and why it beats market-price solvers.
// Lazy-loaded by Root for everyone (signed in or not); the app itself lives under /dashboard.
import type { MouseEvent, ReactNode } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { routePath, type Route } from '../route';
import './landing.css';

interface Props {
  signedIn: boolean;
  navigate: (r: Route, replace?: boolean) => void;
}

export default function Landing({ signedIn, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  /** A real link (open in new tab works) that navigates in place on a plain click. */
  const link = (r: Route, className: string, children: ReactNode) => (
    <a
      className={className}
      href={routePath(r)}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(r);
        window.scrollTo(0, 0);
      }}
    >
      {children}
    </a>
  );
  const app: Route = { view: 'sbcs', setId: null, challengeId: null };
  const signin: Route = { view: 'signin', next: '/dashboard' };
  const cta = (className = 'lp-btn') =>
    signedIn ? link(app, className, t('landing.open')) : link(signin, className, t('landing.start'));

  return (
    <div className="landing">
      <a className="lp-skip" href="#main">
        {t('landing.skip')}
      </a>
      <header className="lp-top">
        <a className="lp-logo" href="/" aria-label={t('top.home')}>
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="140" height="36" />
        </a>
        <nav className="lp-nav" aria-label={t('landing.nav.label')}>
          <a href="#why">{t('landing.nav.why')}</a>
          <a href="#how">{t('landing.nav.how')}</a>
          <a href="#pricing">{t('landing.nav.pricing')}</a>
          <a href="#faq">{t('landing.nav.faq')}</a>
        </nav>
        <div className="lp-top-end">
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
          {!signedIn && link(signin, 'lp-signin', t('landing.signIn'))}
          {cta('lp-btn lp-btn-sm')}
        </div>
      </header>

      <main id="main">
        <section id="why" className="lp-section" />
        <section id="how" className="lp-section" />
        <section id="pricing" className="lp-section" />
        <section id="faq" className="lp-section" />
      </main>

      <footer className="lp-footer">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="124" height="32" />
        <nav aria-label={t('landing.nav.label')}>
          {link({ view: 'setup' }, 'lp-link', t('landing.footer.setup'))}
          {link({ view: 'guide' }, 'lp-link', t('landing.footer.guide'))}
        </nav>
        <p>{t('landing.footer.legal')}</p>
      </footer>
    </div>
  );
}
```
The four empty sections are filled by Tasks 3–5; the page already works (top bar, CTA, footer).

- [ ] **Step 8: Create `web/src/landing/landing.css` (base + top bar + footer)**

```css
/* Landing page (/). Uses the tokens from styles.css; motion only on transform, translate,
   opacity and registered properties; prefers-reduced-motion shows every final state. */
.landing {
  --gutter: clamp(16px, 4vw, 40px);
  overflow-x: clip;
}

.lp-skip {
  position: absolute;
  left: 8px;
  top: -48px;
  z-index: 30;
  padding: 8px 12px;
  border-radius: var(--r-ctl);
  background: var(--surface-2);
}
.lp-skip:focus-visible { top: 8px; }

.lp-top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 64px;
  padding: 0 var(--gutter);
  background: oklch(0.17 0.025 222 / 0.9);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(8px); /* sticky bar only, same as the app top bar */
}
.lp-logo { display: flex; border-radius: var(--r-ctl); }
.lp-logo img { display: block; height: 32px; width: auto; }
.lp-nav { display: flex; gap: 4px; margin-right: auto; }
.lp-nav a,
.lp-signin {
  padding: 8px 12px;
  border-radius: var(--r-ctl);
  color: var(--ink-2);
  text-decoration: none;
  transition: color 160ms var(--ease), background 160ms var(--ease);
}
.lp-nav a:hover,
.lp-signin:hover { color: var(--ink); background: var(--surface-2); }
.lp-top-end { display: flex; align-items: center; gap: 8px; margin-left: auto; }

.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 22px;
  border-radius: var(--r-ctl);
  background: var(--go);
  color: var(--go-ink);
  font: 700 17px/1 var(--font-num);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  transition: transform 160ms var(--ease), filter 160ms var(--ease);
}
.lp-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.lp-btn:active { transform: translateY(1px); }
.lp-btn-sm { height: 38px; padding: 0 14px; font-size: 15px; }
.lp-btn:disabled { background: var(--surface-3); color: var(--ink-3); cursor: not-allowed; transform: none; filter: none; }

.lp-link {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--ink-3);
  text-underline-offset: 4px;
}
.lp-link:hover { text-decoration-color: var(--ink); }

.lp-section {
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(72px, 12vw, 144px) var(--gutter);
  scroll-margin-top: 64px;
}
.lp-kicker {
  margin: 0 0 14px;
  color: var(--ink-3);
  font: 600 13px/1 var(--font-ui);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.lp-h2 {
  margin: 0;
  font: 700 clamp(34px, 4.6vw, 56px)/0.98 var(--font-num);
  text-transform: uppercase;
  text-wrap: balance;
}
.lp-lede {
  max-width: 52ch;
  margin: 18px 0 0;
  color: var(--ink-2);
  font-size: 17px;
  line-height: 1.6;
  text-wrap: pretty;
}

/* section reveal: .is-in comes from useInView */
.lp-reveal { opacity: 0; translate: 0 24px; transition: opacity 600ms var(--ease), translate 600ms var(--ease); }
.lp-reveal.is-in { opacity: 1; translate: 0 0; }

.lp-footer {
  display: grid;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 48px var(--gutter) 64px;
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 13px;
}
.lp-footer nav { display: flex; flex-wrap: wrap; gap: 20px; }
.lp-footer p { max-width: 70ch; margin: 0; }

@media (max-width: 860px) {
  .lp-nav { display: none; }
  .lp-top { gap: 12px; }
}
@media (max-width: 480px) {
  .lp-signin { display: none; }
  .lp-logo img { height: 28px; }
}

@media (prefers-reduced-motion: reduce) {
  .landing *,
  .landing *::before,
  .landing *::after { animation: none !important; transition: none !important; }
  .lp-reveal { opacity: 1; translate: 0 0; }
}
```

- [ ] **Step 9: Wire `Root.tsx`**

Edits (line numbers from the current file):
1. After line 16 (`const App = lazy(...)`) add:
```tsx
const Landing = lazy(() => import('./landing/Landing'));
```
2. Line 34, `publicView`:
```tsx
  const publicView = route.view === 'landing' || route.view === 'signin' || route.view === 'ssoCallback' || route.view === 'guide' || route.view === 'setup';
```
3. Directly before `if (!isLoaded) return ...` (line 42) add:
```tsx
  // the landing page is for everyone and does not wait for Clerk
  if (route.view === 'landing')
    return (
      <Suspense fallback={<div className="boot" aria-busy="true" />}>
        <Landing signedIn={!!isSignedIn} navigate={navigate} />
      </Suspense>
    );
```
4. SSO callback (lines 50-53): `decorateUrl('/')` → `decorateUrl('/dashboard')`; `toSignIn('/')` (both) → `toSignIn('/dashboard')`.
5. Line 63: `: '/'}` → `: '/dashboard'}`.
6. Line 70: `navigate(toSignIn('/'))` → `navigate({ view: 'landing' })` (the "public home" button now goes to the landing page).
7. `App` never gets `landing` (early return above). Narrow its prop type in `App.tsx:56` so TypeScript knows: `{ route: Exclude<Route, { view: 'landing' }>; navigate: ... }`. TS narrows `route` in Root after the early return, so the call site compiles unchanged.

- [ ] **Step 10: `App.tsx:455`**

```tsx
        <a className="brand" href="/dashboard" aria-label={t('top.home')}>
```
Then `grep -n "'/'" web/src/App.tsx web/src/components/*.tsx` and change any other in-app link or `replace('/')` meant as "the SBC list" to `/dashboard`. Leave `signOut({ redirectUrl: '/signin' })` as is.

- [ ] **Step 11: Verify**

Run: `npm run typecheck && npm test && npm run i18n:check && npm run build`
Expected: all pass. Then with `npm run dev` running, in the browser: `/` shows the top bar + footer (signed out and signed in); "Start free" → `/signin`; after sign-in lands on `/dashboard`; `/club` rewrites to `/dashboard/club`; `/sbc/<id>` rewrites to `/dashboard/sbc/<id>`; Back works.

- [ ] **Step 12: Commit**

```bash
git pull --rebase
git add web/src
git commit -m "feat(web): landing page at /, app moves to /dashboard"
```

---

### Task 3: Hero with the 3D pitch

**Files:**
- Create: `web/src/landing/Hero.tsx`
- Modify: `web/src/landing/Landing.tsx` (render `<Hero cta={cta()} />` at the top of `<main>`, before `#why`)
- Modify: `web/src/landing/landing.css` (append hero block)
- Modify: `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `DEMO_SQUAD`, `DEMO_META` (Task 1), `useTilt` (Task 1), `Card` from `web/src/components/Card.tsx` (`{ player, meta, size?: 'md' | 'sm' }`), `cta()` from Landing (Task 2)
- Produces: `Hero({ cta }: { cta: ReactNode })`

- [ ] **Step 1: i18n keys**

en:
```ts
  'landing.hero.kicker': 'For EA FC 27 Ultimate Team',
  'landing.hero.title': 'The cheapest squad, from your own club.',
  'landing.hero.lede': 'Pick an SBC and press Solve. FC Solver builds it from the players you already own and spends your least valuable cards. You rebuild it in the web app yourself.',
  'landing.hero.how': 'See how it works',
  'landing.hero.stage': 'Example: players from your club land on the pitch and every requirement is met.',
  'landing.hero.req1': 'Players from Premier League: min. 1',
  'landing.hero.req2': 'Players from England: min. 2',
  'landing.hero.req3': 'Squad rating: min. 84',
```
ro:
```ts
  'landing.hero.kicker': 'Pentru EA FC 27 Ultimate Team',
  'landing.hero.title': 'Cel mai ieftin squad, din clubul tău.',
  'landing.hero.lede': 'Alegi un SBC și apeși Solve. FC Solver îl construiește din jucătorii pe care îi ai deja și folosește cardurile tale cele mai puțin valoroase. Tu îl refaci în web app.',
  'landing.hero.how': 'Vezi cum funcționează',
  'landing.hero.stage': 'Exemplu: jucători din clubul tău ajung pe teren și toate cerințele sunt îndeplinite.',
  'landing.hero.req1': 'Jucători din Premier League: min. 1',
  'landing.hero.req2': 'Jucători din Anglia: min. 2',
  'landing.hero.req3': 'Rating echipă: min. 84',
```
(The demo squad really meets these: Saka is Premier League; Saka + Kelly are English; the average rating is 85.9.)

- [ ] **Step 2: Create `Hero.tsx`**

```tsx
// Landing hero: a pitch in perspective with real card art. Cards float above their spots and land
// as you scroll (CSS scroll-driven animation; on load where unsupported), requirements tick as they do.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useTilt } from './motion';

// where each DEMO_SQUAD card stands, in % of the pitch (attack at the top, as in the web app)
const SPOTS: [number, number][] = [[50, 13], [83, 25], [17, 25], [33, 47], [67, 47], [50, 68], [50, 88]];
const REQS = ['req1', 'req2', 'req3'] as const;

const PitchLines = () => (
  <svg className="lp-lines" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">
    <rect x="3" y="3" width="94" height="124" />
    <line x1="3" y1="65" x2="97" y2="65" />
    <circle cx="50" cy="65" r="11" />
    <rect x="25" y="3" width="50" height="18" />
    <rect x="25" y="109" width="50" height="18" />
  </svg>
);

export function Hero({ cta }: { cta: ReactNode }) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  useTilt(stage);
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-copy">
        <p className="lp-kicker">{t('landing.hero.kicker')}</p>
        <h1 id="lp-hero-title">{t('landing.hero.title')}</h1>
        <p className="lp-lede">{t('landing.hero.lede')}</p>
        <div className="lp-actions">
          {cta}
          <a className="lp-link" href="#how">
            {t('landing.hero.how')}
          </a>
        </div>
      </div>

      <div className="lp-stage" ref={stage} role="img" aria-label={t('landing.hero.stage')}>
        <div className="lp-tilt">
          <div className="lp-pitch">
            <PitchLines />
            {DEMO_SQUAD.map((p, i) => (
              <div key={p.id} className="lp-spot" style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%`, '--i': i } as CSSProperties}>
                <span className="lp-shadow" />
                <div className="lp-stand">
                  <div className="lp-float">
                    <Card player={p} meta={DEMO_META} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <ul className="lp-reqs">
          {REQS.map((k, i) => (
            <li key={k} style={{ '--i': i } as CSSProperties}>
              <Check className="lp-tick" weight="bold" />
              {t(`landing.hero.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```
In `Landing.tsx` add `import { Hero } from './Hero';` and, as the first child of `<main id="main">`: `<Hero cta={cta()} />`.

- [ ] **Step 3: Append the hero CSS to `landing.css`** (before the reduced-motion block)

```css
/* ---------- hero ---------- */
@property --pitch-tilt { syntax: '<angle>'; inherits: true; initial-value: 30deg; }
@property --land { syntax: '<number>'; inherits: true; initial-value: 1; }

.lp-hero {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  align-items: center;
  gap: clamp(24px, 5vw, 72px);
  max-width: 1180px;
  min-height: calc(100dvh - 64px);
  margin: 0 auto;
  padding: clamp(32px, 6vw, 72px) var(--gutter);
}
.lp-hero h1 {
  margin: 0;
  font: 700 clamp(46px, 6.4vw, 86px)/0.93 var(--font-num);
  text-transform: uppercase;
  text-wrap: balance;
}
.lp-hero .lp-lede { font-size: 18px; margin-bottom: 32px; }
.lp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 24px; }

.lp-stage {
  --card-w: clamp(46px, 6.2vw, 80px);
  position: relative;
  aspect-ratio: 5 / 6;
  perspective: 1200px;
  perspective-origin: 50% 15%;
}
.lp-tilt {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transform: rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg));
  transition: transform 500ms var(--ease);
}
.lp-pitch {
  position: absolute;
  inset: 2% 7% 16%;
  border: 1px solid var(--pitch-line);
  border-radius: var(--r-box);
  background: linear-gradient(180deg, var(--pitch-a), var(--pitch-b));
  box-shadow: 0 70px 90px -40px oklch(0 0 0 / 0.65);
  transform-style: preserve-3d;
  transform-origin: 50% 70%;
  transform: rotateX(var(--pitch-tilt));
}
.lp-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--pitch-line);
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
}
.lp-spot {
  position: absolute;
  translate: -50% -50%;
  transform-style: preserve-3d;
}
.lp-shadow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--card-w) * 0.9);
  height: calc(var(--card-w) * 0.34);
  translate: -50% -10%;
  border-radius: 50%;
  background: oklch(0 0 0 / 0.45);
  filter: blur(6px);
  opacity: calc(0.3 + var(--land) * 0.7);
  scale: calc(1.5 - var(--land) * 0.5);
}
/* the card stands up from the pitch and lifts along the pitch normal until --land reaches 1 */
.lp-stand {
  transform-origin: 50% 100%;
  translate: 0 -50%;
  transform: translateZ(calc((1 - var(--land)) * (70px + var(--i) * 14px))) rotateX(calc(-1 * var(--pitch-tilt)));
}
.lp-float { animation: lp-bob 4.8s ease-in-out infinite; animation-delay: calc(var(--i) * -0.7s); }
@keyframes lp-bob { 50% { translate: 0 -5px; } }

.lp-reqs {
  position: absolute;
  left: 50%;
  bottom: 0;
  translate: -50% 0;
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 12px 16px;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--r-box);
  background: var(--surface);
  font-size: 13px;
  white-space: nowrap;
}
.lp-reqs li { display: flex; align-items: center; gap: 8px; }
.lp-tick { color: var(--go); flex: none; }

/* on load (every browser): pitch tips back, cards land one by one, requirements tick */
.lp-pitch { animation: lp-tilt-in 1000ms var(--ease) both; }
.lp-spot { animation: lp-land 800ms var(--ease) both; animation-delay: calc(350ms + var(--i) * 90ms); }
.lp-tick { animation: lp-tick 320ms var(--ease) both; animation-delay: calc(1100ms + var(--i) * 160ms); }
@keyframes lp-tilt-in { from { --pitch-tilt: 58deg; opacity: 0; } }
@keyframes lp-land { from { --land: 0; opacity: 0; } }
@keyframes lp-tick { from { opacity: 0; scale: 0.4; } }

/* where scroll-driven animation exists, scrolling does the landing instead */
@supports (animation-timeline: scroll()) {
  .lp-pitch {
    animation: lp-flatten linear both;
    animation-timeline: scroll(root);
    animation-range: 0 55vh;
  }
  .lp-spot {
    animation: lp-land-scroll linear both;
    animation-timeline: scroll(root);
    animation-range: calc(var(--i) * 4vh) calc(18vh + var(--i) * 4vh);
    animation-delay: 0s;
  }
  .lp-tick {
    animation: lp-tick linear both;
    animation-timeline: scroll(root);
    animation-range: calc(30vh + var(--i) * 6vh) calc(36vh + var(--i) * 6vh);
    animation-delay: 0s;
  }
  @keyframes lp-flatten { from { --pitch-tilt: 48deg; } to { --pitch-tilt: 24deg; } }
  @keyframes lp-land-scroll { from { --land: 0; } to { --land: 1; } }
}

@media (max-width: 860px) {
  .lp-hero { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .lp-stage { --card-w: clamp(44px, 13vw, 72px); width: 100%; max-width: 460px; margin: 0 auto; }
}
```
Note: in `animation` + `animation-timeline`, the shorthand must come first (it resets the timeline). Reduced motion: the existing block kills animations, so `--pitch-tilt` stays 30deg and `--land` 1 (landed, ticks visible).

- [ ] **Step 4: Verify in the browser**

Run: `npm run typecheck && npm run i18n:check && npm run build`, then open `http://localhost:5173/`:
- Chrome: cards float above the pitch; scrolling the first ~half screen tips the pitch flatter, lands the cards one by one, then ticks the three requirements. Moving the mouse tilts the stage a few degrees.
- Firefox (no scroll timelines yet): the same sequence plays once on load.
- DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: static, landed, ticks visible, no tilt.
- 390px: text then stage, no horizontal scroll, requirement box not clipped (reduce `white-space` to `normal` if it is).
- Card art loads from `/landing/items/images/...` (Network tab: no requests to ea.com).

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add web/src
git commit -m "feat(landing): 3D pitch hero with scroll-landing cards"
```

---

### Task 4: The three advantages

**Files:**
- Create: `web/src/landing/Pillars.tsx`
- Modify: `web/src/landing/Landing.tsx` (replace `<section id="why" className="lp-section" />` with `<Pillars />`)
- Modify: `landing.css`, `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `useInView` (Task 1), `DEMO_SQUAD`/`DEMO_META`, `Card`, `.lp-section/.lp-kicker/.lp-h2/.lp-lede/.lp-reveal` (Task 2)
- Produces: `Pillars()` rendering `<section id="why">`

- [ ] **Step 1: i18n keys**

en:
```ts
  'landing.why.kicker': 'Why FC Solver',
  'landing.why.title': 'Built for the club you already have',
  'landing.club.title': 'Only your club',
  'landing.club.body': 'FC Solver only uses players already in your club, untradeables included. Every answer is a squad you can build right now, without buying a single card.',
  'landing.club.example': 'Example',
  'landing.club.market': 'Market price',
  'landing.club.owned': 'Already yours',
  'landing.optimal.title': 'Optimal, not a guess',
  'landing.optimal.body': 'A CP-SAT solver (Google OR-Tools) checks every valid combination in your club and returns the one that spends the least. Then every requirement, the rating and the chemistry are re-checked with formulas ported 1:1 from the game, so a tick here is a tick in the web app.',
  'landing.optimal.r1': 'Squad rating: min. 84',
  'landing.optimal.r2': 'Team chemistry: min. 22',
  'landing.optimal.r3': 'Players from Serie A: min. 1',
  'landing.optimal.r4': 'Players in the squad: 11',
  'landing.optimal.first': 'First squad that works',
  'landing.optimal.best': 'Cheapest squad',
  'landing.optimal.unit': 'value of the cards used',
  'landing.safe.title': 'No ban risk',
  'landing.safe.body': 'FC Solver never writes anything to EA. Your web app tab reads, the extension passes that on, FC Solver solves. Every EA request leaves from your own tab, with your session and your IP, and results are cached, so EA sees only a few requests a day.',
  'landing.safe.diagram': 'Data goes one way: from your EA web app tab, through the extension, to FC Solver. Nothing is written back to EA.',
  'landing.safe.webApp': 'EA web app',
  'landing.safe.webAppSub': 'your tab, reads',
  'landing.safe.ext': 'Extension',
  'landing.safe.extSub': 'passes it on',
  'landing.safe.site': 'FC Solver',
  'landing.safe.siteSub': 'solves',
  'landing.safe.never': 'Never',
  'landing.safe.n1': 'buys or sells a card',
  'landing.safe.n2': 'lists on the transfer market',
  'landing.safe.n3': 'submits an SBC for you',
  'landing.safe.n4': 'asks for your EA password',
  'landing.met': 'met',
```
ro:
```ts
  'landing.why.kicker': 'De ce FC Solver',
  'landing.why.title': 'Făcut pentru clubul pe care îl ai deja',
  'landing.club.title': 'Doar clubul tău',
  'landing.club.body': 'FC Solver folosește doar jucători care sunt deja în clubul tău, inclusiv cei netransferabili. Fiecare răspuns e un squad pe care îl poți face chiar acum, fără să cumperi niciun card.',
  'landing.club.example': 'Exemplu',
  'landing.club.market': 'Preț în market',
  'landing.club.owned': 'Deja al tău',
  'landing.optimal.title': 'Optim, nu la noroc',
  'landing.optimal.body': 'Un solver CP-SAT (Google OR-Tools) verifică toate combinațiile valide din clubul tău și îl alege pe cel care te costă cel mai puțin. Apoi fiecare cerință, ratingul și chimia sunt verificate din nou cu formule preluate 1:1 din joc, deci o bifă aici e o bifă și în web app.',
  'landing.optimal.r1': 'Rating echipă: min. 84',
  'landing.optimal.r2': 'Chimie echipă: min. 22',
  'landing.optimal.r3': 'Jucători din Serie A: min. 1',
  'landing.optimal.r4': 'Jucători în echipă: 11',
  'landing.optimal.first': 'Primul squad valid',
  'landing.optimal.best': 'Cel mai ieftin squad',
  'landing.optimal.unit': 'valoarea cardurilor folosite',
  'landing.safe.title': 'Fără risc de ban',
  'landing.safe.body': 'FC Solver nu scrie nimic la EA. Tab-ul tău de web app citește, extensia transmite datele, FC Solver rezolvă. Fiecare cerere către EA pleacă din tab-ul tău, cu sesiunea și IP-ul tău, iar rezultatele sunt păstrate în cache, așa că EA vede doar câteva cereri pe zi.',
  'landing.safe.diagram': 'Datele merg într-o singură direcție: din tab-ul tău de web app EA, prin extensie, la FC Solver. Nimic nu este scris înapoi la EA.',
  'landing.safe.webApp': 'Web app EA',
  'landing.safe.webAppSub': 'tab-ul tău, citește',
  'landing.safe.ext': 'Extensie',
  'landing.safe.extSub': 'transmite',
  'landing.safe.site': 'FC Solver',
  'landing.safe.siteSub': 'rezolvă',
  'landing.safe.never': 'Niciodată',
  'landing.safe.n1': 'nu cumpără și nu vinde carduri',
  'landing.safe.n2': 'nu listează în transfer market',
  'landing.safe.n3': 'nu trimite SBC-uri în locul tău',
  'landing.safe.n4': 'nu îți cere parola EA',
  'landing.met': 'îndeplinită',
```

- [ ] **Step 2: Create `Pillars.tsx`**

```tsx
// "Why FC Solver": one row per advantage, each with a small scene that plays when it scrolls in.
// Prices and values in the scenes are examples, labelled as such.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, Coins, X } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useInView } from './motion';

const i = (n: number) => ({ '--i': n }) as CSSProperties;

function Row({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className={`lp-row${seen ? ' is-in' : ''}`}>
      <div className="lp-row-copy lp-reveal">
        <span className="lp-num" aria-hidden="true">{String(n).padStart(2, '0')}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="lp-scene">{children}</div>
    </div>
  );
}

function ClubScene() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  const picks: [number, number][] = [[1, 61000], [5, 44500], [3, 38000]]; // DEMO_SQUAD index, example market price
  return (
    <div className="lp-club">
      <p className="lp-tag">{t('landing.club.example')}</p>
      <ul>
        {picks.map(([idx, price], k) => (
          <li key={idx} style={i(k)}>
            <Card player={DEMO_SQUAD[idx]} meta={DEMO_META} size="sm" />
            <span className="lp-price">
              <Coins weight="fill" aria-hidden="true" />
              <span className="sr-only">{t('landing.club.market')}: </span>
              <s>{fmt.format(price)}</s>
            </span>
            <span className="lp-owned">
              <Check weight="bold" aria-hidden="true" /> {t('landing.club.owned')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptimalScene() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  return (
    <div className="lp-optimal">
      <p className="lp-tag">{t('landing.club.example')}</p>
      <ul className="lp-checks">
        {(['r1', 'r2', 'r3', 'r4'] as const).map((k, n) => (
          <li key={k} style={i(n)}>
            <Check className="lp-tick" weight="bold" aria-hidden="true" />
            <span>{t(`landing.optimal.${k}`)}</span>
            <span className="sr-only"> ({t('landing.met')})</span>
          </li>
        ))}
      </ul>
      <dl className="lp-values">
        <div className="lp-first">
          <dt>{t('landing.optimal.first')}</dt>
          <dd><s>{fmt.format(41200)}</s> <small>{t('landing.optimal.unit')}</small></dd>
        </div>
        <div className="lp-best">
          <dt>{t('landing.optimal.best')}</dt>
          <dd>{fmt.format(12800)} <small>{t('landing.optimal.unit')}</small></dd>
        </div>
      </dl>
    </div>
  );
}

function SafeScene() {
  const { t } = useI18n();
  const nodes = ['webApp', 'ext', 'site'] as const; // i18n: landing.safe.<k> + landing.safe.<k>Sub
  return (
    <div className="lp-safe">
      <ol className="lp-flow" aria-label={t('landing.safe.diagram')}>
        {nodes.map((k, n) => (
          <li key={k} style={i(n)}>
            <strong>{t(`landing.safe.${k}`)}</strong>
            <span>{t(`landing.safe.${k}Sub`)}</span>
            {n < nodes.length - 1 && <ArrowRight className="lp-arrow" weight="bold" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="lp-tag">{t('landing.safe.never')}</p>
      <ul className="lp-never">
        {(['n1', 'n2', 'n3', 'n4'] as const).map((k, n) => (
          <li key={k} style={i(n)}>
            <X weight="bold" aria-hidden="true" /> {t(`landing.safe.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pillars() {
  const { t } = useI18n();
  return (
    <section id="why" className="lp-section" aria-labelledby="lp-why-title">
      <p className="lp-kicker">{t('landing.why.kicker')}</p>
      <h2 id="lp-why-title" className="lp-h2">{t('landing.why.title')}</h2>
      <Row n={1} title={t('landing.club.title')} body={t('landing.club.body')}><ClubScene /></Row>
      <Row n={2} title={t('landing.optimal.title')} body={t('landing.optimal.body')}><OptimalScene /></Row>
      <Row n={3} title={t('landing.safe.title')} body={t('landing.safe.body')}><SafeScene /></Row>
    </section>
  );
}
```
In `Landing.tsx`: `import { Pillars } from './Pillars';` and replace the empty `#why` section with `<Pillars />`.

- [ ] **Step 3: Append the pillars CSS** (before the reduced-motion block; add `.lp-row .lp-scene *` states to the reduced-motion block as shown)

```css
/* ---------- why: three rows ---------- */
.lp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(28px, 6vw, 88px);
  margin-top: clamp(56px, 9vw, 112px);
}
.lp-row:nth-of-type(even) .lp-row-copy { order: 2; }
.lp-num { display: block; color: var(--ink-3); font: 700 20px/1 var(--font-num); letter-spacing: 0.06em; }
.lp-row h3 { margin: 10px 0 0; font: 700 clamp(28px, 3.4vw, 40px)/1 var(--font-num); text-transform: uppercase; }
.lp-row-copy p { max-width: 50ch; margin: 16px 0 0; color: var(--ink-2); font-size: 16px; line-height: 1.65; text-wrap: pretty; }

.lp-scene {
  position: relative;
  padding: clamp(20px, 3vw, 32px);
  border: 1px solid var(--line);
  border-radius: var(--r-box);
  background: linear-gradient(180deg, var(--pitch-a), var(--pitch-b));
}
/* slow parallax: the scene drifts against the scroll */
@supports (animation-timeline: view()) {
  .lp-scene { animation: lp-drift linear both; animation-timeline: view(); animation-range: cover; }
  @keyframes lp-drift { from { translate: 0 36px; } to { translate: 0 -36px; } }
}
.lp-tag { margin: 0 0 14px; color: var(--ink-3); font: 600 12px/1 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; }

/* staggered entries inside a scene: hidden until the row is in view */
.lp-scene li { opacity: 0; translate: 0 14px; transition: opacity 500ms var(--ease), translate 500ms var(--ease); transition-delay: calc(150ms + var(--i) * 120ms); }
.lp-row.is-in .lp-scene li { opacity: 1; translate: 0 0; }

/* 1: club */
.lp-club ul { display: flex; justify-content: space-around; gap: 12px; margin: 0; padding: 0; list-style: none; }
.lp-club li { display: grid; justify-items: center; gap: 8px; }
.lp-price { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-3); font: 600 15px/1 var(--font-num); }
.lp-price s { position: relative; text-decoration: none; }
.lp-price s::after {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  top: 50%;
  height: 2px;
  background: var(--ink-2);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 400ms var(--ease);
  transition-delay: calc(700ms + var(--i) * 150ms);
}
.lp-row.is-in .lp-price s::after { transform: scaleX(1); }
.lp-owned { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; }
.lp-owned svg { color: var(--go); }

/* 2: optimal */
.lp-checks { display: grid; gap: 8px; margin: 0 0 20px; padding: 0; list-style: none; }
.lp-checks li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r-ctl); background: var(--surface); font-size: 14px; }
.lp-values { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
.lp-values div { padding: 12px; border: 1px solid var(--line); border-radius: var(--r-ctl); }
.lp-values dt { color: var(--ink-3); font-size: 12px; }
.lp-values dd { margin: 6px 0 0; font: 700 30px/1 var(--font-num); }
.lp-values small { display: block; margin-top: 4px; color: var(--ink-3); font: 400 12px/1.3 var(--font-ui); }
.lp-first dd s { color: var(--ink-3); text-decoration-thickness: 2px; }
.lp-best { opacity: 0; translate: 0 10px; transition: opacity 500ms var(--ease) 900ms, translate 500ms var(--ease) 900ms; }
.lp-row.is-in .lp-best { opacity: 1; translate: 0 0; }

/* 3: safe */
.lp-flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin: 0 0 24px; padding: 0; list-style: none; }
.lp-flow li { position: relative; display: grid; gap: 4px; padding: 12px; border-radius: var(--r-ctl); background: var(--surface); text-align: center; }
.lp-flow strong { font: 700 17px/1 var(--font-num); text-transform: uppercase; }
.lp-flow span { color: var(--ink-3); font-size: 12px; }
.lp-arrow { position: absolute; right: -24px; top: 50%; translate: 0 -50%; color: var(--ink-2); animation: lp-nudge 1.8s var(--ease) infinite; }
@keyframes lp-nudge { 50% { translate: 4px -50%; } }
.lp-never { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.lp-never li { display: flex; align-items: center; gap: 8px; }
.lp-never svg { color: var(--ink-3); flex: none; }

@media (max-width: 860px) {
  .lp-row { grid-template-columns: minmax(0, 1fr); }
  .lp-row:nth-of-type(even) .lp-row-copy { order: 0; }
  .lp-never { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .lp-flow { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  .lp-arrow { right: auto; left: 50%; top: auto; bottom: -20px; translate: -50% 0; rotate: 90deg; animation: none; }
}
```
Add to the reduced-motion block:
```css
  .lp-scene li,
  .lp-best { opacity: 1; translate: 0 0; }
  .lp-price s::after { transform: scaleX(1); }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run i18n:check && npm run build`. Browser: each row's copy fades up and its scene plays once when scrolled to (cards rise, prices get struck, ticks appear, "Cheapest squad" arrives last; flow arrows nudge). Scenes drift slightly with scroll in Chrome. 390px: rows stack, the flow becomes vertical with down arrows, nothing overflows. Reduced motion: everything visible, no motion.

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add web/src
git commit -m "feat(landing): three advantages with animated scenes"
```

---

### Task 5: Steps, pricing and FAQ

**Files:**
- Create: `web/src/landing/Steps.tsx`, `web/src/landing/Pricing.tsx`, `web/src/landing/Faq.tsx`
- Modify: `web/src/landing/Landing.tsx` (replace the three empty sections), `landing.css`, `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `proPrice`, `yearlySaving`, `formatEur`, `type Billing` (Task 1); `useInView` (Task 1); `link()` and `cta()` from Landing (Task 2)
- Produces:
  - `Steps({ link }: { link: (r: Route, className: string, children: ReactNode) => ReactNode })`
  - `Pricing({ cta }: { cta: ReactNode })`
  - `Faq()`

- [ ] **Step 1: i18n keys**

en:
```ts
  'landing.how.kicker': 'How it works',
  'landing.how.title': 'Up and running in three steps',
  'landing.how.s1.title': 'Install the extension',
  'landing.how.s1.body': 'A small Chrome extension links your EA web app tab to FC Solver. It never asks for your EA password.',
  'landing.how.s2.title': 'Open the EA web app',
  'landing.how.s2.body': 'Sign in as usual. Your club and the SBC list sync from that tab, once a day after the 20:01 drop.',
  'landing.how.s3.title': 'Pick an SBC, press Solve',
  'landing.how.s3.body': 'You get the cheapest squad on a pitch that looks like the web app. Rebuild it there and submit it yourself.',
  'landing.how.setup': 'Setup guide',
  'landing.how.more': 'How it works in detail',
  'landing.price.kicker': 'Pricing',
  'landing.price.title': 'Start free, upgrade for every SBC',
  'landing.price.period': 'Billing period',
  'landing.price.monthly': 'Monthly',
  'landing.price.yearly': 'Yearly',
  'landing.price.save': 'save {amount} a year',
  'landing.price.perMonth': '/ month',
  'landing.price.free.name': 'Free',
  'landing.price.free.note': 'No card needed',
  'landing.price.free.f1': 'Your club and the SBC list, synced from your tab',
  'landing.price.free.f2': 'The optimal solver and the 1:1 re-check',
  'landing.price.free.f3': 'A limited number of SBCs',
  'landing.price.pro.name': 'Pro',
  'landing.price.pro.billedMonthly': 'Billed monthly',
  'landing.price.pro.billedYearly': 'Billed {amount} a year',
  'landing.price.pro.f1': 'Every SBC, no limit',
  'landing.price.pro.f2': 'Everything in Free',
  'landing.price.pro.soon': 'Coming soon',
  'landing.faq.kicker': 'FAQ',
  'landing.faq.title': 'Questions',
  'landing.faq.ban.q': 'Can my EA account get banned for this?',
  'landing.faq.ban.a': 'EA acts against automated buying, selling and submitting. FC Solver does none of it: it only reads what your own web app tab loads, with a daily cap on requests.',
  'landing.faq.data.q': 'What do you store?',
  'landing.faq.data.a': 'Your club, your SBC list and the squads you solve, cached so EA is asked as little as possible. Never your EA password.',
  'landing.faq.ext.q': 'Why do I need an extension?',
  'landing.faq.ext.a': 'EA has no public API. The extension lets FC Solver read your club from your own web app tab instead of logging in to EA for you.',
  'landing.faq.coins.q': 'Does it cost coins?',
  'landing.faq.coins.a': 'No. It only uses players you already own and picks the least valuable ones that still complete the SBC.',
```
ro:
```ts
  'landing.how.kicker': 'Cum funcționează',
  'landing.how.title': 'Gata de folosit în trei pași',
  'landing.how.s1.title': 'Instalezi extensia',
  'landing.how.s1.body': 'O extensie mică de Chrome leagă tab-ul tău de web app EA de FC Solver. Nu îți cere niciodată parola EA.',
  'landing.how.s2.title': 'Deschizi web app-ul EA',
  'landing.how.s2.body': 'Te loghezi ca de obicei. Clubul și lista de SBC-uri se sincronizează din acel tab, o dată pe zi după drop-ul de la 20:01.',
  'landing.how.s3.title': 'Alegi un SBC, apeși Solve',
  'landing.how.s3.body': 'Primești cel mai ieftin squad pe un teren care arată ca în web app. Îl refaci acolo și îl trimiți tu.',
  'landing.how.setup': 'Ghid de instalare',
  'landing.how.more': 'Cum funcționează, pe larg',
  'landing.price.kicker': 'Prețuri',
  'landing.price.title': 'Începi gratuit, treci la Pro pentru toate SBC-urile',
  'landing.price.period': 'Perioada de facturare',
  'landing.price.monthly': 'Lunar',
  'landing.price.yearly': 'Anual',
  'landing.price.save': 'economisești {amount} pe an',
  'landing.price.perMonth': '/ lună',
  'landing.price.free.name': 'Free',
  'landing.price.free.note': 'Fără card',
  'landing.price.free.f1': 'Clubul tău și lista de SBC-uri, sincronizate din tab-ul tău',
  'landing.price.free.f2': 'Solverul optim și verificarea 1:1',
  'landing.price.free.f3': 'Un număr limitat de SBC-uri',
  'landing.price.pro.name': 'Pro',
  'landing.price.pro.billedMonthly': 'Facturat lunar',
  'landing.price.pro.billedYearly': 'Facturat {amount} pe an',
  'landing.price.pro.f1': 'Toate SBC-urile, fără limită',
  'landing.price.pro.f2': 'Tot ce include Free',
  'landing.price.pro.soon': 'În curând',
  'landing.faq.kicker': 'Întrebări',
  'landing.faq.title': 'Întrebări frecvente',
  'landing.faq.ban.q': 'Îmi poate lua EA ban din cauza asta?',
  'landing.faq.ban.a': 'EA sancționează cumpărarea, vânzarea și trimiterea automată. FC Solver nu face nimic din toate astea: citește doar ce încarcă propriul tău tab de web app, cu o limită zilnică de cereri.',
  'landing.faq.data.q': 'Ce date păstrați?',
  'landing.faq.data.a': 'Clubul tău, lista de SBC-uri și squad-urile rezolvate, în cache, ca EA să fie întrebat cât mai rar. Niciodată parola EA.',
  'landing.faq.ext.q': 'De ce am nevoie de o extensie?',
  'landing.faq.ext.a': 'EA nu are un API public. Extensia îi permite lui FC Solver să citească clubul din propriul tău tab de web app, în loc să se logheze la EA în locul tău.',
  'landing.faq.coins.q': 'Costă coins?',
  'landing.faq.coins.a': 'Nu. Folosește doar jucători pe care îi ai deja și îi alege pe cei mai puțin valoroși care încă îndeplinesc SBC-ul.',
```

- [ ] **Step 2: Create `Steps.tsx`**

```tsx
// "How it works": the three steps from nothing to a solved SBC.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { useInView } from './motion';

interface Props {
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
}

export function Steps({ link }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLOListElement>(null);
  const seen = useInView(ref);
  return (
    <section id="how" className="lp-section" aria-labelledby="lp-how-title">
      <p className="lp-kicker">{t('landing.how.kicker')}</p>
      <h2 id="lp-how-title" className="lp-h2">{t('landing.how.title')}</h2>
      <ol ref={ref} className={`lp-steps${seen ? ' is-in' : ''}`}>
        {(['s1', 's2', 's3'] as const).map((k, n) => (
          <li key={k} style={{ '--i': n } as CSSProperties}>
            <span className="lp-step-n" aria-hidden="true">{n + 1}</span>
            <h3>{t(`landing.how.${k}.title`)}</h3>
            <p>{t(`landing.how.${k}.body`)}</p>
            {k === 's1' && link({ view: 'setup' }, 'lp-link', t('landing.how.setup'))}
          </li>
        ))}
      </ol>
      <p className="lp-more">{link({ view: 'guide' }, 'lp-link', t('landing.how.more'))}</p>
    </section>
  );
}
```

- [ ] **Step 3: Create `Pricing.tsx`**

```tsx
// Free vs Pro. Display only until billing exists: the Pro button is disabled ("Coming soon").
import { useState, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { formatEur, proPrice, yearlySaving, type Billing } from './pricing';

export function Pricing({ cta }: { cta: ReactNode }) {
  const { t, lang } = useI18n();
  const [billing, setBilling] = useState<Billing>('yearly');
  const pro = proPrice(billing);
  const eur = (n: number) => formatEur(n, lang);
  const list = (items: string[]) => (
    <ul className="lp-feats">
      {items.map((text) => (
        <li key={text}>
          <Check weight="bold" aria-hidden="true" /> {text}
        </li>
      ))}
    </ul>
  );
  return (
    <section id="pricing" className="lp-section" aria-labelledby="lp-price-title">
      <p className="lp-kicker">{t('landing.price.kicker')}</p>
      <h2 id="lp-price-title" className="lp-h2">{t('landing.price.title')}</h2>

      <fieldset className="lp-toggle">
        <legend className="sr-only">{t('landing.price.period')}</legend>
        {(['monthly', 'yearly'] as const).map((b) => (
          <label key={b} className={billing === b ? 'on' : ''}>
            <input type="radio" name="billing" value={b} checked={billing === b} onChange={() => setBilling(b)} />
            {t(`landing.price.${b}`)}
          </label>
        ))}
        <span className="lp-save">{t('landing.price.save', { amount: eur(yearlySaving()) })}</span>
      </fieldset>

      <div className="lp-plans">
        <article className="lp-plan">
          <h3>{t('landing.price.free.name')}</h3>
          <p className="lp-amount">{eur(0)}</p>
          <p className="lp-billed">{t('landing.price.free.note')}</p>
          {list([t('landing.price.free.f1'), t('landing.price.free.f2'), t('landing.price.free.f3')])}
          {cta}
        </article>
        <article className="lp-plan lp-plan-pro">
          <h3>{t('landing.price.pro.name')}</h3>
          <p className="lp-amount">
            {eur(pro.perMonth)} <small>{t('landing.price.perMonth')}</small>
          </p>
          <p className="lp-billed">
            {billing === 'monthly' ? t('landing.price.pro.billedMonthly') : t('landing.price.pro.billedYearly', { amount: eur(pro.billed) })}
          </p>
          {list([t('landing.price.pro.f1'), t('landing.price.pro.f2')])}
          <button type="button" className="lp-btn" disabled>
            {t('landing.price.pro.soon')}
          </button>
        </article>
      </div>
    </section>
  );
}
```
Note for `i18n:check`: it only sees `t('literal')` and `t(`prefix.${x}`)`, never `t(variable)`; that is why `list` takes translated strings.

- [ ] **Step 4: Create `Faq.tsx`**

```tsx
// Short FAQ on native <details>, so it works without JS and with the keyboard.
import { CaretDown } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

const ITEMS = ['ban', 'data', 'ext', 'coins'] as const;

export function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq" className="lp-section lp-faq" aria-labelledby="lp-faq-title">
      <p className="lp-kicker">{t('landing.faq.kicker')}</p>
      <h2 id="lp-faq-title" className="lp-h2">{t('landing.faq.title')}</h2>
      <div className="lp-faq-list">
        {ITEMS.map((k) => (
          <details key={k}>
            <summary>
              {t(`landing.faq.${k}.q`)}
              <CaretDown weight="bold" aria-hidden="true" />
            </summary>
            <p>{t(`landing.faq.${k}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire into `Landing.tsx`**

```tsx
import { Steps } from './Steps';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
...
        <Steps link={link} />
        <Pricing cta={cta()} />
        <Faq />
```
replacing the three empty `<section>`s.

- [ ] **Step 6: Append the CSS** (before the reduced-motion block; plus the reduced-motion additions)

```css
/* ---------- how ---------- */
.lp-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(16px, 3vw, 32px); margin: 48px 0 0; padding: 0; list-style: none; counter-reset: none; }
.lp-steps li {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-box);
  background: var(--surface);
  opacity: 0;
  translate: 0 20px;
  transition: opacity 500ms var(--ease), translate 500ms var(--ease);
  transition-delay: calc(var(--i) * 140ms);
}
.lp-steps.is-in li { opacity: 1; translate: 0 0; }
.lp-step-n { display: block; color: var(--ink-3); font: 700 56px/0.9 var(--font-num); }
.lp-steps h3 { margin: 16px 0 0; font: 700 24px/1 var(--font-num); text-transform: uppercase; }
.lp-steps p { margin: 10px 0 14px; color: var(--ink-2); line-height: 1.6; }
.lp-more { margin: 28px 0 0; }

/* ---------- pricing ---------- */
.lp-toggle { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 36px 0 0; padding: 4px; border: 1px solid var(--line); border-radius: var(--r-ctl); }
.lp-toggle label { position: relative; padding: 8px 16px; border-radius: 6px; color: var(--ink-2); cursor: pointer; transition: background 160ms var(--ease), color 160ms var(--ease); }
.lp-toggle label.on { background: var(--go); color: var(--go-ink); font-weight: 600; }
.lp-toggle input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.lp-toggle label:has(input:focus-visible) { outline: 2px solid var(--ink); outline-offset: 2px; }
.lp-save { padding: 0 12px; color: var(--ink-3); font-size: 13px; }
.lp-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(16px, 3vw, 28px); max-width: 860px; margin-top: 28px; }
.lp-plan { display: flex; flex-direction: column; gap: 6px; padding: 28px; border: 1px solid var(--line); border-radius: var(--r-box); background: var(--surface); }
.lp-plan-pro { border-color: var(--ink-3); }
.lp-plan h3 { margin: 0; font: 700 22px/1 var(--font-num); text-transform: uppercase; }
.lp-amount { margin: 12px 0 0; font: 700 52px/1 var(--font-num); }
.lp-amount small { color: var(--ink-3); font: 400 15px/1 var(--font-ui); }
.lp-billed { margin: 0; color: var(--ink-3); font-size: 13px; }
.lp-feats { display: grid; gap: 10px; margin: 20px 0 24px; padding: 0; list-style: none; }
.lp-feats li { display: flex; gap: 10px; line-height: 1.45; }
.lp-feats svg { flex: none; margin-top: 3px; color: var(--go); }
.lp-plan .lp-btn { margin-top: auto; }

/* ---------- faq ---------- */
.lp-faq-list { max-width: 760px; margin-top: 32px; border-top: 1px solid var(--line); }
.lp-faq details { border-bottom: 1px solid var(--line); }
.lp-faq summary { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 0; font-size: 17px; font-weight: 600; cursor: pointer; list-style: none; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary svg { flex: none; color: var(--ink-3); transition: rotate 200ms var(--ease); }
.lp-faq details[open] summary svg { rotate: 180deg; }
.lp-faq details p { max-width: 64ch; margin: 0 0 20px; color: var(--ink-2); line-height: 1.65; }

@media (max-width: 860px) {
  .lp-steps,
  .lp-plans { grid-template-columns: minmax(0, 1fr); }
}
```
Add to the reduced-motion block:
```css
  .lp-steps li { opacity: 1; translate: 0 0; }
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test && npm run i18n:check && npm run build`. Browser: steps rise in; the pricing toggle switches €5 "Billed monthly" ↔ €3 "Billed €36 a year" (RO: "5 €", "Facturat 36 € pe an"); the toggle works with arrow keys (native radios) and shows a focus ring; Pro button disabled; FAQ opens and closes with the keyboard. 390px OK.

- [ ] **Step 8: Commit**

```bash
git pull --rebase
git add web/src
git commit -m "feat(landing): steps, pricing and FAQ"
```

---

### Task 6: Docs + full verification pass

**Files:**
- Modify: `docs/architecture.md:123`, `CLAUDE.md` (Layout paragraph for `web/src/`)

- [ ] **Step 1: Update `docs/architecture.md:123`**

Replace the route sentence with:
```md
Every screen has its own URL (`web/src/route.ts`, History API, no router library): `/` public landing page, `/dashboard` SBC list, `/dashboard/sbc/{setId}/{challengeId}`, `/dashboard/club`, `/dashboard/settings`, `/setup`, `/guide`, so browser Back / Forward move between screens and links can be reloaded or shared. Old app paths without `/dashboard` still work: `useRoute` rewrites them. The server answers any other non-API path without a file extension with `index.html`. Switching challenges inside a set replaces the history entry, so Back leaves the set.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the `web/src/` part of Layout, after the `route.ts` mention add: `` `landing/` public landing page on `/` (lazy, CSS 3D + scroll-driven animation, demo art in `web/public/landing/`); the app lives under `/dashboard`. ``

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm test && npm run i18n:check && npm run build`
Expected: all pass (paste the output lines in the PR/summary).

Browser checklist (`npm run dev` already running, don't kill it):
- [ ] `/` signed out at 1440px and 390px: no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`), hero readable, CTA green.
- [ ] `/` signed in: top bar shows "Open dashboard" → `/dashboard`.
- [ ] EN ↔ RO switch on the landing: every string changes, no raw keys.
- [ ] Reduced motion emulated: static final states everywhere.
- [ ] Keyboard only: skip link, nav anchors, CTA, pricing radios, FAQ all reachable with a visible focus.
- [ ] Network tab on `/`: no ea.com requests, `App` chunk not loaded for signed-out visitors.
- [ ] `/club`, `/settings`, `/sbc/<id>` → rewritten to `/dashboard/...`; sign-in from `/dashboard/club` returns there.
- [ ] Lighthouse (mobile) accessibility ≥ 95, CLS < 0.05 on `/`.

- [ ] **Step 4: Commit**

```bash
git pull --rebase
git add docs/architecture.md CLAUDE.md
git commit -m "docs: landing page and /dashboard routes"
```
Do not push; ask the user.
