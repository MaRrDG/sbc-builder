# SEO: public SBC pages + site audit fixes

Date: 2026-10-16. Goal: FC Solver shows up for "sbc builder", "sbc solver", "sbc ai builder" and
"<SBC name> solution / cheapest" searches. Two parts, done in this order:

1. **Audit fixes** (small, from the external site audit).
2. **Public SBC pages** generated automatically from the SBC data every sync already stores.

Out of scope: an example "cheapest market" squad per SBC (we have no global price data), translated
URLs / hreflang, backlinks and Search Console setup (owner does those).

## Part 1: audit fixes

| Finding | Fix |
|---|---|
| `/guide`, `/setup`, `/daily` answer 404 to `HEAD` (GET is 200) | `setNotFoundHandler` in `server/index.ts` serves pages for `GET` and `HEAD` |
| No Organization JSON-LD | `web/index.html` JSON-LD becomes an `@graph`: `Organization` (name, url, logo, `sameAs` Discord invite), `WebSite`, `WebApplication` (`publisher` → Organization, `inLanguage` en/ro/it) |
| No contact on the page | Landing footer gets a contact `mailto:` (support address) and the no-JS fallback in `web/index.html` too |
| Keywords missing | Home title / description / H1 / fallback text and `/guide` meta name "SBC solver", "SBC builder", "AI"/"automatic" naturally, e.g. title `FC Solver · SBC Solver & Builder for EA FC 27` |
| Body text small on phones | Measure computed body / `p` font-size at 390px on the landing; raise to ≥16px where below |
| Mobile performance 65 | Run Lighthouse mobile on `/`, fix the top items (likely: landing chunk size, image formats/sizes, font preloads, render-blocking CSS) |
| CSP report-only | Check prod `[csp]` logs; if clean, owner sets `CSP_ENFORCE`. No code change unless logs show a missing origin |
| DMARC | DNS only, owner adds `_dmarc` TXT in Cloudflare (`v=DMARC1; p=none; rua=mailto:…`) |
| "170 odd px values" | Ignored (heuristic, no user impact) |

## Part 2: public SBC pages

### URLs

- `/sbcs` hub: active sets (ending soonest first; EA sends only category ids, so no grouping), then sets that ended in the last 60 days.
- `/sbcs/<slug>-<setId>`: one set, e.g. `/sbcs/marquee-matchups-16`. The id keeps the URL stable; a
  request with a wrong/old slug and a valid id answers 301 to the current slug.
- `/sbc/...` stays the legacy app path (`shared/paths.ts` APP); `sbcs` is added to `PUBLIC`.

### What gets published (automatic, no new EA calls)

Source: the vouched public snapshot of `sbc_sets` (`public_snapshot`, written only by a trusted account or when several accounts relayed the same public fields) + vouched `challenges`, all filled by every sync / relay. A set is public when:

- it has at least one `vouched` challenge (a forged relay cannot create an indexed page), and
- `raw.releaseTime` is unset or in the past (never publish an unreleased SBC), and
- `raw.hidden` is not true.

Only vouched challenges are shown. Expired sets keep their page with an "Expired" label; they leave
the sitemap 60 days after `endTime`. Pure rules in `server/sbcpages/rules.ts` (`isPublic`, `slugify`,
`inSitemap`), unit-tested.

Sitemap becomes dynamic: static pages + `/sbcs` + each public set, `lastmod` = set `lastSeen`.
New public set → IndexNow ping (Bing / Yandex), only when `INDEXNOW_KEY` is set; key file served at
`/<key>.txt`. Google discovers through the sitemap (owner submits it in Search Console once).

### Page content

- Set: name, description, category, expiry (or "Expired"), repeatability (from `repeatabilityMode`,
  same rules as `web/src/repeat.ts`), set rewards.
- Each challenge: name, formation, requirement lines (`parseRequirements` + global static `Meta` for
  names, text as EA-derived), challenge rewards (pack / coins / item, as sent).
- Stats (C): "Solved by N FC Solver players · X% found a squad" from `events` type `solve` with this
  `setId` (distinct `user_id`, share with `found`). Shown only when N ≥ 5. Cached 10 min.
- CTA "Solve it with your own club": signed out → sign-in / landing, signed in → `/dashboard/sbc/<setId>`.
- Short FAQ block ("How do I complete <name> cheaply?") with the SBC solver / builder wording.
- No EA images.

### Rendering

- Server: `sendPage` gets per-path meta from a resolver; for `/sbcs*` it loads the data, fills the
  `<head>` (title `<Name> SBC · cheapest solution from your club · FC Solver`, description from
  requirements, canonical, OG) and puts the full semantic HTML of the page inside `#root` (same idea
  as today's fallback, but visible, not delayed). JSON-LD: `BreadcrumbList` + `FAQPage`.
  HTML built by pure, escaped functions in `server/sbcpages/html.ts` (unit-tested for escaping).
- Unknown id / not public → 404 page (status 404, noindex).
- Web: lazy chunk `web/src/sbcs/` (hub + set page) fetching the JSON below and rendering in the site
  style; UI chrome through `t()` (en / ro / it keys), EA data as sent. Routes in `web/src/route.ts`.
- API (no auth, per-IP limit from `server/limits.ts`, `Cache-Control: public, max-age=600`):
  `GET /api/public/sbcs` (list) and `GET /api/public/sbcs/:setId` (set + challenges + stats).
  Same pure assembler feeds the HTML and the JSON. Documented in `docs/api.md`.

### Other

- Landing + footer link to `/sbcs` ("All SBCs") so crawlers find the hub.
- Changelog entry (en / ro / it): public SBC pages.
- No analytics event needed beyond a `sbc_page_cta` click (`track()`, `docs/analytics.md`).

### Testing

- `npm test`: rules (public / slug / sitemap window), HTML escaping, sitemap output, stats threshold.
- `npm run typecheck`, `npm run build`, `npm run i18n:check`.
- Local: `curl` `/sbcs`, a set page, a non-public id, `HEAD` on pages, `/sitemap.xml`; browser at
  1280px and 390px; Lighthouse mobile on `/` before / after.
