# Changelog and v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dated, hand-written changelog (EN/RO/IT) on a public `/changelog` page with an unread dot in the dashboard sidebar, auto-posted in English by the Discord bot to a new `📝・changelog` channel; everything is v1.

**Architecture:** One data file `shared/changelog.ts` (entries + pure helpers) is imported by the web app (page + dot) and by the server (`GET /api/bot/changelog`, English only). The bot polls that endpoint like the Daily post and dedupes by reading its own messages in the channel (Discord is the state).

**Tech Stack:** TypeScript, React 19 + Vite, Fastify 5, discord.js 14, node:test.

**Spec:** `docs/superpowers/specs/2026-10-12-changelog-v1-design.md`

## Deviations from the spec (found while planning)

- Data lives in `shared/changelog.ts`, not `web/src/changelog/entries.ts`: the runtime Docker image has no `web/` (only `dist/`), and the server must import the entries. `shared/` is copied into both image stages and added to `tsconfig.json` and the test glob.
- The dashboard sidebar link opens the public `/changelog` page (like the Daily link opens `/daily`), instead of a second `/dashboard/changelog` screen inside the shell. One page, one route.

## Global Constraints

- Version shown everywhere as "v1" (`APP_VERSION = '1'`); `package.json` and the extension `1.0.0`.
- Site text through `t()` (en/ro/it, `npm run i18n:check`); changelog items are data per language, not `t()` keys.
- Discord changelog posts are English only, no mentions, in `📝・changelog` (INFO, read-only).
- `localStorage` key `sbc-changelog-seen` (old `sbc-*` naming), wrapped in try/catch.
- Unread state never by color alone (sr-only label on the dot). Check 390px.
- New endpoint → `docs/api.md`. Extension change → manifest + `release.json`.

## Review Focus

- First bot run on an empty channel: posts only the newest entry, not the whole history.
- Bot restarted after posting: posts nothing again (dedupe on its own `Changelog <id>` content line; another user's text with the same id does not count).
- Two entries the same day (`2026-10-12`, `2026-10-12-2`): both posted, in date order, and the dedupe does not confuse `…-12` with `…-12-2`.
- `localStorage` blocked: the page still renders, the dot simply shows (no crash).
- An entry with a missing language or mismatched item count fails `npm test` before it ships.

---

### Task 1: Changelog data and pure helpers

**Files:**
- Create: `shared/changelog.ts`, `shared/changelog.test.ts`
- Modify: `tsconfig.json` (include `shared`), `package.json` (test glob `'shared/**/*.test.ts'`), `Dockerfile` (`COPY shared ./shared` in both stages)

**Interfaces:**
- Produces: `APP_VERSION: '1'`, `type ChangelogLang = 'en' | 'ro' | 'it'`, `interface ChangelogEntry { id: string; date: string; items: Record<ChangelogLang, string[]> }`, `CHANGELOG: ChangelogEntry[]` (newest first), `checkEntries(e: ChangelogEntry[]): string[]` (problems; empty = ok), `latestEnglish(e: ChangelogEntry[], n: number): { id: string; date: string; items: string[] }[]`, `hasUnread(e: ChangelogEntry[], seen: string | null): boolean`.

- [ ] **Step 1: failing tests** — `checkEntries(CHANGELOG)` is `[]`; `checkEntries` reports a missing language, a count mismatch, an empty string, a duplicate id, an id not matching `^\d{4}-\d{2}-\d{2}(-\d+)?$` / its `date`, and wrong order (newer after older; `-2` must come before the plain id of the same day); `latestEnglish` returns at most `n`, English items only, newest first; `hasUnread` true for `null` / an older id, false for the newest id, false for an empty list.
- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** implement. Order key: `(date, suffix number, plain = 1)` descending.

```ts
const seq = (id: string) => Number(id.split('-')[3] ?? 1);
const newer = (a: ChangelogEntry, b: ChangelogEntry) => a.date > b.date || (a.date === b.date && seq(a.id) > seq(b.id));
```

First entry `2026-10-12`: FC Solver v1 — summary of today's features, en/ro/it, each written in its language.
- [ ] **Step 4:** `npm test` → PASS; `npm run typecheck`.
- [ ] **Step 5:** commit `feat(changelog): v1 changelog data`.

### Task 2: Bot endpoint

**Files:** Modify `server/discord/routes.ts` (next to `/api/bot/daily`), `docs/api.md`.

**Interfaces:** Consumes `APP_VERSION`, `CHANGELOG`, `latestEnglish`. Produces `GET /api/bot/changelog` → `{ version: '1', entries: { id, date, items: string[] }[] }` (5 newest, English).

- [ ] **Step 1:** add route:

```ts
s.get('/api/bot/changelog', async () => ({ version: APP_VERSION, entries: latestEnglish(CHANGELOG, 5) }));
```
- [ ] **Step 2:** `docs/api.md` section after `/api/bot/daily`.
- [ ] **Step 3:** typecheck; with dev running, `curl -s -H "X-Bot-Token: $BOT_API_TOKEN" localhost:5178/api/bot/changelog` returns the entry.
- [ ] **Step 4:** commit `feat(changelog): bot endpoint with the newest entries`.

### Task 3: Discord channel and post

**Files:**
- Modify: `discord/layout.ts` (`CH.changelog = textName('📝', 'changelog')`, channel in INFO after announcements: `readOnly: true`, topic `What changed in FC Solver`), `discord/layout.test.ts` if it lists INFO channels.
- Create: `discord/changelog.ts`, `discord/changelog.test.ts`.
- Modify: `discord/index.ts` (ticker).

**Interfaces:**
- Consumes: `/api/bot/changelog` shape; `brandEmbed`, `linkRow` from `content.ts`; `findText` from `guild.ts`.
- Produces: `type BotEntry = { id: string; date: string; items: string[] }`, `changelogMessage(id)`, `changelogPost(e: BotEntry, siteUrl: string, icon?: string)`, `alreadyPosted(msgs, id, botId)`, `toPost(entries: BotEntry[], msgs: { authorId: string; content: string }[], botId: string): BotEntry[]`.

- [ ] **Step 1: failing tests** — `changelogMessage('2026-10-12') === 'Changelog 2026-10-12'`; post: embed title `FC Solver v1 · 12 Oct 2026`, description = `• item` lines, button URL `<site>/changelog`, `allowedMentions { parse: [] }`; `alreadyPosted` only the bot's own message, `…-12` not matched by `…-12-2` and vice versa; `toPost` on a channel with no bot post → only newest; with the previous entry posted → the missing newer ones oldest first; all posted → `[]`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implement (`alreadyPosted`: content split on newline, first line equals `changelogMessage(id)`; date label via `toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })` on `${date}T12:00:00Z`; description trimmed to 4000 chars).
- [ ] **Step 4:** `index.ts`: `postChangelog(guild)` — fetch `/api/bot/changelog`, `findText(guild, CAT.info, CH.changelog)`, last 50 messages, send `toPost(...)` in order; catch → `console.warn('[bot] changelog: …')`. Call on ready and `setInterval(…, 10 * 60_000)`.
- [ ] **Step 5:** `npm test`, typecheck. Commit `feat(discord): changelog channel and posts`.

### Task 4: Site page, sidebar dot, footer

**Files:**
- Modify: `web/src/route.ts` (`{ view: 'changelog' }` ↔ `/changelog`, doc comment), `web/src/route.test.ts` if present, `web/src/Root.tsx` (public view, render page), `server/seo.ts` (`/changelog` meta → sitemap), `web/src/App.tsx` (sidebar link + dot, like Daily; `go` excludes `'changelog'`), `web/src/landing/Landing.tsx` (footer link + "v1"), locales en/ro/it, `web/src/styles.css`.
- Create: `web/src/changelog/ChangelogPage.tsx`, `web/src/changelog/seen.ts` (`readSeen()`, `markSeen(id)`, event `CHANGELOG_SEEN`).

- [ ] **Step 1:** route parse/path + test (`parseRoute('/changelog')` → `{ view: 'changelog' }`, `routePath` back).
- [ ] **Step 2:** page in the legal chrome (logo, language menu, `h1` "Changelog", "v1" tag, each entry `h2` = formatted date, `ul` items in `lang`, home link); on mount `markSeen(CHANGELOG[0].id)`; title `meta.changelog`.
- [ ] **Step 3:** sidebar: `ClockCounterClockwise` icon, `t('nav.changelog')`, `new-dot` with sr-only `t('changelog.new')` while `hasUnread(CHANGELOG, readSeen())`; listens to `CHANGELOG_SEEN`.
- [ ] **Step 4:** landing footer link `t('landing.footer.changelog')` + `v1`.
- [ ] **Step 5:** keys: `meta.changelog`, `nav.changelog`, `changelog.title`, `changelog.intro`, `changelog.new`, `changelog.version`, `landing.footer.changelog` in en/ro/it; `npm run i18n:check`.
- [ ] **Step 6:** typecheck, build, test; browser at desktop + 390px. Commit `feat(changelog): public changelog page and sidebar dot`.

### Task 5: Versions and docs

**Files:** `package.json` (`1.0.0`), `extension/manifest.json` (`1.0.0`), `extension/release.json` (`"1.0.0": [...]`), `docs/deploy.md`, `CLAUDE.md`.

- [ ] **Step 1:** bump versions; release note "FC Solver v1".
- [ ] **Step 2:** `docs/deploy.md`: changelog ships with the deploy; run `discord:setup` once for `📝・changelog`. `CLAUDE.md`: layout lines + rule "User-visible change → entry in `shared/changelog.ts` (en/ro/it, for users)".
- [ ] **Step 3:** typecheck, test, build. Commit `chore(release): v1`.
