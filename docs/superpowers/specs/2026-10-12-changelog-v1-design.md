# Changelog and v1 — design

Task 9 in `task.csv`.

## Goal

Users see what changed in FC Solver, on the site (English / Romanian / Italian) and on Discord (English only). The whole product is **v1** until the owner says it launches; until then the version number does not move and the changelog grows by dated entries.

## Decisions

- One product version, `APP_VERSION = '1'`, shown as "v1". `package.json` becomes `1.0.0`.
- The extension becomes `1.0.0` too; every extension change still bumps its patch (`1.0.1`, …) because the update notice compares versions. On the site and Discord it is just part of v1.
- Entries are hand-written by Claude in the same change as the user-visible commit: user-facing wording (not commit messages), each language written for itself, reviewed by the owner in the diff before push.
- Discord gets a new read-only channel `📜・changelog` in the INFO category; `📢・announcements` stays as it is.
- Dashboard: a "Changelog" sidebar link with a small unread dot.

## Data

`web/src/changelog/entries.ts` — pure data, no React, imported by both the web app and the server.

```ts
export const APP_VERSION = '1';
export interface ChangelogEntry {
  id: string;            // the date, 'YYYY-MM-DD'; a second entry the same day: 'YYYY-MM-DD-2'
  date: string;          // 'YYYY-MM-DD'
  items: Record<'en' | 'ro' | 'it', string[]>;
}
export const CHANGELOG: ChangelogEntry[] = [ /* newest first */ ];
```

Texts are data, not `t()` keys (long, one-off, written per language). Page chrome (title, "v1", "Changelog" link) goes through `t()` as usual.

Unit test (`entries.test.ts`): every entry has en/ro/it, same item count per language, no empty strings, unique ids, id matches `date` (optionally `-N`), sorted newest first.

First entry: "FC Solver v1" with a short summary of what exists today (SBC solver, Club, Evolutions, Gallery, Objectives, Daily, Discord). No back-filled history.

## Site

- Public lazy page `/changelog` (like `legal/`): title, "v1", entries with the date formatted for the locale and bullet items in the current language. Same page as the dashboard screen `/dashboard/changelog` (inside the app shell).
- Sidebar link "Changelog" with an unread dot when the newest id differs from `localStorage` `sbc-changelog-seen`; opening the screen stores the newest id. Dot is not the only signal: the link gets an accessible "new" label.
- "Changelog" link in the landing footer; footer shows "v1".
- 390px: one text column. New strings in `en.ts` / `ro.ts` / `it.ts`, `npm run i18n:check`.
- SEO: `/changelog` gets a head + canonical through `publicOrigin()` and a sitemap line, like the other public pages.

## Server

`GET /api/bot/changelog` (same bot auth as `/api/bot/daily`): `{ version: '1', entries: [{ id, date, items }] }` — newest 5 entries, English items only. Documented in `docs/api.md`.

## Discord bot

- `discord/layout.ts`: `CH.changelog = '📜・changelog'` in `CAT.info`, `readOnly: true`, topic "What changed in FC Solver". Created by `npm run discord:setup`.
- `discord/changelog.ts` (pure, tested):
  - `changelogMessage(id)` → content line `Changelog <id>` (what dedupe reads).
  - `changelogPost(entry, siteUrl, icon)` → content line + brand embed (title `FC Solver v1 · 12 Oct 2026`, bullets, link to `/changelog`), button "Read the changelog", no mentions.
  - `alreadyPosted(messages, id, botId)` — only the bot's own message with exactly that id.
  - `toPost(entries, messages, botId)` → entries missing from the channel, oldest first; if the bot has never posted in the channel, only the newest entry (no history flood).
- `discord/index.ts`: runs in the same ticker as the Daily post (startup, then every 10 minutes): fetch `/api/bot/changelog`, read the last 50 messages of the channel, post `toPost(...)`. Failures log `[bot] changelog:` and retry on the next tick.

Effect: deploy → server serves the new entry → bot posts it within 10 minutes.

## Extension and versions

- `extension/manifest.json` → `1.0.0`, `extension/release.json` gets a `"1.0.0"` entry.
- `package.json` → `1.0.0`.

## Docs and rules

- `docs/deploy.md`: the changelog ships with the deploy; run `discord:setup` once for the new channel.
- `docs/api.md`: the new bot endpoint.
- `CLAUDE.md`: "User-visible change → an entry in `web/src/changelog/entries.ts` (en/ro/it, written for users)"; layout lines for `changelog/` and `discord/changelog.ts`.

## Testing

`npm test` (entries validation, `alreadyPosted`, `toPost` first run vs later runs, post format), `npm run typecheck`, `npm run build`, `npm run i18n:check`; the page in the browser at desktop and 390px.

## Out of scope

Version bumps beyond v1, generating entries from commits, a "What's new" dialog, Discord posts in Romanian, back-filled history.
