# Landing page + app under /dashboard

Date: 2026-09-23. Status: approved. Plan: `docs/superpowers/plans/2026-09-23-landing-page.md`.

## Goal
A public landing page at `/` that explains what FC Solver does and why it beats the alternatives, with 3D parallax and scroll animation that stays readable, fast and on-brand (no "AI slop": no purple gradients, glass cards, hero-metric tiles, emoji). The signed-in app moves under `/dashboard`.

Out of scope: Stripe, plan limits, upgrade screens (separate project). Pricing is shown, not enforced.

## Routing (`web/src/route.ts`, `web/src/Root.tsx`)
| Path | View | Auth |
|---|---|---|
| `/` | landing | public (signed-in users see it too, CTA becomes "Open dashboard") |
| `/dashboard` | SBC list | signed in |
| `/dashboard/sbc/:set[/:challenge]` | set / challenge | signed in |
| `/dashboard/club`, `/dashboard/settings`, `/dashboard/admin` | as today | signed in |
| `/signin`, `/signin/callback`, `/guide`, `/setup` | unchanged | public |

- New `Route` variant `{ view: 'landing' }`; `parseRoute('/')` returns it.
- Legacy paths `/sbc/...`, `/club`, `/settings`, `/admin` parse to the same routes; `useRoute` rewrites the URL to the `/dashboard/...` form with `replaceState` on load, so bookmarks keep working.
- Default post-sign-in destination and SSO callback target become `/dashboard` (`safeNext` default, `HandleSSOCallback`, `SignIn next`). Signed-out user on a dashboard path → `/signin?next=<path>` as today.
- App brand link (`App.tsx` `href="/"`) goes to `/dashboard`; landing link from the account menu is optional, not required.
- Extension and server: no path assumptions found (checked `extension/*.js`, `server/*.ts`); SPA fallback already serves `index.html` for any path. `docs/architecture.md` / README mentions of routes get updated.
- `next.test.ts` / new `route.test.ts` cover parse + legacy mapping + `routePath` round trip.

## Landing structure (`web/src/components/Landing.tsx` + `landing/` subcomponents, lazy-loaded like `App`)
1. **Top bar**: logo, anchors (How it works, Pricing, FAQ), language menu, "Sign in" / "Open dashboard".
2. **Hero**: headline ("The cheapest squad, from your own club."), one-line lede, primary CTA `--go` "Start free" → `/signin?next=/dashboard`, secondary "How it works" (anchor). Visual: a pitch tilted in perspective with 5–7 real FUT cards on separate `translateZ` layers; subtle pointer tilt; on scroll the pitch flattens and the cards land into slots while requirement ticks appear.
3. **Three differentiators**, each a small scene, not an icon card:
   - *Only your club*: your cards drop into the squad; market price tags beside them get struck through ("costs you 0 coins you don't have").
   - *Optimal, not a guess*: requirements tick one by one (✓ glyph + text, never color alone) while a cost counter falls to its minimum; line about CP-SAT + re-check with the game's own formulas.
   - *No ban risk*: flow diagram EA web app → extension → FC Solver, labelled read-only: never buys, sells or submits; few cached requests.
4. **How it works, 3 steps**: install the extension, open the EA web app, press Solve (links `/setup`, `/guide`).
5. **Pricing**: Free ("a limited number of SBCs", no number yet) and Pro: €5 / month, or €3 / month billed yearly (€36). Monthly/yearly toggle. Pro button disabled with "Coming soon".
6. **FAQ** (native `<details>`): Can I get banned? What data do you read? What does the extension do? Does it cost coins?
7. **Footer**: short disclaimer (not affiliated with EA), language, links.

Copy is written plainly and specifically (real numbers from the product, no filler superlatives). All strings via `t()` in `locales/en.ts` + `ro.ts` under `landing.*`; `npm run i18n:check` passes.

## Motion / 3D technique (no new dependencies)
- CSS 3D transforms (`perspective`, `preserve-3d`, `translateZ`) for depth.
- Pointer tilt: `useTilt` hook, rAF-throttled, writes two CSS custom properties; disabled on coarse pointers and reduced motion.
- Scroll-linked: CSS `animation-timeline: view()` / `scroll()` where supported (`@supports`); fallback `useInView` (IntersectionObserver) toggles a class for simple fade-rise.
- Durations 150–600ms ease-out-quart; only `transform` / `opacity` animated.
- `prefers-reduced-motion: reduce` → static final state everywhere (flat pitch, cards in slots, ticks shown).

## Visual rules
DESIGN.md tokens only (`--bg-0`, `--surface`, `--pitch`, `--ink*`, `--go` for primary CTA + met ticks, `--pos` for position pills). Barlow Condensed for display, Geist for text. Controls 8px radius, containers 14px. Cards reuse the existing `Card` component with a static demo squad; its art is self-hosted under `web/public/landing/` (no EA hotlinking from a public page). WCAG AA contrast; keyboard reachable; phone width 390px checked; under 860px the landing top bar hides the section anchors (logo, language, CTA stay).

## Performance
Landing chunk lazy-loaded; `App` not loaded on `/` for signed-out users. Demo card images `loading="lazy"` except the hero. No layout shift from the hero (fixed aspect box).

## Verification
`npm run typecheck`, `npm test`, `npm run i18n:check`, `npm run build`; browser check at 1440px and 390px, reduced-motion on, signed-out and signed-in, legacy URL redirect, sign-in → `/dashboard`.
