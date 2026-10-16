# Extension-first onboarding + semver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user who installs the extension before having an FC Solver account always sees the one step left, never sees install steps for an extension they have; the app moves to semver (this release 1.1.0).

**Architecture:** The server tells the extension whether its persona is owned (`/api/hello` → `owned`). The extension opens the site on first install, shows an amber "Almost done" popup state and a notice in the EA web app while unowned. The site surfaces extension presence (`link.ts`) through a pure `onboardingMode` rule and shows a "linking" panel instead of the install guide; the guide becomes Store-first. Changelog entries gain versions.

**Tech Stack:** Fastify 5 (TS via tsx), Chrome MV3 plain JS, React 19 + Vite, node:test, i18n via `t()`.

**Spec:** `docs/superpowers/specs/2026-10-16-extension-first-onboarding-design.md`

## Global Constraints

- Never change how linking works (link tokens, SID proof, `PERSONA_USER_LIMIT`), never add an EA call or an EA-writing job recipe.
- Every UI string via `t()`, keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts` (ro plurals `_one/_few/_other`, it `_one/_other`), ro/it written naturally; `npm run i18n:check`. Extension popup / bridge texts are English only (as today).
- UI rules (CLAUDE.md, DESIGN.md): `--go` only for the primary action, 8px controls / 14px containers, state never by color alone (amber state has the words "Almost done"), WCAG AA, `prefers-reduced-motion`, check 390px.
- Extension change → bump `extension/manifest.json` to `1.1.0` + entry in `extension/release.json`. The zip folder name stays `fc27-sbc-builder`.
- Endpoint payload change → `docs/api.md`. Extension behaviour → `docs/extension.md`. New track event → `TrackEvents` + `docs/analytics.md`, no personal data.
- Versions: semver strings; this release `1.1.0`; the 2026-10-16 changelog entry is `1.0.0`.
- Commits `type(scope): subject` + the Co-Authored-By trailer from your own system attribution. Never push.

## Review Focus

- Extension updated (not freshly installed) → no tab opens (`details.reason === 'install'` only) — Task 3 manual check + code review.
- A persona linked by ANOTHER user → `owned: true` (popup green, no notice) — the field means "has an owner", not "owned by the site user" — Task 2.
- Site open, extension present, but signed-in user already has a linked persona → no onboarding (dashboard) — unchanged path; Task 4 `onboardingMode` only used inside `Onboarding`.
- Phone with `?ext=installed` → phone mode wins (the extension can't run there) — Task 4 test.
- Old extension (no `owned` in storage) → popup treats unknown as green (no false "Almost done") — Task 3.

---

### Task 1: Semver + versioned changelog entries

**Files:**
- Modify: `shared/changelog.ts` (`ChangelogEntry.version?`, `APP_VERSION` derived, today's entry `version: '1.0.0'`)
- Modify: `shared/changelog.test.ts`
- Modify: `web/src/changelog/ChangelogPage.tsx:33-40` (version next to each dated entry that has one)
- Modify: `discord/changelog.ts:16-21` (title `FC Solver v<version> · <date>`, fallback `v1` for entries without version), `discord/changelog.test.ts` if it asserts the title; `server/discord/routes.ts:97` (`latestEnglish` keeps `version` in `BotEntry`); `discord/changelog.ts:5` `BotEntry.version?`
- Modify: `package.json` `"version"` stays `1.0.0` here (Task 5 bumps it)

**Interfaces — Produces:** `ChangelogEntry { id; date; version?: string; items }`, `APP_VERSION: string` = version of the newest entry that has one, `compareVersions(a: string, b: string): number` (exported, pure).

- [ ] **Step 1: Failing tests** in `shared/changelog.test.ts`:

```ts
test('versions are semver and only go up, newest first', () => {
  const versioned = CHANGELOG.filter((e) => e.version);
  assert.ok(versioned.length >= 1);
  for (const e of versioned) assert.match(e.version!, /^\d+\.\d+\.\d+$/);
  for (let i = 1; i < versioned.length; i++) assert.ok(compareVersions(versioned[i - 1].version!, versioned[i].version!) > 0);
});

test('APP_VERSION is the newest entry version', () => {
  assert.equal(APP_VERSION, CHANGELOG.find((e) => e.version)!.version);
});

test('compareVersions', () => {
  assert.ok(compareVersions('1.10.0', '1.9.3') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
});
```

Run `node --import tsx --test shared/changelog.test.ts` → FAIL.

- [ ] **Step 2: Implement** — in `shared/changelog.ts`: add `version?: string` (doc: "semver of the release this entry shipped in; entries before 2026-10-16 have none"), add `version: '1.0.0'` to the `2026-10-16` entry, replace `APP_VERSION = '1'` with:

```ts
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
/** The product version: the newest changelog entry's. Semver since v1 shipped (2026-10-16). */
export const APP_VERSION = CHANGELOG.find((e) => e.version)?.version ?? '1.0.0';
```

(declare `APP_VERSION` after `CHANGELOG`; update the header comment's version rule.)

- [ ] **Step 3: Page + bot** — ChangelogPage: keep the H1 version (`APP_VERSION`), and in each `<h2>` add `<span className="changelog-version">{t('changelog.version', { v: e.version })}</span>` when `e.version`. Bot: `BotEntry` gets `version?: string`; title `` `FC Solver v${e.version ?? '1'} · ${dateLabel(e.date)}` ``; `latestEnglish` copies `version`. Update their tests.

- [ ] **Step 4: Verify** — `npm test`, `npm run typecheck`, `npm run build`. **Commit** `feat(changelog): semver, a version per release entry`.

### Task 2: `/api/hello` says whether the persona has an owner

**Files:**
- Modify: `server/index.ts:575-615` (hello handler return objects)
- Modify: `docs/api.md` (`/api/hello` response)

**Interfaces — Produces:** every successful `/api/hello` body has `owned: boolean`.

- [ ] **Step 1: Implement** — compute once after the link block: `const owned = linked !== null || !!(await personaRow(r.account.id))?.userId;` and add `owned` to the final return; the `limited()` early return gets `owned: true` (the limit is only reached when the persona already has owners). Check `personaRow` is the existing helper used at line ~586 (same import); do not add a second DB helper.
- [ ] **Step 2: Verify** — `npm run typecheck`; build; your own API on :5188 (see common rules): `curl -s -X POST localhost:5188/api/hello -H 'content-type: application/json' -d '{}'` still answers its validation error (shape unchanged for errors). Document in `docs/api.md`.
- [ ] **Step 3: Commit** `feat(api): hello tells the extension if the EA account has an owner`

### Task 3: Extension 1.1.0 — welcome tab, popup states, web app notice

**Files:**
- Modify: `extension/background.js:116-122` (onInstalled), `:145-190` (hello stores owned)
- Modify: `extension/popup.js`, `extension/popup.html` (amber state + sign-in button)
- Modify: `extension/bridge.js` (notice, next to `showUpdateNotice` at :132)
- Modify: `extension/manifest.json` (`1.1.0`), `extension/release.json`, `docs/extension.md`

- [ ] **Step 1: onInstalled**

```js
chrome.runtime.onInstalled.addListener(async (details) => {
  reportVersion();
  checkForUpdate(true);
  startAlarm();
  refreshBadge();
  injectSiteScript();
  // first install only (never on updates): show where the one step left happens
  if (details.reason === 'install') {
    const { server } = await state();
    chrome.tabs.create({ url: `${server}/dashboard?ext=installed` }).catch(() => {});
  }
});
```

(`chrome.tabs.create` needs no extra permission.)

- [ ] **Step 2: hello stores owned** — in the success `chrome.storage.local.set({...})` add `ownedBy: { ...(await chrome.storage.local.get({ ownedBy: {} })).ownedBy, [identity.personaId]: body.owned !== false }` and `currentPersona: identity.personaId`. Unknown (`owned` missing from an older server) counts as owned (no false alarm). After a successful link the next hello stores `true`.
- [ ] **Step 3: Popup** — `renderStatus` reads `ownedBy`, `currentPersona`; when `live && ownedBy[currentPersona] === false` (and not working / paused) render class `almost` with title **"Almost done"** and detail `Connected to EA as ${connectedAs}, but not to an FC Solver account yet. Sign in on FC Solver with this web app open.`; show a button `#signin` (primary style) "Sign in to FC Solver" that opens `${server}/signin?next=%2Fdashboard` via `chrome.tabs.create`. Hide `#signin` otherwise. The not-connected text becomes `'Open the FC27 web app in this browser and log in to EA.'` for both branches (no "link your account" wording). Add `.almost` CSS (amber: reuse the existing `busy` yellow tone or a distinct amber with text contrast ≥ 4.5:1 on the popup background).
- [ ] **Step 4: Web app notice** — in `bridge.js`, a `showLinkNotice(server)` in a Shadow DOM like `showUpdateNotice` (same styling helpers): text "FC Solver: one step left. Sign in on FC Solver to link this EA account." + link "Sign in" to `${server}/signin?next=%2Fdashboard` (target `_blank`, `rel="noopener"`) + close button (×, `aria-label="Close"`); closing sets `sessionStorage['fcsolver-link-notice'] = '1'` and it isn't shown again in that tab session. Trigger: bridge listens to `chrome.storage.onChanged` / reads `ownedBy` + `currentPersona` + `server` on load and after changes; show when `ownedBy[currentPersona] === false`, remove when it becomes true. Never show it together with the update notice at the same spot (stack it below, or show the update notice only).
- [ ] **Step 5: Version + docs** — manifest `1.1.0`; `release.json` new top key `"1.1.0": ["Opens FC Solver right after you install it, and tells you (in the popup and in the web app) when your EA account still needs an FC Solver sign-in"]`; `docs/extension.md`: install flow, popup states (red / amber / green / busy / paused), the notice.
- [ ] **Step 6: Verify** — `npm test` (server extension tests: `server/extension.test.ts` may check manifest/release consistency), build. Manual: load `extension/` unpacked in Chrome against your :5188 API (popup server field) — fresh install opens the tab; popup amber with an unlinked persona if you can produce one locally; if no EA web app access, state so in the report and verify by reading code. **Commit** `feat(extension): welcome tab, almost-done state, link notice (1.1.0)`

### Task 4: Site — extension-aware onboarding, Store-first guide

**Files:**
- Modify: `web/src/link.ts` (hook returns `present: boolean`)
- Create: `web/src/onboarding.ts` + `web/src/onboarding.test.ts`
- Modify: `web/src/App.tsx` (`Onboarding` at ~1811, call site of `useExtensionLink` ~430, "No extension yet?" notice ~1081-1090)
- Modify: `web/src/components/SetupGuide.tsx` (Store first, zip in a disclosure), `/setup` lede key
- Modify: `web/src/components/SignIn.tsx` (`?ext=installed` line)
- Modify: `web/src/landing/Steps.tsx` (line under the steps)
- Modify: `web/src/track.ts`, `docs/analytics.md`, locales en/ro/it

**Interfaces — Produces:** `useExtensionLink(active, onLinked): { present: boolean }`; `onboardingMode({ present, phone, fromInstall }): 'linking' | 'install' | 'phone'`.

- [ ] **Step 1: Failing test** `web/src/onboarding.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingMode } from './onboarding';

test('phone wins: the extension cannot run there', () => {
  assert.equal(onboardingMode({ present: true, phone: true, fromInstall: true }), 'phone');
});
test('extension present or just installed: linking', () => {
  assert.equal(onboardingMode({ present: true, phone: false, fromInstall: false }), 'linking');
  assert.equal(onboardingMode({ present: false, phone: false, fromInstall: true }), 'linking');
});
test('otherwise: install', () => {
  assert.equal(onboardingMode({ present: false, phone: false, fromInstall: false }), 'install');
});
```

- [ ] **Step 2: Implement** `web/src/onboarding.ts`:

```ts
// Which onboarding a signed-in user without a linked EA account sees. Pure.
export type OnboardingMode = 'linking' | 'install' | 'phone';
export function onboardingMode({ present, phone, fromInstall }: { present: boolean; phone: boolean; fromInstall: boolean }): OnboardingMode {
  if (phone) return 'phone';
  return present || fromInstall ? 'linking' : 'install';
}
```

- [ ] **Step 3: link.ts** — `useState(false)` `present`, set true on `fcsolver:present`; return `{ present }`. App.tsx: keep the returned `present` and pass it to `Onboarding` and to the "No extension yet?" notice (hide that link when `present`).
- [ ] **Step 4: Onboarding** — `fromInstall = new URLSearchParams(location.search).get('ext') === 'installed'`; `mode = onboardingMode(...)`; `track('onboarding_mode', { mode })` once (useEffect on mode). `linking`: H1 `onb.linkTitle` ("Extension found" with a ✓ icon when `present`, "Extension installed" when only `fromInstall`), lede `onb.linkLede` ("Open the FC27 web app in this browser and log in to EA. Your EA account links to FC Solver by itself within a few seconds. Keep this tab open."), primary button (`--go`) `onb.openWebApp` → `WEB_APP` (export it from SetupGuide.tsx) new tab, a polite live region `onb.waiting` ("Waiting for the web app…"), then `<details><summary>{t('onb.needInstall')}</summary><SetupGuide /></details>`. `install`: as today. `phone`: unchanged.
- [ ] **Step 5: SetupGuide Store-first** — step 1 "Add FC Solver to Chrome" with an `ArrowSquareOut` link-button to `STORE_URL` (from `web/src/ext-version.ts`), step 2 open the web app and log in to EA (existing step text), step 3 come back / open FC Solver (existing). The current zip steps (download, unzip, chrome://extensions, load unpacked) move unchanged into `<details className="setup-zip"><summary>{t('setup.zipSummary')}</summary>…</details>` ("Can't use the Chrome Web Store? Install it from a zip"). `compact` prop keeps working. `/setup` lede key `setup.lede` rewritten for everyone (not only friends).
- [ ] **Step 6: SignIn + landing** — SignIn: if `next` contains `ext=installed` (or `location.search` has it), show above the form `<p className="banner" role="status">{t('auth.extInstalled')}</p>` ("Extension installed ✓ Create an account or sign in to finish — it takes a few seconds."). Root already carries `?ext=installed` through `/dashboard` → `/signin?next=…`: verify, else make the redirect keep the query in `next`. Landing Steps: under the steps a line `landing.how.haveExt` "Already have the extension?" + link `landing.how.signIn` → `/signin`.
- [ ] **Step 7: i18n + analytics** — keys above in en/ro/it; `TrackEvents.onboarding_mode: { mode: 'linking' | 'install' | 'phone' }` + `docs/analytics.md` row.
- [ ] **Step 8: Verify** — `npm test`, typecheck, i18n:check, build; headless screenshots at 1280 / 390 of onboarding (signed in, no persona) is hard without a test user: at least render the `/setup` page and the landing steps, and describe the onboarding states from code in the report. **Commit** `feat(onboarding): extension-aware setup, Store-first guide`

### Task 5: Release 1.1.0 bookkeeping

**Files:** `shared/changelog.ts` (new top entry), `package.json` (`1.1.0`), `package-lock.json` (version field only, via `npm version 1.1.0 --no-git-tag-version`).

- [ ] **Step 1** — new entry `{ id: '2026-10-16-2', date: '2026-10-16', version: '1.1.0', items: { en: [...], ro: [...], it: [...] } }` above today's `1.0.0` entry (newest first). en: "Installed the extension first? FC Solver now opens right after the install and tells you the one step left: sign in with the FC27 web app open. The extension popup shows \"Almost done\" until your EA account is linked, and setup puts the Chrome Web Store first". Write ro and it yourself.
- [ ] **Step 2** — `npm version 1.1.0 --no-git-tag-version`; `npm test` (changelog tests: APP_VERSION 1.1.0, versions go up), typecheck, build. **Commit** `chore(release): 1.1.0`
