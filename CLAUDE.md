# FC Solver

Finds the cheapest squad from the user's own EA FC 27 club that completes an SBC and shows it on a web-app-lookalike pitch. Read-only toward EA: never buy, sell or submit anything (EA bans for it). Product intent: `PRODUCT.md`, visual rules: `DESIGN.md`.

## Layout
- `server/` Fastify 5 API (Node 24, TS via `tsx`). `ea.ts` EA client + DTO types, `sync.ts` caching/sync + extension-driven cache edits, `sbc.ts` requirement parsing, `solver.ts` problem builder + `diagnose()`, `squad.ts` ported game formulas (rating, chemistry, `isRequirementMet`), `store.ts` JSON cache, `db/` Postgres via Drizzle (`schema.ts`, `sbcs.ts` SBC history + shared brick layouts, migrations in `db/migrations/`, `users.ts` users / persona owners / link tokens), `bricks.ts` pure brick rules, `auth.ts` Clerk session → user + persona, `auth-rules.ts` pure link rules.
- `solver/cpsat.py` OR-Tools CP-SAT model, JSON in on stdin, JSON out on stdout.
- `web/src/` React 19 + Vite 8, plain CSS with OKLCH tokens (`styles.css`), Phosphor icons. `App.tsx` holds most state and the three views (SBC list/set screen, Club, Settings); `Root.tsx` auth gate (Clerk loaded / signed out / signed in), `components/SignIn.tsx` sign-in screen, `link.ts` site ↔ extension messages, `api.ts` typed fetch helpers; `repeat.ts` repeatability rules, `route.ts` URL routing (screen state lives in the URL; use `navigate`, not local state, for screens); `legal/` terms / privacy / cookies (`docs.ts` holds both languages as whole documents; operator, contact and date at the top); `landing/` public landing page on `/` (lazy, CSS 3D + scroll-driven animation, demo art in `web/public/landing/`); the app lives under `/dashboard`. Global solver settings and per-set local overrides are in `localStorage`; a set with local settings ignores the global ones.
- `extension/` Chrome MV3 bridge (session SID, SBC submits, packs, item moves).
- `data/` runtime cache per EA account (`data/accounts/<personaId>/`), git-ignored, contains sessions and keys: never commit or print keys/SIDs.

## Commands
```bash
npm run dev        # API :5178 (watch) + Vite :5173; keep it running, don't kill it after testing
npm run typecheck  # tsc over server + web
npm run build      # web -> dist/
SOLVER_DUMP=/tmp/p.json npm run dev:api && solver/.venv/bin/python solver/cpsat.py < /tmp/p.json
npm test           # node:test unit tests (server/**/*.test.ts, web/src/**/*.test.ts)
npm run db:generate  # new migration after editing server/db/schema.ts
npm run db:import    # backfill Postgres from data/accounts
npm run db:trust     # list / add / --remove trusted accounts
```
`DATABASE_URL`, `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` (Clerk development instance locally) in `.env` (git-ignored, see `.env.example`); local DB `fcsolver` in the `postgresql` container.
Unit tests only for pure logic (`npm test`). Verify with typecheck + build, and against real cached EA data in `data/` or in the browser.

## Rules that matter
- Be gentle with EA: only syncs may call EA (never a page load, set open or solve); everything is cached with `fetchedAt`; sync only when stale (club and SBCs once a day after the 20:01 Europe/Bucharest drop, or on the first web app visit after it; the SBC list also on a visit — SBC page opened or back in the web app — at most every 30 min). The extension relays what the web app loads (`server/events.ts`), which fills the cache for free. Every call is metered per account (`server/meter.ts`, daily cap `EA_DAILY_LIMIT`, 15 min pause on throttling codes).
- Be exact: game formulas are 1:1 ports of the web app code. `found` comes from the `squad.ts` re-check, not from the solver. Don't "simplify" these formulas.
- SBC repeatability comes from the set's `repeatabilityMode`: `NON_REPEATABLE`, `UNLIMITED`, or `REFRESH` (`repeats` per `repeatRefreshInterval` seconds, progress in `timesCompletedInInterval`). `repeatable: true` alone does not mean "can do it now".
- Auth: the site signs in with Clerk (own UI on `@clerk/react` v6 hooks, no Clerk components) and sends `Authorization: Bearer` + `X-Persona`; `server/auth.ts` checks the persona belongs to the user (`personas` table). The extension keeps a per-persona key (`X-Account-Key`) that never reaches the browser; extension 0.8+ links the persona to the signed-in user via `site.js` + a link token in `/api/hello`; taking over another user's persona needs a fresh SID proof. Client mode (extension 0.7+): every EA request runs in the web app tab (`extension/hook.js` recipes, `server/jobs.ts` queue); the server keeps no SID and only calls EA once to prove an account. Legacy mode (old extensions) still syncs server-side; remove it once all accounts run 0.7. Never add a job recipe that writes to EA.
- Site text is translated (English / Romanian): every string goes through `t()` from `web/src/i18n.tsx`, keys in `web/src/locales/en.ts` + `ro.ts` (Romanian plurals need `_one`/`_few`/`_other`); run `npm run i18n:check`. What comes from EA (SBC / challenge names and descriptions, requirement texts, players, clubs, leagues, nations, rarities) stays as EA sends it. Server errors shown to users carry a `msgCode` (+ params) the site translates (`err.*`).
- Responsive: under 860px the sidebar becomes the hamburger menu and the top bar keeps only logo, status and the menu button; check phone width (390px) for any UI change.
- UI must look like the EA web app: dark teal, EA card art, `--go` green only for the primary action / met / selected, `--pos` yellow only for position pills. Controls 8px radius, containers 14px. Respect `prefers-reduced-motion`, WCAG AA, requirement state never by color alone.
- Security: headers + a report-only CSP in `server/index.ts` (`csp()`); a new external script / API / font / frame origin must be added there (watch the `[csp]` log). Anything printed from the request host (zip, robots, sitemap, canonical) goes through `publicOrigin()` (`server/origins.ts`). Per-IP limits in `server/limits.ts`.
- New endpoint or payload change → update `docs/api.md`. Extension change → bump `extension/manifest.json` version + `extension/release.json`.
- The extension zip folder stays `fc27-sbc-builder` (users unzip updates over it; a new name = a new extension and lost keys). Domain, container, Apache vhost and `localStorage` keys keep the old `sbc-*` names too; only user-facing branding is "FC Solver".

## Docs
`docs/architecture.md` (data flow, sync), `docs/api.md` (endpoints), `docs/solver.md` (model), `docs/extension.md`, `docs/deploy.md` (Docker + Apache + Cloudflare, prod runs `dev` branch).
