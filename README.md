# FC Solver

Finds the cheapest squad **from your own club** that completes an EA FC 27 Squad Building Challenge, and shows it on a pitch that looks like the one in the Ultimate Team web app. You then rebuild the squad by hand in the web app. Nothing is ever bought, sold or submitted for you.

Live: <https://sbc-builder.mario-theodor.ro>

## What it does

- Reads your club, active squad and the live SBC list through your own FC27 web app session.
- Solves any SBC with an exact integer model: rating, chemistry, nation / league / club counts, rarity, quality, tradability, OR-challenges.
- Prefers to burn untradeables and low-value cards; keeps your active squad, promos, chosen nations / leagues / clubs and hand-picked players out.
- Explains why a challenge is impossible ("France: min. 2 players, you have 0 usable, your settings hide 20 more").
- Stays in sync without hammering EA: club every 24 h, SBCs right after the 20:00 (RO) content drop, and live updates from the web app when you submit an SBC, open a pack, send players to your club or quick sell them.
- Several EA accounts per server; every browser only sees the accounts it holds a key for.

## Stack

| Layer | Tech |
|---|---|
| API | Node 24, TypeScript, Fastify 5, run with `tsx` |
| Solver | Python 3 + Google OR-Tools CP-SAT (spawned per solve, 8 to 16 workers) |
| Web UI | React 19, Vite 8, plain CSS (OKLCH tokens), Phosphor icons, Barlow Condensed + Geist |
| Browser bridge | Chrome MV3 extension (webRequest + a small page hook) |
| Storage | JSON files on disk (`data/`), one folder per EA account |
| Deploy | Docker (multi-stage), docker compose, Apache reverse proxy, Cloudflare (Flexible SSL) |

## Quick start (local)

```bash
npm install
python3 -m venv solver/.venv && solver/.venv/bin/pip install -r solver/requirements.txt
npm run dev          # API on :5178 (watch mode) + Vite on :5173
```

Open <http://localhost:5173>, press **Setup**, download the extension (it is pre-configured for the server you downloaded it from), load it unpacked in Chrome and log in to the FC27 web app. Your club and SBCs sync within a minute.

Useful scripts:

```bash
npm run typecheck    # tsc over server + web
npm run build        # web UI -> dist/ (served by the API in production)
```

There is no automated test suite yet; changes were verified by replaying real EA responses and solving real challenges.

## Deploy

```bash
# on the server, in /var/www/sbc-builder
git pull && docker compose up -d --build
```

The container listens on `127.0.0.1:5178` only; Apache (`deploy/sbc-builder.conf`) proxies the domain to it. Data lives in `./data` (volume). Full notes: [docs/deploy.md](docs/deploy.md).

## Project layout

```
server/      Fastify API, EA client, sync, SBC parsing, exact game formulas, solver driver
solver/      cpsat.py: the CP-SAT model (JSON in on stdin, JSON out on stdout)
web/         React UI (pitch, FUT cards, requirements, player panel, settings, setup guide)
extension/   Chrome extension: session bridge, SBC/pack/item tracking, update notice
deploy/      Apache vhost
docs/        How it works, API reference, solver, extension, deploy
data/        Runtime cache and accounts (git-ignored, contains sessions and keys)
```

## Documentation

- [docs/architecture.md](docs/architecture.md): the approach, data flow and the decisions behind it
- [docs/api.md](docs/api.md): every HTTP endpoint, with payloads
- [docs/solver.md](docs/solver.md): how requirements, rating and chemistry are modelled
- [docs/extension.md](docs/extension.md): what the extension watches and why
- [docs/deploy.md](docs/deploy.md): Docker, Apache, Cloudflare, releasing a new extension

## Disclaimer

Unofficial fan project, not affiliated with EA. It only performs the same read requests the web app already makes, spaced out and cached. Automating purchases or submissions is deliberately out of scope because EA bans for it.
