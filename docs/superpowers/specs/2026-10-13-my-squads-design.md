# My Squads (Premium) — design

Date: 2026-10-13. Status: owner asked in chat ("my squads unde afisam costul fiecarui squad", "doar pentru premium"; owner away, "do what you consider best"). Open questions decided below as rulings.

## Goal

A Premium screen that lists the user's EA FUT squads (the ones in the web app's "My Squads") with the value of each squad: the sum of EA's `marketAverage` of its players, plus per-player value on the cards (EA shows it as "AVG" on the card).

## Data (no new EA calls)

- EA club items carry `marketAverage` (coins, EA's own market average; absent on some cards, e.g. some untradeable specials). The club cache already stores it (300 of 311 items locally).
- The club sync recipe already calls `GET /squad/list` and `GET /squad/{activeSquadId}`; today only the active squad's ids are kept (`squad` cache key). The web app itself loads `/squad/list` and `/squad/{id}` when the user browses My Squads; the extension relays those.
- New cache key `squads`: `{ list: SquadSummary[] , fetchedAt }` from every `/squad/list` response (raw squads kept, parsed defensively: id, name (`squadName`/`name`), formation, rating if present, players if present), and `squads/<id>`: `{ id, name, formation, players: { index, itemId, item? }[] }` from every `/squad/{id}` response (any squad, not only the active one; the active-squad logic stays as is). The real `/squad/list` shape is not known yet: the parser accepts both "players inline" and "ids only"; anything it can't read is stored raw for later.
- No recipe change: no extra EA request. A squad without loaded players shows "Open this squad once in the web app to see its value".

## Value

- Pure `squadValue(players, clubById)`: per slot `marketAverage` from the club cache item with that id, else from the squad response's own `itemData.marketAverage`, else unknown. Total = sum of known; `unknown` count shown ("2 cards without a price"). Starters (index < 11) and bench separately and together. Loan cards (`loans`/`loansInfo`) count as 0 and are marked.
- Prices are EA's average at the time of the last sync / web app load; the screen shows that time.

## UI

- New sidebar screen "My Squads" (`/dashboard/squads`, add to `shared/paths.ts`), Premium only: non-Premium users see the existing Premium upsell pattern (like Gallery / Objectives).
- List: one row per squad — name, formation, rating (computed with `squad.ts` when players are known), total value (starters + bench), active badge. Sorted: active first, then by value.
- Squad view: pitch with the 11 starters + bench using the existing card components, each card showing its AVG value (coin icon + compact number, e.g. 171.9K) under the card; totals on top. Same look as the SBC solution view. Phone width checked.
- All strings through `t()` en/ro/it; numbers formatted per locale.

## Server

- `GET /api/squads` (Premium, persona) → `{ squads: { id, name, formation, active, rating|null, value: { starters, bench, total, unknown }, loaded: boolean }[], fetchedAt }`.
- `GET /api/squads/:id` → squad with players (club item fields the site already uses for cards + `value`).
- Premium gate via the existing plan check; `msgCode` errors; docs/api.md; changelog entry (en/ro/it).

## Out of scope

Editing squads, pushing anything to EA, price history, cards not in the club.
