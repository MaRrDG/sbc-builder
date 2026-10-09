# Deploy

Production runs on a single Ubuntu host behind Apache and Cloudflare.

```
Browser ──HTTPS──► Cloudflare (SSL: Flexible) ──HTTP :80──► Apache vhost ──► 127.0.0.1:5178 ──► container "sbc-builder"
```

## Image

`Dockerfile` has two stages:

1. `web`: `npm ci` and `vite build` → `dist/`.
2. runtime (`node:24-bookworm-slim`): Python 3 venv with OR-Tools, production node modules (incl. `tsx`), `server/` (with the DB migrations in `server/db/migrations/`), `scripts/`, `solver/cpsat.py`, `extension/`, `dist/`. Runs as the unprivileged `node` user.

## Compose

`docker-compose.yml` has two services, `app` and `db` (`postgres:18-alpine`, data in `./data/postgres`, no host port: only `app` reaches it over the compose network). Put `DB_PASSWORD=<long random>` (`openssl rand -hex 24`) in `.env` next to `docker-compose.yml`; compose refuses to start without it and builds the app's `DATABASE_URL` from it. The same `.env` holds the Clerk production instance keys, `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` (see [Clerk](#clerk)); compose refuses to start without them too. The publishable key is baked into the web build (`build.args`), so changing it needs `docker compose up -d --build`. `app` waits for `db` to be healthy and applies pending migrations on start.

`app`:

- binds `127.0.0.1:5178` only, so nothing but Apache can reach it;
- mounts `./data` as `/app/data` (accounts, sessions, keys, caches): **back this folder up**, and keep it owned by uid 1000 (the container's `node` user);
- `restart: unless-stopped` and a health check on `/api/meta`;
- `SBC_DROP_TIME` (default `20:01`) and `SBC_DROP_TZ` (default `Europe/Bucharest`) control the daily SBC refresh.

Other environment variables: `DATABASE_URL` (required; set by compose in production, read from `.env` locally), `CLERK_SECRET_KEY` (required; the API exits without it), `SITE_ORIGINS` (comma list of origins whose Clerk session tokens are accepted; default localhost `:5173` / `:5178` and the production domain), `FOUNDERS_LIMIT` (50, Founding 50 lifetime Premium spots), `CLUB_VISIT_STALE_H` (2), `CLUB_MANUAL_COOLDOWN_MIN` (15), `EA_DAILY_LIMIT` (150), `PORT` (5178), `HOST` (0.0.0.0 in the image, 127.0.0.1 by default elsewhere), `SOLVER_PYTHON` (path to the Python with OR-Tools), `SOLVER_DUMP` (write each solver problem to a file, for debugging), `SITE_URL` (the domain search engines index, e.g. `https://fcsolver.gg`; see SEO; also the base of the links in emails; when empty, the first https origin of `SITE_ORIGINS`), `RESEND_API_KEY` (Resend API key for evolution emails and the Daily reminder; without it emails are only logged), `EMAIL_FROM` (sender, e.g. `FC Solver <noreply@mario-theodor.ro>`; the domain must be verified in Resend, DNS records in Cloudflare, DNS only), `EMAIL_SECRET` (signs unsubscribe links; defaults to `CLERK_SECRET_KEY`). The three email variables go in the compose `.env` (compose forwards them to `app`). Mind the Resend plan: the free one sends 100 emails a day / 3000 a month; when the quota or the rate limit is hit, sending pauses (1 h / what Resend asks) and the trainings wait, mailed late rather than lost (until 24 h after they ended); Daily reminders wait too, but only until 20:00 Bucharest.

## Apache

`deploy/sbc-builder.conf` → `/etc/apache2/sites-available/sbc-builder.mario-theodor.ro.conf`:

- port 80 only. With Cloudflare **Flexible** SSL, Cloudflare talks HTTP to the origin, so an http→https redirect here would loop. Enable **Always Use HTTPS** in Cloudflare instead;
- `RequestHeader set X-Forwarded-Proto "https"` so the app builds `https://` links (extension zip);
- `RemoteIPHeader CF-Connecting-IP` for real visitor IPs.

Modules: `a2enmod proxy proxy_http headers remoteip`, then `a2ensite sbc-builder.mario-theodor.ro`, `apache2ctl configtest`, `systemctl reload apache2`.

## Releasing

```bash
cd /var/www/sbc-builder
git pull
docker compose up -d --build
docker compose logs -f --tail=50
```

After the first deploy with the DB, fill it once from the cached accounts: `docker compose exec app npm run db:import`. Trusted accounts (their brick layout wins): `docker compose exec app npm run db:trust <personaId> <note>`.

### Daily game

The first deploy with the Daily game (`/daily`) needs its players table filled before the first pick:

```bash
docker compose exec app npm run daily:import   # players from the cached accounts in data/
docker compose restart app                     # the server loads the players into memory once, at the first daily request
```

Until the answer pool has `DAILY_HARD_MIN_POOL` players, `/daily` and Practice answer `503 dailyNoPool` ("not ready yet") instead of picking from a tiny pool. Environment (all optional; compose does not forward them by default, add the ones you set to the app's `environment`, e.g. `DAILY_SECRET: ${DAILY_SECRET:-}`):

- `DAILY_SECRET`: signs the state tokens and seals Practice answers; at least 32 characters (`openssl rand -hex 32`). Missing or shorter: one is generated into `data/daily-secret` (kept across rebuilds with `data/`).
- `DAILY_MIN_RATING` (82): rating of the answer pool; it steps down to `DAILY_RATING_FLOOR` (75) until the pool has `DAILY_MIN_POOL` (150) players.
- `DAILY_HARD_MIN_POOL` (30): below this many players there is no game at all.

### Completion history

The first deploy with the history tables starts counting from the cache once:

```bash
docker compose exec app npm run history:baseline   # safe to re-run
```

The server folder is a git checkout of `dev` (owned by root); `data/` is git-ignored and survives pulls and rebuilds.

## Clerk

Sign-in runs on Clerk. Locally a development instance (keys `sk_test_` / `pk_test_` in the repo-root `.env`); in production a separate **production** instance:

- domain `sbc-builder.mario-theodor.ro`; add the DNS records Clerk asks for in Cloudflare as **DNS only** (grey cloud);
- sign-in options: **Email address** with **Email verification code**, **Google**; **Password** off (both "Sign-up with password" and required passwords); no required first / last name or username;
- Google OAuth with our own Google Cloud OAuth client; the authorized redirect URI is the one the Clerk dashboard shows under SSO connections → Google;
- copy the production `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` into the server's `.env`, then rebuild.

## Discord

The bot (`discord/`) runs from the same image as its own compose service `bot` (profile `discord`, no ports, no `data/` mount, no database).

1. Discord Developer Portal → New Application ("FC Solver"). **Bot**: reset and copy the token (`DISCORD_TOKEN`). **General Information**: Application ID (`DISCORD_APP_ID`).
2. OAuth2 → URL Generator: scopes `bot`, `applications.commands`; permissions Manage Server, Manage Roles, Manage Channels, Manage Expressions, Manage Messages, View Channels, Send Messages, Embed Links, Attach Files, Add Reactions, Read Message History. The privileged intent **Server Members** is on in the Developer Portal (Bot → Privileged Gateway Intents) and used (Phase 6, boosts). Open the URL and add the bot to the (empty) server.
3. Discord → Settings → Advanced → Developer Mode; right-click the server → Copy Server ID (`DISCORD_GUILD_ID`).
4. Put the three values in `.env` plus `BOT_API_TOKEN=$(openssl rand -hex 32)` (shared by the app and the bot; the app answers `404` on `/api/bot/*` without it) and `DISCORD_INVITE_URL` (Server Settings → Invites → a never-expiring link). The Apache vhost denies `/api/bot/` from outside (`<Location /api/bot/>` in `deploy/sbc-builder.conf`): copy it again, `apache2ctl configtest && systemctl reload apache2`. Then build the layout (re-runnable, never deletes anything):

   ```bash
   docker compose --profile discord run --rm bot node --import tsx discord/setup.ts
   ```

5. Server Settings → Roles: drag the bot's role to the top, run step 4 again (sets the role order).
6. `docker compose --profile discord up -d --build` starts the bot; `docker compose logs -f bot`.

Setup also applies the design: server icon (first run, or `-- --icon`), Community (rules / public updates / system channels, Only @mentions, verification Low, content filter All members), `📢・announcements` as an Announcement channel, the Welcome Screen and the custom emojis `fcs_check`, `fcs_fc`, `fcs_lime`. Each design step logs and continues if Discord refuses it (the bot needs Manage Server and Manage Expressions). The bot avatar is set only with `npm run discord:setup -- --avatar` (Discord rate-limits avatar changes). By hand, when the server qualifies: server banner (boost level 2) and invite splash (level 1) from `discord/assets/banner.png`; role icons appear on the next setup run after level 2. Onboarding is not used: it needs 7 default channels visible to everyone, and the ✅ rules gate hides them. Brand change: `npm run discord:assets`, then setup with `--icon --avatar` (existing emojis keep their old image; delete them in Server Settings → Emoji first).

Every layout change (`discord/layout.ts`, rules, pickers, commands) needs step 4 again after the release. Slash commands are guild commands registered by setup; after a release that changes `discord/commands.ts`, run setup again.

## First-time setup on a new host

```bash
git clone git@github.com:MaRrDG/sbc-builder.git /var/www/sbc-builder
cd /var/www/sbc-builder && mkdir -p data && chown 1000:1000 data
echo "DB_PASSWORD=$(openssl rand -hex 24)" > .env && chmod 600 .env
echo "CLERK_SECRET_KEY=sk_live_..." >> .env               # Clerk dashboard, production instance
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_live_..." >> .env
docker compose up -d --build
docker compose exec app npm run db:import
cp deploy/sbc-builder.conf /etc/apache2/sites-available/sbc-builder.mario-theodor.ro.conf
a2enmod proxy proxy_http headers remoteip && a2ensite sbc-builder.mario-theodor.ro
apache2ctl configtest && systemctl reload apache2
```

Cloudflare: proxied (orange cloud) `A` record for the subdomain to the host IP, SSL mode Flexible, Always Use HTTPS on.

## SEO

`server/seo.ts` serves `robots.txt` and `sitemap.xml` and fills the `<head>` of `index.html` per public page (`/`, `/guide`, `/setup`, `/terms`, `/privacy`, `/cookies`: title, description, canonical, Open Graph / Twitter card with `/og.png`, JSON-LD `WebApplication`). The app (`/dashboard/*`), `/signin` and `/api` are `noindex` (meta tag + `X-Robots-Tag`) and disallowed in robots.txt.

Analytics: `ANALYTICS_SNIPPET` in `.env` holds the `<script>` tag OpenWebTrack's dashboard generates for the site, in **cookieless** mode (the cookie and privacy pages say so; a cookie mode would need a consent banner). The server appends it to `<head>` and adds its origins to the CSP. Empty: no analytics. Fonts are bundled (`@fontsource/*`), nothing loads from Google.

`SITE_URL` in `.env` names the canonical domain. Every other host that reaches the app (the old domain, an IP) gets `robots.txt: Disallow: /` and `noindex`, so only one copy is indexed. Without it, every host counts as canonical.

Moving to a new domain:

1. Cloudflare: add the zone, point it at the server; Apache: a vhost for the new name (copy `deploy/sbc-builder.conf`).
2. `.env`: `SITE_URL=https://<new domain>`; `SITE_ORIGINS` must list the new origin too (Clerk session tokens), e.g. `SITE_ORIGINS=https://<new domain>,https://sbc-builder.mario-theodor.ro`, and add `SITE_ORIGINS: ${SITE_ORIGINS}` to the app's compose environment.
3. Clerk: the production instance is tied to a domain; change it (or create one) for the new domain and update both keys, then rebuild.
4. Extension: zips carry the origin they were downloaded from, so users download the extension again from the new domain once (same folder, keys stay).
5. Old domain: 301-redirect its pages to the new one in Apache (keeps links and ranking), but **not `/api/`**: installed extensions still call the old origin (it is baked into their zip and host permissions, and a 301 turns their POSTs into GETs). Keep `/api/` proxied on the old name until every account runs an extension downloaded from the new domain.
6. Google Search Console: add the domain property (DNS TXT in Cloudflare), submit `https://<new domain>/sitemap.xml`, request indexing of `/`.

## Backup

`data/` holds the per-account JSON; Postgres (shared SBC history, brick layouts, trusted accounts) is best dumped rather than copied live:

```bash
docker compose exec db pg_dump -U fcsolver fcsolver | gzip > fcsolver-$(date +%F).sql.gz
gunzip -c fcsolver-2026-09-23.sql.gz | docker compose exec -T db psql -U fcsolver fcsolver   # restore
```
