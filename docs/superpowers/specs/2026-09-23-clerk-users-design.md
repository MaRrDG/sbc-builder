# Users via Clerk (sub-project 2 of 3)

Date: 2026-09-23. Status: approved design, awaiting spec review.

## Context and scope

FC Solver is going public (sub-project 1: shared SBC database, done; sub-project 3: 5 EUR monthly subscription, next). Today there are no users, only EA personas: the extension proves an EA session, the server hands back a per-persona access key, the extension passes it to the site in `#keys=`, the site keeps it in `localStorage['sbc-account-keys']` and sends it as `X-Account-Key` (`server/accounts.ts`, `server/index.ts:48`, `web/src/api.ts:170`).

Goals:
- Sign in with Google or an emailed code, through our own UI (Clerk hooks, no Clerk components).
- A user owns EA personas: 1 user → many personas, 1 persona → 1 user. Once linked, a persona is visible on any device the user signs in on (phone included, no extension needed).
- The extension links the persona to the signed-in user automatically.
- Access keys never reach the browser again; the site requires sign-in for everything except the public pages.
- `users.id` is stable so sub-project 3 can hang the subscription on it.

Non-goals: subscriptions, Clerk webhooks, deleting a FC Solver account, admin roles, removing legacy (server-side SID) mode, auto-linking on a custom server URL set in the extension popup.

## Server auth (approach A)

- The site sends `Authorization: Bearer <Clerk session token>` and `X-Persona: <personaId>` on every API call.
- New `server/auth.ts` verifies the token with `@clerk/backend` `verifyToken` (networkless, cached JWT key; `CLERK_SECRET_KEY` from `.env`), upserts the user (`last_seen_at`), and checks that `X-Persona` belongs to the user. `account(req)` in `server/index.ts` switches to it for site endpoints.
- The extension keeps using the per-persona key (`X-Account-Key`) for `/api/hello`, jobs, relay and the other extension endpoints. The key stays between extension and server.
- Public (no auth): `/api/meta`, extension zip download and release info, static site.
- Removed: `/api/accounts` (validated browser-held keys).
- The server exits with a clear message when `CLERK_SECRET_KEY` is missing (like the DB).
- Errors carry `msgCode`: `err.signIn` (401), `err.personaNotYours` (403), `err.personaTakenOver` (403).

## Schema (Postgres, Drizzle migration)

| Table | Columns |
|---|---|
| `users` | `id` text PK (Clerk user id), `email` text, `created_at`, `last_seen_at` timestamptz |
| `personas` | `persona_id` bigint PK, `user_id` text → `users`, `linked_at` timestamptz |
| `link_tokens` | `token_hash` text PK (SHA-256), `user_id` → `users`, `expires_at` timestamptz, `used_at` timestamptz nullable |

- `personas.persona_id` as PK enforces one owner. A takeover updates `user_id` and `linked_at`.
- Per-persona data (club, squad, progress, meter, keys) stays in `data/accounts/<personaId>/`.
- Sub-project 3 adds its own subscription columns to `users`; nothing subscription-related is added now.
- Expired / used link tokens may be deleted by the server (they are not history).

## Linking the extension

Extension 0.8.0 (bump `manifest.json` + `release.json`) adds a content script `site.js` on `https://sbc-builder.mario-theodor.ro/*`, `http://localhost:5173/*`, `http://127.0.0.1:5173/*`.

1. Signed in, the site calls `POST /api/link-token` (Clerk auth) and gets a random token; the server stores only its hash, valid 10 minutes, single use.
2. The site posts `window.postMessage({ type: 'fcsolver:link', token }, location.origin)`; `site.js` checks the event origin and source and forwards it to `background.js`, which keeps it until used.
3. On the next `/api/hello` (web app open), the extension adds `linkToken`. The server marks the token used and decides (pure function, `server/auth-rules.ts`):
   - persona unowned or already this user's → link (holding the persona key is the proof);
   - persona owned by another user and no SID in this request → answer `needSid` (existing flow); the extension resends with the SID once, EA confirms the persona via `/usermassinfo` (metered), then `user_id` moves to the new user;
   - token unknown / expired / used → ignored for linking (hello still succeeds), extension drops it.
4. `/api/hello` returns `linked: { personaId }`; `site.js` posts `fcsolver:linked` so the site reloads `/api/me`.

- `site.js` announces itself on load (`fcsolver:present`). While signed in and the extension is present, the site issues a token on load and a new one before the old expires (every 9 minutes while the page is open), so an expired token is invisible to the user and a second persona links the same way as the first.
- Sign-out: the site posts `fcsolver:unlink`; the extension forgets any unused token. DB links stay.
- Settings has "Disconnect persona" (`DELETE /api/personas/:id`, own personas only): removes the link row; the persona can be linked again by anyone who proves it.
- Extensions below 0.8 keep working for relay and jobs; only linking needs 0.8, and the site shows the existing update prompt.

## Web UI

- Clerk React SDK only for `ClerkProvider` (`web/src/main.tsx`) and the hooks `useSignIn`, `useSignUp`, `useAuth`, `useUser`. Exact package and version are pinned in the plan from the current Clerk docs. `VITE_CLERK_PUBLISHABLE_KEY` from `.env`.
- New route `/signin` (+ `/signin/callback` for the Google OAuth redirect) in `route.ts`, screen `web/src/components/SignIn.tsx`, EA look (dark teal, 14px containers, 8px controls):
  - step 1: "Continue with Google", divider, email field + "Send code" (`--go`, primary action);
  - step 2: 6-digit code field (`autocomplete="one-time-code"`), "Resend code" (30 s cooldown), "Change email";
  - one flow for sign-in and sign-up: try `signIn` with `email_code`; if the identifier does not exist, switch to `signUp` with email code verification. No separate "create account" screen.
  - Clerk errors map to `auth.*` keys (en + ro), never Clerk's raw text.
- Public routes: `/signin`, `/guide`, `/setup`. Any other route while signed out → `/signin?next=<path>`; after sign-in, back to `next` (internal paths only: must start with a single `/`, no `//`, no scheme).
- Signed in: avatar / initial in the top bar (inside the hamburger menu under 860px). Settings gets an "Account" section: email, "Sign out", linked personas each with "Disconnect persona" (inline confirmation, no `confirm()`).
- The persona picker stays; its list comes from `GET /api/me` (`{ user: { id, email }, personas: [{ personaId, personaName, clubName, session, … }] }`) instead of stored keys. The chosen persona goes in `X-Persona`.
- `api.ts`: requests get the token via `getToken()`; on 401 retry once with a fresh token, then go to `/signin?next=…`; on `err.personaNotYours` / `err.personaTakenOver` reload `/api/me` (takeover shows a one-time banner).
- On first load the site deletes `localStorage['sbc-account-keys']` and ignores `#keys=` (scrubbing it from the URL). The extension popup no longer adds `#keys=` to "Open FC Solver".
- Every string through `t()` (en + ro, Romanian plurals), labels on fields, visible focus, errors in `aria-live` with icon + text, step transition respects `prefers-reduced-motion`, checked at 390px.

## Error handling

- Missing / expired Clerk token → 401 `err.signIn`; the site refreshes the token once, then redirects to sign-in.
- Clerk down: already-signed-in users keep working (local verification); new sign-ins show a translated error.
- Link token problems never fail `/api/hello`.
- Takeover: the previous owner's next request for that persona gets `err.personaTakenOver`.

## Testing

- `node:test` unit tests for the pure rules in `server/auth-rules.ts`: link decision (unowned, mine, other without SID, other with SID), link token validity (expired, used, unknown), safe `next` path.
- Manual, local, against a Clerk development instance: Google sign-in, email code sign-in and sign-up, automatic linking with extension 0.8 + web app, takeover from a second Chrome profile, phone width (390px) sign-in and persona visible without the extension, sign-out.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run i18n:check`.

## Deploy and docs

- `.env`: `CLERK_SECRET_KEY` (server), `VITE_CLERK_PUBLISHABLE_KEY` (public, needed at `vite build`: passed to the image build via compose `build.args`). `.env.example` updated without secrets.
- Clerk production instance: domain `sbc-builder.mario-theodor.ro`, Google OAuth with our own credentials, email code on, passwords off.
- Docs: `docs/api.md` (`/api/me`, `/api/link-token`, `DELETE /api/personas/:id`, `Authorization` + `X-Persona`, `linkToken` / `linked` in `/api/hello`, `/api/accounts` removed), `docs/extension.md` (`site.js`, linking), `docs/architecture.md` (users and ownership), `docs/deploy.md` (Clerk keys and dashboard setup), `CLAUDE.md` (Auth rule rewritten).
