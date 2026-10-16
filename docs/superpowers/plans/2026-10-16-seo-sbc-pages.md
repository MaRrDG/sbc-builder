# SEO: public SBC pages + audit fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank for "sbc solver / sbc builder / <SBC name> solution" by fixing the site audit findings and publishing one crawlable page per released SBC set, generated automatically from data the sync already stores.

**Architecture:** Pure modules in `server/sbcpages/` (rules, view assembler, HTML) fed by a small DB reader. The server serves `/sbcs` and `/sbcs/<slug>-<id>` as index.html with a per-page `<head>` and full semantic HTML inside `#root`; a lazy React chunk then renders the same JSON (`/api/public/sbcs*`) in the site style. Sitemap is dynamic; IndexNow pings new sets.

**Tech Stack:** Fastify 5, Drizzle/Postgres, node:test, React 19 + Vite, plain CSS tokens, i18n via `t()`.

**Spec:** `docs/superpowers/specs/2026-10-16-seo-sbc-pages-design.md`

## Global Constraints

- Never call EA for these pages; data only from `sbc_sets` / `challenges` / `events`.
- Public set = ≥1 `vouched` challenge AND (`raw.releaseTime` unset or ≤ now) AND `raw.hidden !== true`. Only vouched challenges shown.
- Expired sets keep their page ("Expired"); leave the sitemap 60 days after `endTime`.
- Stats shown only when distinct solvers ≥ 5.
- URL: `/sbcs/<slug>-<setId>`; wrong slug + valid id → 301 to current slug. `/sbc/...` stays the app.
- Every HTML string from EA data goes through `esc()`; JSON-LD via `JSON.stringify` with `<` escaped as `\u003c`.
- UI strings via `t()` with keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`npm run i18n:check`). EA data stays as sent.
- New endpoints in `docs/api.md`; new track event in `TrackEvents` + `docs/analytics.md`; user-visible change → `shared/changelog.ts` en/ro/it (written, not machine-translated).
- Phone width 390px checked for every UI change; `prefers-reduced-motion` respected; WCAG AA.
- Commits: `git pull --rebase`, `type(scope): subject`, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

- A set name with `<`, `"`, `&` or `</script>` → rendered escaped in body, head and JSON-LD (Task 6 test).
- A set name that slugifies to empty (all non-latin / emoji) → URL `/sbcs/sbc-<id>` still works (Task 4 test).
- `/sbcs/abc`, `/sbcs/-16`, `/sbcs/x-99999999999` (non-public / huge id) → 404 page, noindex, no DB error (Task 4 `parseSetSlug` test + Task 7 curl).
- Stats with 4 solvers → not shown; `found` missing in old events → counted as not found (Task 5 test).
- `HEAD /sbcs/<slug>` and `HEAD /guide` → 200 with no body (Task 1 + Task 7 curl).

---

## Part 1: audit fixes

### Task 1: HEAD on pages answers like GET

**Files:**
- Modify: `server/index.ts:965-972` (`setNotFoundHandler`)

- [ ] **Step 1: Reproduce**

Run (dev server running): `curl -sI -o /dev/null -w '%{http_code}\n' http://localhost:5178/guide`
Expected now: `404`.

- [ ] **Step 2: Fix** — in the not-found handler change the method check:

```ts
  if ((req.method === 'GET' || req.method === 'HEAD') && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path) && existsSync(dist))
```

(Fastify strips the body for HEAD replies.)

- [ ] **Step 3: Verify**

Run: `for p in /guide /setup /daily /nope; do curl -sI -o /dev/null -w "$p %{http_code}\n" http://localhost:5178$p; done`
Expected: `/guide 200`, `/setup 200`, `/daily 200`, `/nope 404`. Note: needs `dist/` (run `npm run build` first if missing).

- [ ] **Step 4: Commit** — `fix(seo): answer HEAD on site pages like GET`

### Task 2: Keywords, Organization JSON-LD, contact link

**Files:**
- Modify: `server/seo.ts:12-55` (`PAGES['/']`, `PAGES['/guide']`)
- Modify: `web/index.html` (title / description / og / twitter defaults, JSON-LD block, fallback `<main>`)
- Modify: `web/src/landing/Landing.tsx:171-200` (footer: contact link)
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`landing.footer.contact`), `web/src/locales/*` meta.landing if it holds the title
- Test: `server/seo.test.ts`

- [ ] **Step 1: Failing test** in `server/seo.test.ts`:

```ts
test('home and guide meta carry the search terms', () => {
  const home = pageMeta('/')!;
  assert.match(home.title, /SBC Solver/);
  assert.match(home.title, /SBC Builder/i);
  assert.match(home.description, /SBC builder/i);
  assert.match(pageMeta('/guide')!.description, /SBC solver/i);
});
```

Run: `node --import tsx --test server/seo.test.ts` → FAIL.

- [ ] **Step 2: Update `PAGES`**

```ts
  '/': {
    title: 'FC Solver · SBC Solver & Builder for EA FC 27',
    description:
      'Automatic SBC solver and SBC builder for EA FC 27: FC Solver finds the cheapest valid squad from the players you already own, club and SBC storage included, checks every requirement and chemistry, and never buys, sells or submits anything.',
  },
  '/guide': {
    title: 'How the FC Solver SBC solver works · EA FC 27',
    description:
      'How the FC Solver SBC solver reads your EA FC 27 club and SBC list through a small Chrome extension, builds the cheapest squad for each challenge automatically and leaves the submitting to you.',
  },
```

Mirror the home title/description into the static defaults in `web/index.html` (`<title>`, `description`, `og:*`, `twitter:*`) so the template matches. Check `t('meta.landing')` in `web/src/locales/en.ts` and use the same English title there (ro/it: keep their language, add "SBC Solver & Builder" naturally).

- [ ] **Step 3: JSON-LD `@graph`** — replace the `<script type="application/ld+json">` block in `web/index.html`:

```html
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": "__SITE__/#org",
            "name": "FC Solver",
            "url": "__SITE__/",
            "logo": "__SITE__/apple-touch-icon.png",
            "email": "contact@fc-solver.app",
            "contactPoint": { "@type": "ContactPoint", "contactType": "customer support", "email": "contact@fc-solver.app" }
          },
          { "@type": "WebSite", "@id": "__SITE__/#site", "name": "FC Solver", "url": "__SITE__/", "publisher": { "@id": "__SITE__/#org" }, "inLanguage": ["en", "ro", "it"] },
          {
            "@type": "WebApplication",
            "name": "FC Solver",
            "url": "__SITE__/",
            "image": "__SITE__/og.png",
            "applicationCategory": "GameApplication",
            "operatingSystem": "Web, Chrome",
            "inLanguage": ["en", "ro", "it"],
            "publisher": { "@id": "__SITE__/#org" },
            "description": "Automatic SBC solver and builder: finds the cheapest squad from your own EA FC 27 club that completes a Squad Building Challenge. Read-only toward EA: never buys, sells or submits anything.",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }
          }
        ]
      }
    </script>
```

- [ ] **Step 4: Fallback text + contact** — in the fallback `<main>` of `web/index.html`, H1 becomes `FC Solver: SBC solver and SBC builder for EA FC 27, from your own club`; first paragraph starts with "FC Solver is an automatic SBC solver:"; links line gets `· <a href="/sbcs" style="color: #c8f53c">All SBCs</a> · <a href="mailto:contact@fc-solver.app" style="color: #c8f53c">Contact</a>`.
In `Landing.tsx` footer add a list item `<li><a className="lp-foot-link" href="mailto:contact@fc-solver.app">{t('landing.footer.contact')}</a></li>` next to the existing product links (read lines 171-200 to place it in the right column). Keys: en `Contact`, ro `Contact`, it `Contatti`.

- [ ] **Step 5: Verify** — `node --import tsx --test server/seo.test.ts` PASS; `npm run i18n:check`; `npm run typecheck`; validate the JSON-LD parses: `npm run build && node -e "const h=require('fs').readFileSync('dist/index.html','utf8');JSON.parse(h.match(/ld\+json\">([\s\S]*?)<\/script>/)[1].replace(/__SITE__/g,'https://x'));console.log('ok')"`.

- [ ] **Step 6: Commit** — `feat(seo): search terms, organization data, contact link`

### Task 3: Mobile text size + performance

**Files:** determined by measurement; likely `web/src/landing/landing.css`, `web/index.html`, `web/vite.config.ts`, images in `web/public/landing/`.

- [ ] **Step 1: Baseline** — `npm run build`, serve prod build (`npm run dev` API serves `dist/` at :5178). Run `npx -y lighthouse@12 http://localhost:5178/ --form-factor=mobile --only-categories=performance --output=json --output-path=/tmp/lh-before.json --chrome-flags="--headless"`; record score, LCP, TBT, CLS and the top 5 `opportunities`/`diagnostics` (largest JS chunks, image sizes, render-blocking).
- [ ] **Step 2: Font size** — at 390px in the browser, read computed `font-size` of `body` and landing `p`. Any body copy under 16px → raise to 16px in `landing.css` (headings untouched). Re-check layout at 390px.
- [ ] **Step 3: Fix the top items only** (each a separate small change): e.g. convert large landing PNG/JPG to WebP/AVIF with `width`/`height` attributes and `loading="lazy"` below the fold; ensure the landing chunk does not pull app-only code (inspect `dist/assets` sizes); `fetchpriority="high"` on the LCP element; drop unused font preloads. Do not change game formulas or app screens.
- [ ] **Step 4: Re-measure** — same Lighthouse command to `/tmp/lh-after.json`; report before/after numbers. Check `prefers-reduced-motion` and 390px still fine.
- [ ] **Step 5: Commit** — `perf(landing): faster first paint on phones, 16px body text`

---

## Part 2: public SBC pages

### Task 4: Pure rules

**Files:**
- Create: `server/sbcpages/rules.ts`
- Test: `server/sbcpages/rules.test.ts`

**Interfaces — Produces:**
- `slugify(name: string): string`
- `setPath(setId: number, name: string): string` → `/sbcs/<slug>-<id>`
- `parseSetSlug(segment: string): { setId: number; slug: string } | null`
- `isPublic(s: { raw: { releaseTime?: number; hidden?: boolean } }, vouchedCount: number, nowSec: number): boolean`
- `inSitemap(endTime: number | null, nowSec: number): boolean`
- `isExpired(endTime: number | null, nowSec: number): boolean`
- `formatAward(a: unknown): string | null`
- `SITEMAP_GRACE_DAYS = 60`, `STATS_MIN_SOLVERS = 5`

- [ ] **Step 1: Failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAward, inSitemap, isExpired, isPublic, parseSetSlug, setPath, slugify } from './rules.js';

const NOW = 1_800_000_000;

test('slugify keeps latin words, drops the rest', () => {
  assert.equal(slugify('Marquee Matchups'), 'marquee-matchups');
  assert.equal(slugify("  League & Nation: Advanced!! "), 'league-nation-advanced');
  assert.equal(slugify('Ödegaard POTM'), 'odegaard-potm');
  assert.equal(slugify('⭐⭐'), '');
});

test('setPath falls back when the slug is empty', () => {
  assert.equal(setPath(16, 'Marquee Matchups'), '/sbcs/marquee-matchups-16');
  assert.equal(setPath(7, '⭐'), '/sbcs/sbc-7');
});

test('parseSetSlug reads the trailing id only', () => {
  assert.deepEqual(parseSetSlug('marquee-matchups-16'), { setId: 16, slug: 'marquee-matchups' });
  assert.deepEqual(parseSetSlug('16'), { setId: 16, slug: '' });
  assert.equal(parseSetSlug('abc'), null);
  assert.equal(parseSetSlug('x-0'), null);
  assert.equal(parseSetSlug('x-99999999999'), null); // > 9 digits
  assert.equal(parseSetSlug(''), null);
});

test('isPublic needs a vouched challenge, a past release and not hidden', () => {
  assert.equal(isPublic({ raw: { releaseTime: NOW - 10 } }, 1, NOW), true);
  assert.equal(isPublic({ raw: {} }, 1, NOW), true);
  assert.equal(isPublic({ raw: { releaseTime: NOW + 10 } }, 1, NOW), false);
  assert.equal(isPublic({ raw: { releaseTime: NOW - 10 } }, 0, NOW), false);
  assert.equal(isPublic({ raw: { hidden: true } }, 3, NOW), false);
});

test('expired sets leave the sitemap after 60 days', () => {
  assert.equal(inSitemap(null, NOW), true);
  assert.equal(inSitemap(NOW - 59 * 86400, NOW), true);
  assert.equal(inSitemap(NOW - 61 * 86400, NOW), false);
  assert.equal(isExpired(NOW - 1, NOW), true);
  assert.equal(isExpired(null, NOW), false);
});

test('formatAward', () => {
  assert.equal(formatAward({ type: 'coin', value: 5000, count: 1 }), '5,000 coins');
  assert.equal(formatAward({ type: 'pack', value: 509, count: 1, isUntradeable: true }), 'Pack (untradeable)');
  assert.equal(formatAward({ type: 'pack', value: 509, count: 2, isUntradeable: false }), '2× Pack');
  assert.equal(formatAward({ type: 'item', itemDataReduced: { description: 'Player pick' } }), 'Player pick');
  assert.equal(formatAward({ type: 'item' }), 'Item');
  assert.equal(formatAward(null), null);
});
```

Run: `node --import tsx --test server/sbcpages/rules.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// Which SBC sets get a public page and how they are addressed. Pure: no DB, no clock reads.

export const SITEMAP_GRACE_DAYS = 60;
export const STATS_MIN_SOLVERS = 5;

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export const setPath = (setId: number, name: string) => `/sbcs/${slugify(name) || 'sbc'}-${setId}`;

/** `marquee-matchups-16` → id 16; the slug part is only used to redirect to the current one. */
export function parseSetSlug(segment: string): { setId: number; slug: string } | null {
  const m = /^(?:([a-z0-9-]*)-)?(\d{1,9})$/.exec(segment);
  if (!m) return null;
  const setId = Number(m[2]);
  return setId > 0 ? { setId, slug: m[1] ?? '' } : null;
}

export function isPublic(s: { raw: { releaseTime?: number; hidden?: boolean } }, vouchedCount: number, nowSec: number): boolean {
  if (vouchedCount < 1 || s.raw.hidden === true) return false;
  return !s.raw.releaseTime || s.raw.releaseTime <= nowSec;
}

export const isExpired = (endTime: number | null, nowSec: number) => !!endTime && endTime < nowSec;
export const inSitemap = (endTime: number | null, nowSec: number) => !endTime || endTime + SITEMAP_GRACE_DAYS * 86400 >= nowSec;

/** One reward line in English (EA sends no pack names with SBC awards). */
export function formatAward(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as { type?: string; value?: number; count?: number; isUntradeable?: boolean; itemDataReduced?: { description?: string } };
  const times = x.count && x.count > 1 ? `${x.count}× ` : '';
  if (x.type === 'coin') return `${(x.value ?? 0).toLocaleString('en-US')} coins`;
  if (x.type === 'pack') return `${times}Pack${x.isUntradeable ? ' (untradeable)' : ''}`;
  if (x.type === 'item') return x.itemDataReduced?.description || 'Item';
  return x.type ? `${times}${x.type[0].toUpperCase()}${x.type.slice(1)}` : null;
}
```

- [ ] **Step 3: Run** → PASS. **Step 4: Commit** — `feat(sbcpages): rules for public SBC pages`

### Task 5: DB reader + stats

**Files:**
- Create: `server/db/sbcpages.ts`
- Create: `server/sbcpages/stats.ts` (pure) + `server/sbcpages/stats.test.ts`

**Interfaces — Produces:**
- `type SetRow = { setId: number; name: string; description: string; categoryId: number | null; repeatabilityMode: string | null; endTime: number | null; raw: Record<string, unknown>; lastSeen: Date }`
- `type ChallengeRow = { challengeId: number; setId: number; name: string; formation: string | null; elgOperation: string | null; elgReq: EligibilityReq[]; raw: Record<string, unknown> }`
- `publicSetRows(nowSec: number): Promise<SetRow[]>` — sets passing `isPublic`
- `publicSetRow(setId: number, nowSec: number): Promise<{ set: SetRow; challenges: ChallengeRow[] } | null>`
- `solveRows(setId: number): Promise<{ userId: string | null; found: boolean }[]>`
- pure `summarizeSolves(rows: { userId: string | null; found: boolean }[]): { solvers: number; foundPct: number } | null`

- [ ] **Step 1: Failing test** `server/sbcpages/stats.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSolves } from './stats.js';

const r = (userId: string | null, found: boolean) => ({ userId, found });

test('hidden under 5 distinct solvers', () => {
  assert.equal(summarizeSolves([r('a', true), r('b', true), r('c', true), r('d', true), r('d', true)]), null);
});

test('distinct users, found share over users who ever found one', () => {
  const rows = [r('a', true), r('a', false), r('b', false), r('c', true), r('d', false), r('e', true), r(null, true)];
  assert.deepEqual(summarizeSolves(rows), { solvers: 5, foundPct: 60 });
});
```

- [ ] **Step 2: Implement `server/sbcpages/stats.ts`**

```ts
import { STATS_MIN_SOLVERS } from './rules.js';

/** "Solved by N players · X% found a squad": per distinct user, found if any of their solves found one. */
export function summarizeSolves(rows: { userId: string | null; found: boolean }[]): { solvers: number; foundPct: number } | null {
  const users = new Map<string, boolean>();
  for (const { userId, found } of rows) if (userId) users.set(userId, (users.get(userId) ?? false) || found);
  if (users.size < STATS_MIN_SOLVERS) return null;
  const ok = [...users.values()].filter(Boolean).length;
  return { solvers: users.size, foundPct: Math.round((ok / users.size) * 100) };
}
```

- [ ] **Step 3: Implement `server/db/sbcpages.ts`**

```ts
// Reads for the public SBC pages (server/sbcpages/). Sets with at least one vouched challenge;
// release / hidden rules in rules.ts.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { EligibilityReq } from '../ea.js';
import { isPublic } from '../sbcpages/rules.js';
import { db } from './index.js';
import { challenges, events, sbcSets } from './schema.js';

export interface SetRow { setId: number; name: string; description: string; categoryId: number | null; repeatabilityMode: string | null; endTime: number | null; raw: Record<string, unknown>; lastSeen: Date }
export interface ChallengeRow { challengeId: number; setId: number; name: string; formation: string | null; elgOperation: string | null; elgReq: EligibilityReq[]; raw: Record<string, unknown> }

const setCols = {
  setId: sbcSets.setId, name: sbcSets.name, description: sbcSets.description, categoryId: sbcSets.categoryId,
  repeatabilityMode: sbcSets.repeatabilityMode, endTime: sbcSets.endTime, raw: sbcSets.raw, lastSeen: sbcSets.lastSeen,
};

export async function publicSetRows(nowSec: number): Promise<SetRow[]> {
  const vouched = db
    .select({ setId: challenges.setId, n: sql<number>`count(*)::int`.as('n') })
    .from(challenges).where(eq(challenges.vouched, true)).groupBy(challenges.setId).as('v');
  const rows = await db.select({ ...setCols, n: vouched.n }).from(sbcSets).innerJoin(vouched, eq(vouched.setId, sbcSets.setId));
  return rows.filter((r) => isPublic({ raw: r.raw as { releaseTime?: number; hidden?: boolean } }, r.n, nowSec)).map(({ n: _n, ...r }) => r as SetRow);
}

export async function publicSetRow(setId: number, nowSec: number): Promise<{ set: SetRow; challenges: ChallengeRow[] } | null> {
  const [set] = await db.select(setCols).from(sbcSets).where(eq(sbcSets.setId, setId));
  if (!set) return null;
  const list = await db
    .select({ challengeId: challenges.challengeId, setId: challenges.setId, name: challenges.name, formation: challenges.formation, elgOperation: challenges.elgOperation, elgReq: challenges.elgReq, raw: challenges.raw })
    .from(challenges).where(and(eq(challenges.setId, setId), eq(challenges.vouched, true)));
  if (!isPublic({ raw: set.raw as { releaseTime?: number; hidden?: boolean } }, list.length, nowSec)) return null;
  return { set: set as SetRow, challenges: list as ChallengeRow[] };
}

export async function solveRows(setId: number): Promise<{ userId: string | null; found: boolean }[]> {
  const rows = await db
    .select({ userId: events.userId, found: sql<boolean>`coalesce((${events.data}->>'found')::boolean, false)` })
    .from(events)
    .where(and(eq(events.type, 'solve'), sql`${events.data}->>'setId' = ${String(setId)}`));
  return rows;
}
```

(Check `sbcSets.lastSeen` is the column name produced by `seen()` in `schema.ts`; adapt if it is `lastSeenAt`. Remove the unused `inArray` import if the linter complains.)

- [ ] **Step 4: Verify** — `node --import tsx --test server/sbcpages/stats.test.ts` PASS; `npm run typecheck` PASS; smoke: `node --import tsx -e "import('./server/db/index.js').then(async m=>{await m.initDb();const r=await import('./server/db/sbcpages.js');console.log((await r.publicSetRows(Date.now()/1000)).map(s=>s.name));await m.closeDb()})"` prints local set names.
- [ ] **Step 5: Commit** — `feat(sbcpages): read public sets and solve stats`

### Task 6: View assembler + HTML

**Files:**
- Create: `server/sbcpages/view.ts`, `server/sbcpages/html.ts`
- Test: `server/sbcpages/view.test.ts`, `server/sbcpages/html.test.ts`

**Interfaces:**
- Consumes: Task 4 rules, Task 5 `SetRow`/`ChallengeRow`, `parseRequirements` (`server/sbc.ts:53`), `Meta` (`server/meta.ts:40`).
- Produces (also the JSON shape of `/api/public/sbcs/:id`; copy the types to `web/src/api.ts`):

```ts
export interface SbcChallengeView { id: number; name: string; formation: string | null; requirements: string[]; rewards: string[] }
export interface SbcSetView {
  id: number; path: string; name: string; description: string; categoryId: number | null;
  endTime: number | null; expired: boolean; repeatability: 'once' | 'unlimited' | 'refresh';
  repeats: number | null; refreshHours: number | null; rewards: string[];
  challenges: SbcChallengeView[]; stats: { solvers: number; foundPct: number } | null;
}
export interface SbcListItem { id: number; path: string; name: string; endTime: number | null; expired: boolean; challenges: number; rewards: string[] }
export function setView(set: SetRow, list: ChallengeRow[], meta: Meta, stats: SbcSetView['stats'], nowSec: number): SbcSetView
export function listItem(set: SetRow, nowSec: number): SbcListItem
export function sortList(items: SbcListItem[]): SbcListItem[] // active by endTime asc (no end last), then expired by endTime desc
// html.ts
export function setHead(v: SbcSetView): { title: string; description: string }
export function hubHead(): { title: string; description: string }
export function setBody(v: SbcSetView): string
export function hubBody(items: SbcListItem[]): string
export function setJsonLd(v: SbcSetView, base: string): string // <script type="application/ld+json">…</script>
export function hubJsonLd(base: string): string
```

- [ ] **Step 1: Failing tests** `server/sbcpages/view.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listItem, setView, sortList } from './view.js';
import type { Meta } from '../meta.js';

const NOW = 1_800_000_000;
const meta = { names: { nation: { 42: 'Brazil' }, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const set = { setId: 16, name: 'Marquee Matchups', description: 'Four matches', categoryId: 2, repeatabilityMode: 'REFRESH', endTime: NOW + 3600, lastSeen: new Date(), raw: { repeats: 1, repeatRefreshInterval: 86400, awards: [{ type: 'pack', value: 509, count: 1, isUntradeable: true }] } };
const ch = { challengeId: 1, setId: 16, name: 'Brazil v Spain', formation: 'f433', elgOperation: 'AND', raw: { awards: [{ type: 'coin', value: 500 }] },
  elgReq: [{ type: 'PLAYER_COUNT', eligibilityKey: 2, eligibilitySlot: 1, eligibilityValue: 1 }, { type: 'SCOPE', eligibilityKey: 13, eligibilitySlot: 1, eligibilityValue: 0 }, { type: 'NATION_ID', eligibilityKey: 10, eligibilitySlot: 1, eligibilityValue: 42 }] };

test('set view', () => {
  const v = setView(set, [ch], meta, null, NOW);
  assert.equal(v.path, '/sbcs/marquee-matchups-16');
  assert.equal(v.repeatability, 'refresh');
  assert.equal(v.refreshHours, 24);
  assert.deepEqual(v.rewards, ['Pack (untradeable)']);
  assert.equal(v.challenges[0].requirements.length, 1);
  assert.match(v.challenges[0].requirements[0], /Brazil/);
  assert.deepEqual(v.challenges[0].rewards, ['500 coins']);
  assert.equal(v.expired, false);
});

test('list order: active soonest-ending first, then expired newest first', () => {
  const mk = (id: number, endTime: number | null) => listItem({ ...set, setId: id, endTime }, NOW);
  const ids = sortList([mk(1, NOW - 10), mk(2, null), mk(3, NOW + 50), mk(4, NOW - 5), mk(5, NOW + 10)]).map((x) => x.id);
  assert.deepEqual(ids, [5, 3, 2, 4, 1]);
});
```

`server/sbcpages/html.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBody, setHead, setJsonLd } from './html.js';
import type { SbcSetView } from './view.js';

const evil: SbcSetView = { id: 9, path: '/sbcs/x-9', name: 'A <b>&"</script>', description: '<img src=x onerror=1>', categoryId: null, endTime: null, expired: false,
  repeatability: 'once', repeats: null, refreshHours: null, rewards: ['<i>'], challenges: [{ id: 1, name: '<c>', formation: null, requirements: ['<r>'], rewards: [] }], stats: { solvers: 7, foundPct: 86 } };

test('body escapes EA text', () => {
  const b = setBody(evil);
  assert.ok(!b.includes('<b>') && !b.includes('<img') && !b.includes('<c>') && !b.includes('<r>') && !b.includes('<i>'));
  assert.match(b, /&lt;b&gt;&amp;&quot;/);
  assert.match(b, /<h1>/);
  assert.match(b, /7 FC Solver players/);
});

test('json-ld cannot close its script tag', () => {
  const j = setJsonLd(evil, 'https://fc-solver.app');
  assert.equal(j.match(/<\/script>/g)?.length, 1);
  assert.doesNotThrow(() => JSON.parse(j.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')));
});

test('head names the set and the search terms', () => {
  const h = setHead({ ...evil, name: 'Marquee Matchups' });
  assert.equal(h.title, 'Marquee Matchups SBC · cheapest solution from your club · FC Solver');
  assert.match(h.description, /SBC solver/);
});
```

Run both → FAIL.

- [ ] **Step 2: Implement `server/sbcpages/view.ts`**

```ts
// The public view of one SBC set: what both the server HTML (html.ts) and /api/public/sbcs/:id show.
import type { ChallengeRow, SetRow } from '../db/sbcpages.js';
import type { Meta } from '../meta.js';
import { parseRequirements } from '../sbc.js';
import { formatAward, isExpired, setPath } from './rules.js';

export interface SbcChallengeView { id: number; name: string; formation: string | null; requirements: string[]; rewards: string[] }
export interface SbcSetView {
  id: number; path: string; name: string; description: string; categoryId: number | null;
  endTime: number | null; expired: boolean; repeatability: 'once' | 'unlimited' | 'refresh';
  repeats: number | null; refreshHours: number | null; rewards: string[];
  challenges: SbcChallengeView[]; stats: { solvers: number; foundPct: number } | null;
}
export interface SbcListItem { id: number; path: string; name: string; endTime: number | null; expired: boolean; challenges: number; rewards: string[] }

const rewards = (raw: Record<string, unknown>) => (Array.isArray(raw.awards) ? raw.awards : []).map(formatAward).filter((x): x is string => !!x);

function repeat(set: SetRow): Pick<SbcSetView, 'repeatability' | 'repeats' | 'refreshHours'> {
  if (set.repeatabilityMode === 'UNLIMITED') return { repeatability: 'unlimited', repeats: null, refreshHours: null };
  if (set.repeatabilityMode === 'REFRESH') {
    const sec = Number(set.raw.repeatRefreshInterval) || 0;
    return { repeatability: 'refresh', repeats: Number(set.raw.repeats) || null, refreshHours: sec ? Math.round(sec / 3600) : null };
  }
  return { repeatability: 'once', repeats: null, refreshHours: null };
}

export function setView(set: SetRow, list: ChallengeRow[], meta: Meta, stats: SbcSetView['stats'], nowSec: number): SbcSetView {
  return {
    id: set.setId, path: setPath(set.setId, set.name), name: set.name, description: set.description, categoryId: set.categoryId,
    endTime: set.endTime, expired: isExpired(set.endTime, nowSec), ...repeat(set), rewards: rewards(set.raw),
    challenges: [...list].sort((a, b) => a.challengeId - b.challengeId).map((c) => ({
      id: c.challengeId, name: c.name, formation: c.formation,
      requirements: parseRequirements(c.elgReq, meta).map((r) => r.text), rewards: rewards(c.raw),
    })),
    stats,
  };
}

export const listItem = (set: SetRow, nowSec: number): SbcListItem => ({
  id: set.setId, path: setPath(set.setId, set.name), name: set.name, endTime: set.endTime,
  expired: isExpired(set.endTime, nowSec), challenges: Number(set.raw.challengesCount) || 0, rewards: rewards(set.raw),
});

export function sortList(items: SbcListItem[]): SbcListItem[] {
  const end = (x: SbcListItem) => x.endTime ?? Number.MAX_SAFE_INTEGER;
  return [...items.filter((x) => !x.expired).sort((a, b) => end(a) - end(b)), ...items.filter((x) => x.expired).sort((a, b) => end(b) - end(a))];
}
```

- [ ] **Step 3: Implement `server/sbcpages/html.ts`**

```ts
// Server HTML for the public SBC pages: what crawlers read inside #root before the app takes over.
// Plain, escaped, inline-styled like the index.html fallback. EA text stays as sent.
import type { SbcListItem, SbcSetView } from './view.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const date = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const LINK = 'style="color: #c8f53c"';
const WRAP = 'style="max-width: 720px; margin: 48px auto; padding: 0 16px; color: #f3f1ea; font-family: system-ui, sans-serif; line-height: 1.5"';

const howTo = (name: string) =>
  `Pick ${name} in FC Solver and press Solve: the SBC solver builds the cheapest squad that meets every requirement from the players you already own, SBC storage included, and checks chemistry the way the game does. You then build it in the web app yourself. FC Solver never buys, sells or submits anything.`;

export function setHead(v: SbcSetView) {
  const reqs = v.challenges.flatMap((c) => c.requirements).slice(0, 3).join(', ');
  return {
    title: `${v.name} SBC · cheapest solution from your club · FC Solver`,
    description: `${v.name} SBC for EA FC 27: ${v.challenges.length} challenge${v.challenges.length === 1 ? '' : 's'}${reqs ? ` (${reqs})` : ''}. Our SBC solver builds the cheapest squad from your own club.`.slice(0, 300),
  };
}

export const hubHead = () => ({
  title: 'All EA FC 27 SBCs · requirements and cheapest solutions · FC Solver',
  description: 'Every live EA FC 27 Squad Building Challenge with its requirements and rewards. The FC Solver SBC builder finds the cheapest squad for each one from your own club.',
});

export function setBody(v: SbcSetView): string {
  const meta = [
    v.expired ? 'Expired' : v.endTime ? `Ends ${date(v.endTime)}` : null,
    v.repeatability === 'unlimited' ? 'Repeatable' : v.repeatability === 'refresh' ? `Repeatable${v.repeats ? ` ${v.repeats}×` : ''}${v.refreshHours ? ` every ${v.refreshHours} h` : ''}` : 'One time',
  ].filter(Boolean).join(' · ');
  const list = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<main ${WRAP}>
<nav aria-label="Breadcrumb"><a href="/" ${LINK}>FC Solver</a> › <a href="/sbcs" ${LINK}>SBCs</a></nav>
<h1>${esc(v.name)} SBC</h1>
<p>${esc(v.description)}</p>
<p>${esc(meta)}</p>
${v.rewards.length ? `<h2>Rewards</h2>${list(v.rewards)}` : ''}
${v.stats ? `<p>Solved by ${v.stats.solvers} FC Solver players · ${v.stats.foundPct}% found a squad</p>` : ''}
<h2>Challenges</h2>
${v.challenges.map((c) => `<section><h3>${esc(c.name)}</h3>${c.formation ? `<p>Formation: ${esc(c.formation)}</p>` : ''}${list(c.requirements)}${c.rewards.length ? `<p>Reward: ${esc(c.rewards.join(', '))}</p>` : ''}</section>`).join('\n')}
<h2>How do I complete ${esc(v.name)} cheaply?</h2>
<p>${esc(howTo(v.name))}</p>
<p><a href="/signin" ${LINK}>Solve it with your own club</a></p>
</main>`;
}

export function hubBody(items: SbcListItem[]): string {
  const row = (x: SbcListItem) => `<li><a href="${esc(x.path)}" ${LINK}>${esc(x.name)}</a>${x.expired ? ' · Expired' : x.endTime ? ` · ends ${date(x.endTime)}` : ''}</li>`;
  const active = items.filter((x) => !x.expired);
  const old = items.filter((x) => x.expired);
  return `<main ${WRAP}>
<h1>All EA FC 27 SBCs</h1>
<p>Requirements and rewards of every Squad Building Challenge. FC Solver is an SBC solver and SBC builder: it finds the cheapest squad for each one from the players you already own.</p>
<h2>Live SBCs</h2><ul>${active.map(row).join('')}</ul>
${old.length ? `<h2>Expired SBCs</h2><ul>${old.map(row).join('')}</ul>` : ''}
</main>`;
}

export function setJsonLd(v: SbcSetView, base: string): string {
  return ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'FC Solver', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: 'SBCs', item: `${base}/sbcs` },
        { '@type': 'ListItem', position: 3, name: `${v.name} SBC`, item: `${base}${v.path}` },
      ] },
      { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `How do I complete ${v.name} cheaply?`, acceptedAnswer: { '@type': 'Answer', text: howTo(v.name) } }] },
    ],
  });
}

export const hubJsonLd = (base: string) =>
  ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'FC Solver', item: `${base}/` },
    { '@type': 'ListItem', position: 2, name: 'SBCs', item: `${base}/sbcs` },
  ] });
```

- [ ] **Step 4: Run** `node --import tsx --test server/sbcpages/*.test.ts` → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(sbcpages): page view and crawlable HTML`

### Task 7: Server wiring (pages, API, sitemap, 301/404, IndexNow)

**Files:**
- Create: `server/sbcpages/service.ts` (cached loaders + IndexNow ticker)
- Modify: `server/seo.ts` (`renderHead` extra arg, `sitemapXml` extra entries)
- Modify: `server/index.ts` (API routes, `sendPage` for `/sbcs*`, sitemap, IndexNow key file, ticker start)
- Modify: `shared/paths.ts:5` (add `'sbcs'` to `PUBLIC`)
- Modify: `docs/api.md`, `docs/architecture.md` (one paragraph), `.env.example` (`INDEXNOW_KEY=`)
- Test: `server/seo.test.ts`

**Interfaces:**
- Consumes: Tasks 4-6.
- Produces:
  - `seo.ts`: `renderHead(html, path, base, canonicalHost, imageVersion = '', page?: { meta: PageMeta; body: string; jsonLd: string; canonical: string })` — when `page` is given it wins over `PAGES`, is indexable on the canonical host, replaces the whole `<div id="root">…</div>` content with `page.body` and appends `page.jsonLd` before `</head>`.
  - `seo.ts`: `sitemapXml(base, extra: { path: string; lastmod?: string }[] = [])`.
  - `service.ts`: `hubData(): Promise<SbcListItem[]>`, `setData(setId: number): Promise<SbcSetView | null>` (10 min in-memory cache each, stats included), `sitemapEntries(): Promise<{ path: string; lastmod: string }[]>`, `startIndexNow(base: string): void`.

- [ ] **Step 1: Failing tests** in `server/seo.test.ts` (add `<div id="root"><main>old</main></div>` before `</head></html>`'s closing — put it in a body: change `HTML` to end with `</head><body><div id="root"><main class="seo-fallback">old</main></div>\n<script type="module" src="/x.js"></script></body></html>`):

```ts
test('a dynamic page fills head, body and json-ld', () => {
  const out = renderHead(HTML, '/sbcs/marquee-matchups-16', 'https://fc-solver.app', true, '', {
    meta: { title: 'MM SBC', description: 'desc' }, body: '<main>NEW</main>', jsonLd: '<script type="application/ld+json">{}</script>', canonical: '/sbcs/marquee-matchups-16',
  });
  assert.match(out, /<title>MM SBC<\/title>/);
  assert.match(out, /<meta name="robots" content="index, follow" \/>/);
  assert.match(out, /href="https:\/\/fc-solver\.app\/sbcs\/marquee-matchups-16"/);
  assert.match(out, /<div id="root"><main>NEW<\/main><\/div>/);
  assert.ok(!out.includes('old'));
  assert.match(out, /application\/ld\+json">\{\}<\/script>\s*<\/head>/);
  assert.match(out, /<script type="module" src="\/x.js">/);
});

test('sitemap takes extra entries with lastmod', () => {
  const xml = sitemapXml('https://fc-solver.app', [{ path: '/sbcs/a-1', lastmod: '2026-10-16' }]);
  assert.match(xml, /<loc>https:\/\/fc-solver\.app\/sbcs\/a-1<\/loc><lastmod>2026-10-16<\/lastmod>/);
});
```

Run → FAIL.

- [ ] **Step 2: `seo.ts` changes**

In `renderHead` add the parameter and, at the start:

```ts
  const meta = page?.meta ?? pageMeta(path);
  const indexable = canonicalHost && !!meta;
  const url = `${base}${page ? page.canonical : pageMeta(path) ? canonicalPath(path) : '/'}`;
```

then use `meta` instead of `page` for title/description; after the head tags:

```ts
  if (page) {
    out = out.replace(/<div id="root">[\s\S]*?<\/div>(\s*<script type="module")/, `<div id="root">${page.body}</div>$1`);
    out = out.replace('</head>', `${page.jsonLd}\n  </head>`);
  }
```

`sitemapXml(base, extra = [])`: append `extra.map((e) => \`  <url><loc>${esc(base + e.path)}</loc>${e.lastmod ? \`<lastmod>${e.lastmod}</lastmod>\` : ''}<changefreq>daily</changefreq><priority>0.7</priority></url>\`)` after the static urls, plus `/sbcs` with priority 0.8 as a static `PAGES`-less entry (add `'/sbcs'` to the `extra` list in service, not to `PAGES`).

Run seo tests → PASS (existing tests still pass).

- [ ] **Step 3: `server/sbcpages/service.ts`**

```ts
// Cached data for the public SBC pages and the IndexNow ping for newly public sets.
import { publicSetRow, publicSetRows, solveRows } from '../db/sbcpages.js';
import { loadMeta } from '../meta.js';
import { readCache, writeCache } from '../store.js';
import { inSitemap, setPath } from './rules.js';
import { summarizeSolves } from './stats.js';
import { listItem, setView, sortList, type SbcListItem, type SbcSetView } from './view.js';

const TTL = 10 * 60_000;
const now = () => Math.floor(Date.now() / 1000);
const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
}

export const hubData = () => cached('hub', async (): Promise<SbcListItem[]> => sortList((await publicSetRows(now())).map((s) => listItem(s, now()))));

export const setData = (setId: number) =>
  cached(`set:${setId}`, async (): Promise<SbcSetView | null> => {
    const row = await publicSetRow(setId, now());
    if (!row) return null;
    return setView(row.set, row.challenges, await loadMeta(), summarizeSolves(await solveRows(setId)), now());
  });

export const sitemapEntries = () =>
  cached('sitemap', async () => [
    { path: '/sbcs', lastmod: new Date().toISOString().slice(0, 10) },
    ...(await publicSetRows(now())).filter((s) => inSitemap(s.endTime, now())).map((s) => ({ path: setPath(s.setId, s.name), lastmod: s.lastSeen.toISOString().slice(0, 10) })),
  ]);

/** Hourly: sets that became public since the last run are sent to IndexNow (Bing, Yandex…). Off without INDEXNOW_KEY. */
export function startIndexNow(base: string): void {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return;
  const run = async () => {
    try {
      const rows = await publicSetRows(now());
      const seen = new Set((await readCache<number[]>('indexnow'))?.data ?? []);
      const first = seen.size === 0; // first run: remember, don't flood
      const fresh = rows.filter((s) => !seen.has(s.setId));
      if (fresh.length && !first) {
        const res = await fetch('https://api.indexnow.org/indexnow', {
          method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: fresh.map((s) => base + setPath(s.setId, s.name)) }),
        });
        if (!res.ok && res.status !== 202) throw new Error(`indexnow ${res.status}`);
      }
      await writeCache('indexnow', rows.map((s) => s.setId));
    } catch (e) {
      console.warn('[indexnow]', (e as Error).message);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 3_600_000).unref();
}
```

- [ ] **Step 4: `shared/paths.ts`** — add `'sbcs'` to `PUBLIC`. Check `shared/paths.test.ts` (if present) and add `assert.equal(isKnownPath('/sbcs/marquee-matchups-16'), true)`.

- [ ] **Step 5: `server/index.ts`**
  - API (after `/api/solve`):

```ts
app.get('/api/public/sbcs', async (_req, reply) => reply.header('Cache-Control', 'public, max-age=600').send({ sets: await hubData() }));
app.get<{ Params: { id: string } }>('/api/public/sbcs/:id', async (req, reply) => {
  const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : 0;
  const set = id ? await setData(id) : null;
  if (!set) return reply.code(404).send({ error: 'not found', msgCode: 'err.notFound' });
  return reply.header('Cache-Control', 'public, max-age=600').send({ set });
});
```

(the global `apiLimit` already rate-limits per IP; check `err.notFound` exists in locales, else use an existing not-found msgCode.)
  - `sendPage`: before rendering, for paths starting with `/sbcs`:

```ts
  let page: Parameters<typeof renderHead>[5];
  const [, top, seg] = path.split('/');
  if (top === 'sbcs') {
    const base = siteUrl(publicOrigin(claimed));
    if (!seg) {
      const items = await hubData();
      page = { meta: hubHead(), body: hubBody(items), jsonLd: hubJsonLd(base), canonical: '/sbcs' };
    } else {
      const ref = parseSetSlug(seg);
      const set = ref ? await setData(ref.setId) : null;
      if (!set) reply.code(404);
      else if (`/sbcs/${seg}` !== set.path) return reply.redirect(set.path, 301);
      else page = { meta: setHead(set), body: setBody(set), jsonLd: setJsonLd(set, base), canonical: set.path };
    }
  }
```

  Move the `claimed` computation above this block; noindex header becomes `if (!canonical || !(page || pageMeta(path)))`; pass `page` as the 6th arg to `renderHead`. A DB error here must not break the page: wrap the block in `try { … } catch (e) { console.warn('[sbcpages]', (e as Error).message); page = undefined; }`.
  - Sitemap route: `.send(sitemapXml(base, await sitemapEntries().catch(() => [])))` (make the handler async).
  - IndexNow key file: `if (process.env.INDEXNOW_KEY) app.get(\`/${process.env.INDEXNOW_KEY}.txt\`, (_q, r) => r.type('text/plain').send(process.env.INDEXNOW_KEY));` registered before `fastifyStatic`; start `startIndexNow(siteUrl(process.env.SITE_URL ?? ''))` next to `scheduleDaily()` only when `SITE_URL` is set.

- [ ] **Step 6: Docs** — `docs/api.md`: both endpoints (no auth, cached 10 min, 404 shape, `SbcSetView` / `SbcListItem` fields). `docs/architecture.md`: "Public SBC pages" paragraph (source tables, public rule, sitemap, IndexNow). `.env.example`: `INDEXNOW_KEY=` with a comment (32 hex chars, owner generates).

- [ ] **Step 7: Verify**

```bash
npm test && npm run typecheck && npm run build
curl -s localhost:5178/sbcs | grep -E '<title>|<h1>|robots'
curl -s localhost:5178/sbcs/marquee-matchups-16 | grep -E '<title>|<h1>|canonical|ld\+json' | head
curl -sI localhost:5178/sbcs/wrong-16 | grep -iE '^HTTP|location'      # 301 → /sbcs/marquee-matchups-16
curl -s -o /dev/null -w '%{http_code}\n' localhost:5178/sbcs/x-999999   # 404
curl -sI -o /dev/null -w '%{http_code}\n' localhost:5178/sbcs/marquee-matchups-16  # 200
curl -s localhost:5178/sitemap.xml | grep sbcs
curl -s localhost:5178/api/public/sbcs/16 | head -c 400
```

- [ ] **Step 8: Commit** — `feat(sbcpages): serve public SBC pages, API and sitemap`

### Task 8: Web pages (hub + set) in the site style

**Files:**
- Modify: `web/src/route.ts` (views `sbcHub`, `sbcPage`) + `web/src/route.test.ts` (if present; else create)
- Create: `web/src/sbcpages/SbcPages.tsx`, `web/src/sbcpages/sbcpages.css`
- Modify: `web/src/Root.tsx:24-120` (lazy import, `publicView`, render), `web/src/api.ts` (types + `publicSbcs()`, `publicSbc(id)`)
- Modify: `web/src/landing/Landing.tsx` footer (link "All SBCs" → `{ view: 'sbcHub' }`)
- Modify: `web/src/track.ts` (`sbc_page_cta: { signed_in: YN }`), `docs/analytics.md`
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`sbcpages.*`, `landing.footer.sbcs`, `meta.sbcHub`)
- Modify: `shared/changelog.ts` (today's entry, en/ro/it)

**Interfaces:**
- Consumes: JSON from Task 7 (`{ sets: SbcListItem[] }`, `{ set: SbcSetView }`).
- Produces: `Route` members `{ view: 'sbcHub' }` and `{ view: 'sbcPage'; setId: number; slug: string }`; `routePath` → `/sbcs` and `/sbcs/<slug>-<id>`.

- [ ] **Step 1: Failing route test**

```ts
test('public SBC pages', () => {
  assert.deepEqual(parseRoute('/sbcs'), { view: 'sbcHub' });
  assert.deepEqual(parseRoute('/sbcs/marquee-matchups-16'), { view: 'sbcPage', setId: 16, slug: 'marquee-matchups' });
  assert.deepEqual(parseRoute('/sbcs/abc').view, 'notFound');
  assert.equal(routePath({ view: 'sbcPage', setId: 16, slug: 'marquee-matchups' }), '/sbcs/marquee-matchups-16');
  assert.deepEqual(parseRoute('/sbc/16'), { view: 'sbcs', setId: 16, challengeId: null }); // the app path is unchanged
});
```

Run `node --import tsx --test web/src/route.test.ts` → FAIL.

- [ ] **Step 2: `route.ts`** — add to `Route`; in `parseRoute` after the `changelog` line:

```ts
  if (a === 'sbcs') {
    if (!b) return { view: 'sbcHub' };
    const m = /^(?:([a-z0-9-]*)-)?(\d{1,9})$/.exec(b);
    return m && Number(m[2]) > 0 ? { view: 'sbcPage', setId: Number(m[2]), slug: m[1] ?? '' } : { view: 'notFound', path };
  }
```

in `routePath`: `case 'sbcHub': return '/sbcs';` and `case 'sbcPage': return \`/sbcs/${r.slug || 'sbc'}-${r.setId}\`;`. Run → PASS.

- [ ] **Step 3: `api.ts`** — copy `SbcChallengeView`, `SbcSetView`, `SbcListItem` from `server/sbcpages/view.ts`; add `publicSbcs = () => req<{ sets: SbcListItem[] }>('/api/public/sbcs')` and `publicSbc = (id: number) => req<{ set: SbcSetView }>(\`/api/public/sbcs/${id}\`)` (use the same unauthenticated helper the Daily page uses — check `web/src/daily/` for it).

- [ ] **Step 4: `SbcPages.tsx`** — two components following `ChangelogPage` (`web/src/changelog/ChangelogPage.tsx:9-60`: same `onboarding legal` shell, logo, `LangMenu`, `go()` link helper):
  - `SbcHub({ navigate, signedIn })`: fetch `publicSbcs()`; loading skeleton; error → `t('sbcpages.error')` with retry; H1 `t('sbcpages.hubTitle')`, intro `t('sbcpages.hubIntro')`, "Live" and "Expired" lists of links (name, `t('sbcpages.ends', { date })` / `t('sbcpages.expired')`, rewards). `document.title = t('meta.sbcHub')`.
  - `SbcPage({ setId, navigate, signedIn })`: fetch `publicSbc(setId)`; 404 → render the existing not-found view (`navigate({ view: 'notFound', path: location.pathname }, true)`); if `location.pathname !== set.path` → `history.replaceState` to `set.path`. Shows breadcrumb (FC Solver › SBCs), H1 `{set.name} SBC`, description, meta chips (end date / Expired, repeatability text via `t('sbcpages.repeat.once' | '.unlimited' | '.refresh', { n, h })`), rewards, stats line `t('sbcpages.stats', { n, pct })` when present, each challenge as a card (name, formation, requirement list, reward), FAQ block (`t('sbcpages.howTitle', { name })`, `t('sbcpages.howBody')`), primary CTA button (`--go`) `t('sbcpages.cta')`: signed in → `navigate({ view: 'sbcs', setId: set.id, challengeId: null })`, signed out → `navigate({ view: 'signin', next: \`/dashboard/sbc/${set.id}\` })`; `track('sbc_page_cta', { signed_in: yn(signedIn) })` (`yn` from `track.ts`). `document.title = \`${set.name} SBC · FC Solver\``.
  - Expired state is shown with the word, not only color. Controls 8px radius, cards 14px. No animation beyond what `onboarding` already has.
  - `sbcpages.css`: card grid one column under 860px, two columns above; tokens from `styles.css` only.

- [ ] **Step 5: Root wiring** — `const SbcPages = lazy(() => import('./sbcpages/SbcPages'))` (export both components; use `.then(m => ({ default: m.SbcHub }))` / `m.SbcPage` like `ChangelogPage`); add `'sbcHub'` and `'sbcPage'` to the `publicView` check (`Root.tsx:69`); render them like `changelog` (`Root.tsx:97-101`).

- [ ] **Step 6: i18n** — en keys (write ro and it yourself, natural wording; ro plurals `_one/_few/_other`, it `_one/_other` for `sbcpages.stats` and `sbcpages.challenges`):

```ts
  'meta.sbcHub': 'All EA FC 27 SBCs · FC Solver',
  'sbcpages.hubTitle': 'All SBCs',
  'sbcpages.hubIntro': 'Requirements and rewards of every Squad Building Challenge. FC Solver finds the cheapest squad for each one from the players you already own.',
  'sbcpages.live': 'Live SBCs',
  'sbcpages.expiredList': 'Expired SBCs',
  'sbcpages.expired': 'Expired',
  'sbcpages.ends': 'Ends {date}',
  'sbcpages.repeat.once': 'One time',
  'sbcpages.repeat.unlimited': 'Repeatable',
  'sbcpages.repeat.refresh': 'Repeatable {n}× every {h} h',
  'sbcpages.rewards': 'Rewards',
  'sbcpages.challengesTitle': 'Challenges',
  'sbcpages.challenges_one': '{count} challenge',
  'sbcpages.challenges_other': '{count} challenges',
  'sbcpages.formation': 'Formation',
  'sbcpages.stats_one': 'Solved by {count} FC Solver player · {pct}% found a squad',
  'sbcpages.stats_other': 'Solved by {count} FC Solver players · {pct}% found a squad',
  'sbcpages.howTitle': 'How do I complete {name} cheaply?',
  'sbcpages.howBody': 'Open it in FC Solver and press Solve: it builds the cheapest squad that meets every requirement from your own club, SBC storage included, and checks chemistry like the game. You build it in the web app yourself. FC Solver never buys, sells or submits anything.',
  'sbcpages.cta': 'Solve it with your own club',
  'sbcpages.error': 'Could not load the SBCs.',
  'sbcpages.retry': 'Try again',
  'landing.footer.sbcs': 'All SBCs',
```

(single-brace params like `{n}`; check how plurals pass `count` in an existing key.) Run `npm run i18n:check`.

- [ ] **Step 7: track + changelog** — `TrackEvents`: `sbc_page_cta: { signed_in: YN };` and a row in `docs/analytics.md`. `shared/changelog.ts`: add a `2026-10-16` entry (or items to it if it exists) — en: `New public SBC pages: every live SBC with its requirements, rewards and how many FC Solver players solved it, at fc-solver.app/sbcs. Open one and solve it with your own club in one click`; write ro and it versions yourself.

- [ ] **Step 8: Verify** — `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build`. Browser (dev :5173): `/sbcs` and a set page at 1280px and 390px, signed out and signed in; CTA lands on the right screen; wrong slug ends on the right URL; `/sbcs/x-999999` shows the 404 walkout; the app's `/dashboard/sbc/16` still opens the SBC screen. Landing footer shows "All SBCs" and "Contact".
- [ ] **Step 9: Commit** — `feat(sbcpages): public SBC hub and set pages`

### Task 9: Final check

- [ ] `npm test && npm run typecheck && npm run i18n:check && npm run build` all green.
- [ ] Lighthouse mobile on `/sbcs/<a set>` (SEO 100, no console errors).
- [ ] `git log --oneline` shows one commit per task; report to the owner: what changed, before/after Lighthouse, and the owner's to-dos: Search Console (verify domain, submit `https://fc-solver.app/sitemap.xml`), `INDEXNOW_KEY` + `SITE_URL` in prod `.env`, DMARC TXT, `CSP_ENFORCE` after a clean `[csp]` log check, release with `deploy/release.sh`.
