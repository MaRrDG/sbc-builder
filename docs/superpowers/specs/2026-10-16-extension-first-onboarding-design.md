# Extension-first onboarding

Date: 2026-10-16. Goal: a user who installs the extension (usually from the Chrome Web Store) before
having an FC Solver account always knows the one step left — sign in on FC Solver with the FC27 web
app open — and never sees install steps for an extension they already have.

## Today (problems)

1. Install is silent: no tab opens; the popup says "log in to link your account", which reads as the EA login.
2. The popup shows green "Connected" for a persona no FC Solver user owns (data syncs, nobody sees it).
3. No notice in the EA web app that the persona is not linked.
4. The site detects the extension (`fcsolver:present`, `web/src/link.ts`) but never shows it: onboarding
   always shows the 6-step zip guide (`SetupGuide`), so Store users see steps they can't / mustn't do.
5. Linking needs a signed-in FC Solver tab and the FC27 web app open in the same browser; nothing says so.
6. "No extension yet?" and `/setup` point only to the zip; the Store link exists only in the update banner.

## Design

### Server
- `/api/hello` answers `owned: boolean`: the persona belongs to at least one FC Solver user (`personas`
  table). True right after a link in the same call. `docs/api.md`.

### Extension (1.1.0, `extension/release.json`)
- `onInstalled` with `reason === 'install'` (not updates) opens `<server>/dashboard?ext=installed`.
- `hello()` stores `owned` per persona (`ownedBy: { [personaId]: boolean }` in `chrome.storage.local`).
- Popup, three states:
  - red **Not connected**: "Open the FC27 web app and log in to EA."
  - amber **Almost done**: "Connected to EA as <persona>, but not to an FC Solver account yet." + primary
    button **Sign in to FC Solver** → `<server>/signin?next=/dashboard` (opens a tab). Hint: keep the web app open.
  - green **Connected** (as today).
  The badge stays as today (green dot = connected to EA); only the popup text changes.
- EA web app notice (`bridge.js`, same Shadow DOM style as the update notice): when connected and not
  owned, a small notice "FC Solver: one step left — sign in on FC Solver to link this account" with a link
  to `<server>/signin?next=/dashboard`; dismissible for the browser session.

### Site
- `link.ts`: the hook also returns `present` (extension answered). Pure rule in `web/src/onboarding.ts`:
  `onboardingMode({ present, phone })` → `'linking' | 'install' | 'phone'`.
- Onboarding (`App.tsx` `Onboarding`, no linked persona):
  - `linking`: "✓ Extension found" panel: "Open the FC27 web app in this browser and log in to EA — your
    account links by itself within seconds. Keep this tab open." + button **Open the FC27 web app** (EA
    URL, new tab) + spinner line "Waiting for the web app…". Install guide folded under "Need to install it?".
  - `install`: the guide, Store first.
- `SetupGuide` (onboarding + `/setup`): step 1 **Add to Chrome** (Store URL, `STORE_URL`), step 2 open the
  web app and log in, step 3 come back here. The zip steps move into a "Can't use the Chrome Web Store?"
  disclosure (unchanged content). `/setup` lede no longer talks about friends only.
- `?ext=installed` (from the install tab): sign-in screen shows "Extension installed ✓ — create an account
  or sign in to finish"; onboarding shows the `linking` panel even before `present` arrives.
- Dashboard notice "FC27 web app not open… No extension yet?": the "No extension yet?" link only when the
  extension is not present.
- Landing "how it works" steps: a line under them "Already have the extension? Sign in →" (`/signin`).
- i18n en / ro / it, changelog entry (user-visible), `docs/extension.md` (install flow, popup states).
- Analytics: `onboarding_mode: { mode: 'linking' | 'install' | 'phone' }` once per onboarding view
  (`TrackEvents` + `docs/analytics.md`), to see how many users arrive extension-first.

### Version (new rule: v1 shipped 2026-10-16)
- This release is **1.1.0** (notable feature). `APP_VERSION` and `package.json` become semver strings.
- `ChangelogEntry` gets an optional `version`; entries from 2026-10-16 on carry one (today's = `1.0.0`,
  this release's = `1.1.0`); `APP_VERSION` = the newest entry's version (a test checks they agree and that
  versions only go up). `/changelog` shows the version next to each dated entry that has one; the bot's
  changelog post title includes it. Older entries stay without a version.

## Out of scope
- Changing how linking works (token, SID proof, limits). Phone flow.
- Publishing to the Chrome Web Store (owner uploads the zip).

## Testing
- `npm test`: `onboardingMode`, popup state rule (pure function in `extension/` shared by popup only if
  the repo already tests extension code; else a small pure module `web/src/ext-state.ts` mirrored in the
  popup is NOT added — the popup logic stays a 3-branch if, checked by hand).
- Typecheck, build, i18n check. Browser: onboarding with the extension present / absent at 1280 and 390 px;
  extension loaded unpacked: fresh install opens the tab, popup amber before linking, green after, notice in
  the web app appears then disappears after linking.
