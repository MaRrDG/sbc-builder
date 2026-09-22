# FC27 SBC Builder

Finds the cheapest squad from the user's own EA FC 27 club that completes an SBC and shows it on a web-app-lookalike pitch. Read-only toward EA: never buy, sell or submit anything (EA bans for it). Product intent: `PRODUCT.md`, visual rules: `DESIGN.md`.

## Layout
- `server/` Fastify 5 API (Node 24, TS via `tsx`). `ea.ts` EA client + DTO types, `sync.ts` caching/sync + extension-driven cache edits, `sbc.ts` requirement parsing, `solver.ts` problem builder + `diagnose()`, `squad.ts` ported game formulas (rating, chemistry, `isRequirementMet`), `store.ts` JSON cache.
- `solver/cpsat.py` OR-Tools CP-SAT model, JSON in on stdin, JSON out on stdout.
- `web/src/` React 19 + Vite 8, plain CSS with OKLCH tokens (`styles.css`), Phosphor icons. `App.tsx` holds most state and the three views (SBC list/set screen, Club, Settings); `api.ts` typed fetch helpers; `repeat.ts` repeatability rules. Global solver settings and per-set local overrides are in `localStorage`; a set with local settings ignores the global ones.
- `extension/` Chrome MV3 bridge (session SID, SBC submits, packs, item moves).
- `data/` runtime cache per EA account (`data/accounts/<personaId>/`), git-ignored, contains sessions and keys: never commit or print keys/SIDs.

## Commands
```bash
npm run dev        # API :5178 (watch) + Vite :5173; keep it running, don't kill it after testing
npm run typecheck  # tsc over server + web
npm run build      # web -> dist/
SOLVER_DUMP=/tmp/p.json npm run dev:api && solver/.venv/bin/python solver/cpsat.py < /tmp/p.json
```
No automated test suite. Verify with typecheck + build, and against real cached EA data in `data/` or in the browser.

## Rules that matter
- Be gentle with EA: everything is cached with `fetchedAt`; sync only when stale (club 24 h, SBCs after the 20:01 Europe/Bucharest drop). Extension events edit the cache in place and keep `fetchedAt`.
- Be exact: game formulas are 1:1 ports of the web app code. `found` comes from the `squad.ts` re-check, not from the solver. Don't "simplify" these formulas.
- SBC repeatability comes from the set's `repeatabilityMode`: `NON_REPEATABLE`, `UNLIMITED`, or `REFRESH` (`repeats` per `repeatRefreshInterval` seconds, progress in `timesCompletedInInterval`). `repeatable: true` alone does not mean "can do it now".
- Auth: the UI sends `X-Account-Key`; the EA SID never leaves the server. Keys come via URL fragment `#keys=` into `localStorage`.
- UI must look like the EA web app: dark teal, EA card art, `--go` green only for the primary action / met / selected, `--pos` yellow only for position pills. Controls 8px radius, containers 14px. Respect `prefers-reduced-motion`, WCAG AA, requirement state never by color alone.
- New endpoint or payload change → update `docs/api.md`. Extension change → bump `extension/manifest.json` version + `extension/release.json`.

## Docs
`docs/architecture.md` (data flow, sync), `docs/api.md` (endpoints), `docs/solver.md` (model), `docs/extension.md`, `docs/deploy.md` (Docker + Apache + Cloudflare, prod runs `dev` branch).
