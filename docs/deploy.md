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

Other environment variables: `DATABASE_URL` (required; set by compose in production, read from `.env` locally), `CLERK_SECRET_KEY` (required; the API exits without it), `SITE_ORIGINS` (comma list of origins whose Clerk session tokens are accepted; default localhost `:5173` / `:5178` and the production domain), `CLUB_SYNCS_PER_DAY` (3), `EA_DAILY_LIMIT` (150), `PORT` (5178), `HOST` (0.0.0.0 in the image, 127.0.0.1 by default elsewhere), `SOLVER_PYTHON` (path to the Python with OR-Tools), `SOLVER_DUMP` (write each solver problem to a file, for debugging).

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

The server folder is a git checkout of `dev` (owned by root); `data/` is git-ignored and survives pulls and rebuilds.

## Clerk

Sign-in runs on Clerk. Locally a development instance (keys `sk_test_` / `pk_test_` in the repo-root `.env`); in production a separate **production** instance:

- domain `sbc-builder.mario-theodor.ro`; add the DNS records Clerk asks for in Cloudflare as **DNS only** (grey cloud);
- sign-in options: **Email address** with **Email verification code**, **Google**; **Password** off (both "Sign-up with password" and required passwords); no required first / last name or username;
- Google OAuth with our own Google Cloud OAuth client; the authorized redirect URI is the one the Clerk dashboard shows under SSO connections → Google;
- copy the production `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` into the server's `.env`, then rebuild.

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

## Backup

`data/` holds the per-account JSON; Postgres (shared SBC history, brick layouts, trusted accounts) is best dumped rather than copied live:

```bash
docker compose exec db pg_dump -U fcsolver fcsolver | gzip > fcsolver-$(date +%F).sql.gz
gunzip -c fcsolver-2026-09-23.sql.gz | docker compose exec -T db psql -U fcsolver fcsolver   # restore
```
