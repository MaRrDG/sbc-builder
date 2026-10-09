# Discord: community server, bot, account link and own completion history

Date: 2026-10-09. Status: product decisions from the owner, awaiting spec review.

## Goal

FC Solver gets a Discord server for its community and a bot that lives next to the app:

- a bilingual server (Romanian and English only, no Italian) whose channels, roles, permissions, rules and role pickers are created by one idempotent `setup` script;
- a "Daily #N is live" post in `⚽・daily` at every Daily drop;
- users connect their Discord account in Settings (Clerk's Discord connection);
- `/sbc <set>` posts the cheapest squad from the linked user's club in the channel, using the same solver and the same weekly Free quota as the site; `/stats` posts SBCs / objectives completed all time and players in the club;
- FC Solver starts recording SBC and objective completions itself, because EA gives no history;
- the server looks like the big community servers (§1a: naming style, brand embeds, emojis, Community features);
- members who boost the server get FC Solver Premium while they boost, plus 12 hours (§12).

Read-only toward EA stays absolute: the bot never calls EA, never submits, buys or sells; it reads the cache through our own API.

Success: re-running `setup` on a configured server changes nothing visible and creates no duplicates; a linked Free user's `/sbc` answer matches what the site shows for the same challenge with default settings and costs one found solve; `/stats` counts never go up when the web app reloads the same SBC list twice.

## 1. Discord server layout (`discord/layout.ts`, data the owner can edit)

The owner created the server and invited the bot (verified in the guild; credentials in `.env`). The bot's own role must sit at the top of the role list (Discord only lets a bot manage roles below its own; `setup` warns when it is not).

Roles (layout order = hierarchy, top first; colours from the brand):

| Role | Colour | Permissions |
|---|---|---|
| Admin | lime `#C8F53C` | Administrator |
| Moderator | soft green `#7FD1AE` | Manage Messages, Moderate Members, Kick Members, Manage Threads, Mute / Move Members |
| *(Premium, later: role sync is out of scope; slot reserved under Moderator)* | | |
| Member | cream `#F2EFE8` | none beyond overwrites |
| RO, EN | none | unlock their category |
| 15 world clubs, 16 SuperLiga clubs | none (names stay readable) | none; optional unicode role icon (⚽ by default), applied only when the server has boost level 2 |

World clubs: Real Madrid, Barcelona, Atlético Madrid, Manchester City, Liverpool, Arsenal, Manchester United, Chelsea, Bayern München, Borussia Dortmund, PSG, Juventus, Inter, Milan, Napoli.

SuperLiga 2026-2027 (verified 2026-10-09): Universitatea Craiova, Universitatea Cluj, CFR Cluj, Dinamo București, Rapid București, FC Argeș, UTA Arad, FCSB, Oțelul Galați, FC Botoșani, Csíkszereda, Petrolul Ploiești, Farul Constanța, FC Voluntari, Corvinul Hunedoara, Sepsi OSK.

Categories and channels (one naming style everywhere, see §1a; access = who can view; `@everyone` is denied view everywhere except `📜・rules`):

| Category | Access | Channels |
|---|---|---|
| `━━ INFO ━━` | Member | `📜・rules` (**everyone**, read-only; ✅ reaction), `👋・welcome` (read-only, system channel), `📢・announcements` (Announcement type, read-only, followable), `🎭・roles` (read-only, pickers), `⚽・daily` (read-only, bot posts) |
| `━━ ROMÂNĂ ━━` | RO | `💬・general`, `🧩・ajutor-sbc` (slowmode 10 s), `🐞・buguri` (slowmode 30 s), `💡・sugestii` (slowmode 30 s), `🏟️・echipe-superliga` (read-only, SuperLiga picker) |
| `━━ ENGLISH ━━` | EN | `💬・general`, `🧩・sbc-help` (slowmode 10 s), `🐞・bugs` (slowmode 30 s), `💡・suggestions` (slowmode 30 s) |
| `━━ VOICE ━━` | Member | `🔊 Lounge`, `🔊 Vocal` (RO), `🔊 Voice` (EN) |
| `━━ STAFF ━━` | Moderator | `🛡️・staff`, `📋・mod-log` (public-updates channel) |

A channel may override its category's access (`📜・rules` everyone, `🔊 Vocal` RO, `🔊 Voice` EN). Topics are bilingual in INFO / VOICE and in the area's language elsewhere. The bot's own role gets View / Send / Embed / Attach / Read History / Add Reactions / Manage Messages on every text channel through an explicit overwrite, so read-only channels stay writable for it.

Discord permissions are an OR across roles, so "RO **and** Member" cannot be expressed in overwrites. The bot keeps it true instead: removing the ✅ (or the Member role) also removes RO and EN. Language pickers are only visible to Members (`🎭・roles`).

Renaming: channels and roles match by name, so a renamed entry would be created anew. Each spec entry has optional `aliases` (old names); setup matches an alias, then renames it to the new name.

## 1a. Server design

Goal: look like the big community servers, consistently, all from data.

- **Naming**: text channels `<emoji>・<name>` (U+30FB separator, lower-case, dashes), voice `🔊 <Name>`, categories `━━ <NAME> ━━`. All names live in `layout.ts`; the owner tweaks names / emojis there and re-runs setup.
- **Brand** (`discord/brand.ts`): lime `#C8F53C` (accent: found / success / Admin), dark green `#0E3B2B` (embed default), cream `#F2EFE8` (Member, neutral embeds). Every bot embed has the author "FC Solver" with the bot avatar as icon (the avatar is the FC Solver logo, set by setup), brand colour, short bilingual text where the channel is shared.
- **Assets**: `discord/assets/` holds `avatar-fc.png` (bot avatar), `avatar-check.png`, `avatar-fc-lime.png` (server emojis) and `banner.png` (1920×1080, embed banner), copied from the owner's rendered set (`~/Desktop/fcsolver-discord/`). `scripts/discord-assets.ts` can re-render the emoji PNGs from `web/public/brand/*.svg` with `@resvg/resvg-js` (already a dependency) when the brand changes.
- **Rich embeds**: rules (two embeds RO + EN, numbered, banner image on top as an attachment), welcome (what FC Solver is, how to unlock the server: ✅ in rules → pick a language in roles, link to the site; RO + EN), roles pickers (one embed per group), Daily (title "Daily #N", banner art, button to `/daily`), `/sbc` and `/stats` embeds.
- **Custom emojis** uploaded by setup when missing (by name, idempotent): `fcs_check`, `fcs_fc`, `fcs_lime`. The bot looks them up by name at runtime and falls back to unicode (✅ / ⚽) when absent. The rules reaction stays the unicode ✅ (works for everyone, including on mobile, without emoji permissions).
- **Community features** (API, applied by setup): enable `COMMUNITY` with `rulesChannel` = `📜・rules`, `publicUpdatesChannel` = `📋・mod-log`, `systemChannel` = `👋・welcome` (join messages on, boost messages on, tips off), verification level Low, explicit content filter All members, default notifications **Only @mentions**. `📢・announcements` is created as an Announcement channel (others can follow it); when Community cannot be enabled it stays a text channel and setup warns.
- **Welcome Screen** (API): description "Cheapest SBC squads from your own club. / Cele mai ieftine loturi SBC din clubul tău." and up to 5 channels with emoji + description (rules, roles, daily, the two help channels).
- **Not by API, documented as manual owner steps**: server banner and invite splash (boost level 2 / 1), server icon is API-able and set by setup from `avatar-fc.png`; **Onboarding** (`PUT /guilds/{id}/onboarding`) is API-able but requires at least 7 default channels visible to `@everyone`, which contradicts the ✅ rules gate the owner asked for, so it is **not used** (documented; revisit if the gate is dropped); Membership Screening / "Rules Screening" has no public API (optional manual toggle; the ✅ gate already covers it); role icons need boost level 2 (setup applies `icon` only when `premiumTier >= 2`).
- **Slowmode** on help / bug / suggestion channels (see table), **read-only** info channels.

## 2. `setup` (`npm run discord:setup`, idempotent)

`discord/setup.ts` logs in with `DISCORD_TOKEN`, reads the guild `DISCORD_GUILD_ID` and applies `layout.ts`:

- a pure `planSync(existing, desired)` (`discord/sync-plan.ts`) returns create / update actions. Roles match by name or alias (case-insensitive); categories by name or alias; channels by name or alias + type **inside their category** (`💬・general` exists under ROMÂNĂ and ENGLISH; a text channel also matches an Announcement spec and is converted). Matched names that differ (an alias) are renamed. It never deletes: extra roles / channels the owner adds stay untouched. Existing items get their colour, permissions, overwrites, topic, slowmode and order re-applied (a PUT, so a second run is a no-op in effect);
- the rules message: the bot's own message in `📜・rules` (found among its last 50 messages by embed title) is edited, else sent; it carries the banner image and two embeds (Romanian, English), is pinned and has the bot's ✅ reaction;
- pickers and the welcome message: the bot's messages found by embed title are edited, else sent;
- design (§1a): server icon, bot avatar (only with `--avatar`, Discord rate-limits avatar changes), custom emojis by name, Community settings, Welcome Screen, the welcome message in `👋・welcome`;
- slash commands are registered as guild commands (`guild.commands.set`, a full replace, so idempotent).

Rules (both languages, same 8 points): be respectful; no hate / harassment; no spam or self-promotion; no selling, buying or trading accounts, coins or cards; no cheats, exploits or automation talk (EA bans for it, FC Solver never automates the game); keep topics in the right channel; English in the EN area, Romanian in the RO area; staff decisions are final, appeals by DM to an Admin. Last line: "React ✅ to accept and unlock the server."

## 3. Bot runtime (`discord/index.ts`)

One process, discord.js 14.27.0, intents `Guilds` + `GuildMessageReactions` (+ the privileged `GuildMembers` for boosts, §12, enabled by the owner), partials `Message`, `Channel`, `Reaction`, `User` so reactions on the rules message are seen after a restart.

- **Rules**: ✅ on the rules message → add Member; removing it → remove Member, RO, EN.
- **Role pickers**: a public message with one button (`pick:lang` / `pick:world` / `pick:superliga`). The button opens an **ephemeral** select menu (`set:<group>`, `minValues 0`, `maxValues` = all options) pre-ticked with the roles the member has. Submitting sets the member's roles in that group to exactly the selection (pure `roleDiff`), other groups untouched. A shared public select would overwrite a user's earlier choice, the button + ephemeral menu does not.
- **Daily**: every minute the bot asks `GET /api/bot/daily`; when `live` and the day is newer than the last one posted, it reads the last 20 messages of `⚽・daily` and posts only when none of its own messages names `Daily #N` (pure `alreadyAnnounced`). Restarts and two bot instances do not double post (Discord is the state). The post is a bilingual content line ("**Daily #N is live** … / **Daily #N a început** …", which is what the duplicate check reads) plus a brand embed with the banner image and a link button to `<SITE_URL>/daily`; no spoiler. If the pool is not ready (`dailyNoPool`) nothing is posted.
- **Slash commands**: see §6.
- The bot answers only in `DISCORD_GUILD_ID`.

## 4. Bot ↔ app: an internal HTTP API (decision)

The bot calls the app over the compose network (`BOT_API_URL`, default `http://app:5178`) on `/api/bot/*`, authenticated with a shared secret `BOT_API_TOKEN` in `X-Bot-Token` (constant-time compare; empty token = the routes answer 404, feature off). Apache denies `/api/bot/` from outside (`<Location>`), so the token is a second lock.

Why not import server modules into the bot: a solve needs the per-account cache in `data/`, the Python CP-SAT venv, Postgres, the shared brick layouts held in memory, the plan / quota rules and `logEvent`. Importing them would make two processes write the same caches and Postgres rows with separate in-memory state (Daily store, layout cache, per-persona queues), and would duplicate quota counting. Over HTTP there is one source of truth: the bot holds no DB credentials and no `data/` mount, and `/api/solve` and `/api/bot/solve` run the same `runSolve()` (extracted from the `/api/solve` handler with no behaviour change).

Bot routes (all need `X-Bot-Token`; the Discord user id is the identity, linked via §5):

| Route | Answer |
|---|---|
| `GET /api/bot/daily` | `{ day, live }` (`live` false while the pool is not ready) |
| `GET /api/bot/sets?discordId=&q=` | up to 25 `{ setId, name }` from the cached SBC list of the user's Discord persona |
| `GET /api/bot/challenges?discordId=&setId=` | up to 25 `{ challengeId, name, done }` + `defaultId` (first not completed, else first) |
| `POST /api/bot/solve` `{ discordId, setId, challengeId? }` | `BotSolution` (§6) |
| `GET /api/bot/stats?discordId=` | `BotStats` (§7) |
| `POST /api/bot/boost` `{ discordId, since \| null }` | `{ changed, linked, active, lang }` (§12) |
| `POST /api/bot/boosts` `{ boosters: [{ discordId, since }] }` | `{ started, stopped }` (§12) |

Errors keep the site shape `{ error, code, params }`; new codes `discordNotLinked` (404), `noPersona` (409, linked but no EA account), `botRateLimited` (429, more than 6 bot solves a minute per Discord user). Every bot answer that knows the user includes `lang` (`users.lang`).

## 5. Account link (Clerk Discord connection)

Clerk dashboard (owner): enable the **Discord** social connection, **turned off for sign-up and sign-in** (connect only). Development uses Clerk's shared credentials; production uses the same Discord application as the bot (OAuth2 client id / secret, redirect URI copied from Clerk), scope `identify`.

Site (Settings, new card "Discord", `web/src/components/DiscordCard.tsx`):

- Not connected: "Connect Discord" → `user.createExternalAccount({ strategy: 'oauth_discord', redirectUrl: <origin>/dashboard/settings?discord=connected })` (`useUser()` from `@clerk/react`, types in `@clerk/shared/dist/types/user.d.ts:270`), then `window.location.assign(ext.verification.externalVerificationRedirectURL.href)`. Back on Settings with `?discord=connected`, the site calls `POST /api/me/discord` and drops the query (`history.replaceState`).
- Connected: Discord username, an EA-account select when the user owns more than one persona (which club `/sbc` and `/stats` use; default the most recently linked), "Disconnect" and "Join the server" (`DISCORD_INVITE_URL`, hidden when empty).
- Self-heal: when Clerk's `user.externalAccounts` has a verified Discord account but `/api/me` says `discord: null`, the card calls `POST /api/me/discord` once.

Server:

- `POST /api/me/discord`: reads the Clerk user (`clerk.users.getUser`, backend `ExternalAccount`: `provider` is `oauth_discord`, `providerUserId` the Discord user id, `username`, `verification.status`). Pure `discordAccountOf()` accepts `oauth_discord` or `discord` and only a `verified` one. Stores `users.discord_id`, `users.discord_name`. A Discord id already stored on another user → `409 discordTaken` (unique index). No Discord account on the Clerk user → `400 discordNotConnected`.
- `DELETE /api/me/discord`: `clerk.users.deleteUserExternalAccount({ userId, externalAccountId })` for the Discord account(s), then clears the three columns. Idempotent.
- `PUT /api/me/discord/persona` `{ personaId }`: must be one of the user's personas (`403 personaNotYours`).
- `GET /api/me/discord` → `{ discord: { username, personaId } | null, invite: string | null }` (`personaId` = the persona the bot uses, after the fallback; `invite` = `DISCORD_INVITE_URL`). The card loads it itself, `/api/me` is unchanged.

## 6. `/sbc`

`/sbc set:<autocomplete> [challenge:<autocomplete>]`. Both options are integers with autocomplete (`/api/bot/sets`, `/api/bot/challenges`). Choice names are cut to 100 characters (Discord limit).

Flow: guild check → per-user cooldown 30 s (`discord/cooldown.ts`; still cooling → ephemeral "wait Ns") → `deferReply` with the ephemeral flag → `POST /api/bot/solve` → on an answer, the bot posts the embed **publicly** in the channel (`channel.send`, first line `<@user> /sbc`, no pings) and deletes the ephemeral placeholder (a follow-up after an ephemeral defer is ambiguous, `channel.send` is not); on `discordNotLinked` / `noPersona` / `quotaExhausted` / `botRateLimited` / `challengeNotFound` / `clubEmpty` / `needsLayout` / `pointsDone`, the ephemeral reply is edited with the translated message (with a link to `<SITE_URL>/dashboard/settings` or the set on the site). A channel the bot cannot write in → ephemeral `cannotPost`.

Solve: same `runSolve()` as the site, `deep: false`, storage on, **default solver options** (the site's own settings live in the browser's `localStorage`, the server does not have them; the embed says "default settings"). Quota: the same `planFor` / `countSolve` path, so a found squad uses one Free solve, Premium unlimited, a not-found answer costs nothing; `logEvent` gets `via: 'discord'`.

`BotSolution` (pure mapper `toBotSolution`, `server/discord/solution.ts`):

```ts
{ found: boolean; set: string; challenge: string; setId: number; challengeId: number;
  rating: number; chemistry: number;
  slots: { pos: string; name: string; rating: number; chem: number; storage: boolean; brick: boolean }[];
  points: { target: number; total: number; cards: { name: string; rating: number; points: number }[] } | null;
  reasons: string[]; quota: { used: number; limit: number; resetsAt: number | null } | null; lang: 'en' | 'ro' }
```

Embed (`discord/embeds.ts`, pure): title "<set> — <challenge>", a code-block table `POS  OVR  Name  ●●●` per slot (brick slots as "locked"), rating and chemistry fields, "cheapest squad from @user's club, default settings", a link button "Open on FC Solver" (`/dashboard/sbc/<setId>/<challengeId>`), and for Free users the footer "Free: used/limit solves this week". Not found: red embed with up to 3 reasons. Nothing in the embed or the bot touches EA.

## 7. Own history and `/stats`

EA gives no "completed" history; the cache only holds the current state. FC Solver records completions itself from what the cache already receives (no new EA call, no new job recipe).

Source (verified in `data/accounts/*/sets.json`, `challenges/*.json`, `objectives.json` and `server/ea.ts` / `server/objectives/types.ts`):

| Kind | Cache key | Item | Field | Completion |
|---|---|---|---|---|
| `set` | `accounts/<p>/sets` | `setId` | `timesCompleted` (all time, also for `REFRESH`; `timesCompletedInInterval` is the window) | each increase |
| `challenge` | `accounts/<p>/challenges/<setId>` | `challengeId` | `timesCompleted` | each increase |
| `objective` | `accounts/<p>/objectives` | `objectiveId` | `state` ∈ {`COMPLETED`, `REDEEMED`} (else missing / `IN_PROGRESS`) | each not-done → done transition |

Every write of those keys (relay `server/events.ts`, syncs `server/sync.ts`, `applySubmittedSbc`) goes through `writeCache`, so `onCacheWrite` sees them all. Tables:

- `completion_marks (persona_id, kind, item_id) PK, count, done, first_seen, updated_at`: the last state counted;
- `completions (id, persona_id, kind, item_id, seq, count, baseline, at)`, unique `(persona_id, kind, item_id, seq)`.

Pure diff (`server/history/diff.ts`):

- counts (`set`, `challenge`): first sighting → mark = n, and when n > 0 one row `{ seq: n, count: n, baseline: true }`; later n > mark → row `{ seq: n, count: n - mark, baseline: false }`, mark = n; n ≤ mark → nothing (a seeded challenge copy has `timesCompleted` reset to 0, a decrease is never a completion).
- done (`objective`): first sighting done → row `{ seq: 1, count: 1, baseline: true }`; not-done → done → row `{ seq: count + 1, count: 1, baseline: false }`; done → not-done (a refreshed daily objective) → mark only. `COMPLETED` → `REDEEMED` is not a second completion.
- an item listed twice in one payload counts once (max count / any done).

Replays (the web app reloading the same list, a sync after the relay) produce no rows because the marks already hold the count; the unique index is a second guard. Per persona the writes are serialized (in-process chain) and each runs in one transaction.

Baseline: `npm run history:baseline` replays the current cache of every account through the same code once at deploy (the live listener would do it on the next write anyway). **Limitation, shown in `/stats`**: "all time" = what EA still lists when tracking started (baseline) + everything seen since. SBC sets that expired before tracking started, and objectives groups no longer listed, are missing. Objectives are only seen when the user opens Objectives in the web app, so an objective completed and refreshed in between is not counted. `since` = when tracking started for the persona (earliest `completion_marks.first_seen`) is shown.

`BotStats`: `{ sbcs, challenges, objectives, club, streak, since, lang }` where `sbcs` / `challenges` / `objectives` are `sum(count)` per kind, `club` the players in the club cache now (club + storage not counted twice: club only), `streak` the current Daily streak (`streakOf`), `since` ms. `/stats` posts a public embed the same way (ephemeral defer, `channel.send`, errors stay ephemeral) "@user's FC Solver stats" with the footnote "counted since <date>; older expired SBCs are not included".

## 8. Language

Site strings through `t()` (en / ro / it). Bot strings in EN and RO only (`discord/i18n.ts`): RO when the channel's category is `━━ ROMÂNĂ ━━`, EN when it is `━━ ENGLISH ━━`; in shared channels the linked user's site language (`ro` → RO, anything else → EN), then the Discord client locale (`ro` → RO), else EN. Slash command names stay English; descriptions carry `description_localizations.ro`. EA texts (set, challenge, player names, requirement texts, solver reasons that quote them) stay as EA sends them.

## 9. Security and limits

- Env (git-ignored `.env`, never logged or printed): bot `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `BOT_API_TOKEN`, `BOT_API_URL`, `SITE_URL`; app `BOT_API_TOKEN`, `DISCORD_INVITE_URL`. `DISCORD_PUBLIC_KEY` (interactions endpoint, unused: the bot uses the gateway) and `DISCORD_CLIENT_SECRET` (OAuth2, used by Clerk's Discord connection, configured in the Clerk dashboard) are in `.env` too and are never read by the code.
- `/api/bot/*`: token compare with `timingSafeEqual`, 404 when the token is not configured, Apache `Require all denied`, per Discord user 6 solves a minute on the server plus the bot's 30 s cooldown.
- The site loads no Discord asset (the OAuth redirect is a top-level navigation), so the CSP does not change.
- `/sbc` answers are public by the owner's decision: they show the linked user's player names and ratings in the channel.

## 10. Deploy

The bot runs from the same image as its own compose service `bot` (`command: node --import tsx discord/index.ts`, `profiles: [discord]`, `depends_on: app healthy`, no ports, no `data/` mount, no DB). `docker compose --profile discord up -d --build` starts it; `docker compose --profile discord run --rm bot node --import tsx discord/setup.ts` applies the layout. `docs/deploy.md` documents the Discord application, env vars and the role order step.

## 11. Testing

Unit (`npm test`, `node:test`): boost rule (`plan.ts`: boosting, 11h59m / 12h01m after the end, boost + paid, unlink), `reconcileBoosts`, `parseBoosters`, design data (`design.ts`), brand assets present, `history/diff`, history cache extraction, `planSync`, `overwritesFor`, `roleDiff`, `alreadyAnnounced` / `dailyMessage`, `cooldown`, bot `langFor` + string parity, `embeds`, `botTokenOk`, `discordAccountOf`, `pickPersona`, `matchSets` / `defaultChallenge`, `toBotSolution`. Manual: setup twice on the guild (second run: zero creates, no duplicate emojis / messages; renaming via `aliases`), ✅ flow, pickers, Daily post across a restart, link / unlink in the browser at 390 px, `/sbc` Free quota against `/api/me`, `/stats` before and after reloading the same SBC list.

## 12. Boosters get Premium while they boost

Owner decision: a member who boosts the FC Solver Discord server has FC Solver Premium for as long as the boost lasts, plus a **12 hour grace** after it ends.

- **Detection** (bot, privileged intent Server Members, enabled by the owner): `GuildMemberUpdate` compares `premiumSince` (start / stop), and a full reconcile runs on bot start and every 15 minutes (`guild.members.fetch()` → every member with `premiumSince`), so missed events, restarts and users who link Discord after boosting heal on their own.
- **Only linked users** (Clerk Discord connection → `users.discord_id`, unique, so one Discord account backs one FC Solver user). A booster who is not linked gets the thank-you with "connect Discord in FC Solver Settings to activate" and a DM with the same (DMs may be closed: ignored); the next reconcile after linking grants it.
- **Storage**: `users.boost_since` (timestamp, null = not boosting) and `users.boost_ended_at` (timestamp, start of the grace). Never touches `plan` / `premium_until`, so days from codes, points or founders are neither used up nor lost; they simply keep running underneath.
- **Rule** (`server/plan.ts`, pure): tier = premium if admin, or paid Premium (`plan = premium` and `premium_until` null or in the future), or boosting (`boost_since` set), or `now - boost_ended_at < 12 h`. `source` = `admin` | `paid` | `boost` | null (paid wins over boost for display). Unlinking Discord clears both boost columns: Premium from the boost ends at once (no grace, the link is what authorised it). Same rule in the admin panel's SQL Premium filter.
- **API**: `/api/bot/boost` (one member: `{ discordId, since | null }` → `{ changed, linked, active, lang }`), `/api/bot/boosts` (reconcile: the full booster list → `{ started, stopped }`). `/api/me` `plan` gains `source` and `boost: { since, graceUntil } | null` (`docs/api.md`).
- **Admin**: every grant / revoke is an `events` row `type: 'boost'`, `data.action` `start` / `stop`, `data.via` `event` / `reconcile` / `unlink`; the admin user page words it.
- **Site** (en / ro / it): Settings plan card "Premium via Discord boost: active while you boost" (and "ends <time>" during the grace), a Free hint "Boost the FC Solver Discord server to get Premium while you boost"; the landing Pricing Premium card mentions it as a way to get Premium; Terms: Premium through a boost lasts while the boost is active plus 12 hours and ends without notice when the boost ends or Discord is disconnected.
- **Discord**: `💎・boost-perks` in INFO (read-only) with a RO + EN perks embed; a public thank-you embed in `👋・welcome` when a boost starts (says whether Premium is active or how to activate it); the managed "Server Booster" role styled by setup (Discord's boost pink `#F47FFF`, shown separately, placed between Moderator and Member).

## Out of scope (later)

- Premium role sync (a Discord role for paid / site Premium users; boosters already have Discord's own Booster role).
- A rendered pitch image for `/sbc` (resvg, like the evolution card).
- More stats (coins saved, most used players, leaderboards in Discord), objective history from a periodic read-only job.
- Syncing the site's solver settings to the server so `/sbc` uses them.
- Italian channels.
