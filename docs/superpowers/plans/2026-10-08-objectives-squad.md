# Objectives Squad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user ticks EA objectives with a squad condition ("score with a Dutch player", "min. 1 Eredivisie player in your starting 11") and FC Solver (Premium) returns the strongest playable in-position squad from their club that covers them, plus a landing section that shows the feature.

**Architecture:** The extension relays the web app's `GET /scmp/objective/categories/all`; `server/events.ts` caches it per account. A pure parser (`server/objectives/parse.ts`) turns each objective's English description into structured conditions. A pure problem builder (`server/objectives/play.ts`) maps conditions onto the existing CP-SAT model, which gains a `"play"` mode (maximise rating + chemistry, no out-of-position players, new `slotCount` constraint). `squad.ts` re-checks chemistry/rating; `checkCovers` re-checks the conditions. Two site endpoints, one new dashboard screen, one landing section.

**Tech Stack:** Fastify 5 + TypeScript (tsx, node:test), OR-Tools CP-SAT (Python), React 19 + Vite 8, plain CSS with OKLCH tokens, Phosphor icons, Chrome MV3 extension.

**Spec:** `docs/superpowers/specs/2026-10-08-objectives-squad-design.md`

## Global Constraints

- Read-only toward EA: no new job recipe, no EA call from the server for this feature; data only from what the web app loads.
- Premium only: `GET /api/objectives` and `POST /api/objectives/solve` throw `SessionError(..., 403, 'premiumOnly')` for Free, like `/api/gallery` (`server/index.ts:541`). No quota.
- Every user-facing string through `t()`; keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts` (Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`); `npm run i18n:check` passes. EA text (objective names/descriptions, player/league/nation names) stays as EA sends it.
- Server errors shown to users carry a `msgCode`/`code` the site translates (`err.*`).
- Extension change → bump `extension/manifest.json` to `0.9.0` and add a `extension/release.json` entry. Zip folder name stays `fc27-sbc-builder`.
- New endpoint → document in `docs/api.md`.
- UI: EA web-app look; `--go` green only for the primary action / met / selected; controls 8px radius, containers 14px; requirement state never by colour alone; WCAG AA; `prefers-reduced-motion`; check 390px width.
- `found` comes from the server-side re-check (`evaluate` + `checkCovers`), never from the solver status.
- Unit tests only for pure logic (`npm test`); verify with `npm run typecheck`, `npm run build`, real cached data in `data/`, and the browser.
- Never print or commit SIDs / account keys (`data/` is git-ignored).
- Commits: `git pull --rebase` first, conventional `type(scope): subject`, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push unprompted.

## Review Focus

- Objective whose name never resolves (e.g. "Argentine Primera División player", not in meta) → no condition, shown as "no squad condition", never a crash or a wrong league. Test in Task 1.
- League names in meta are longer than EA's wording ("Serie A" vs `Serie A Enilive`, curly `’` in `Barclays Women’s Super League`) → still resolves. Test in Task 1.
- Two ticked objectives that need the same scarce player in two different roles → solver either places one player covering both (CAM is in both score and assist slots) or returns `combo`, never a squad that `checkCovers` rejects reported as found. Test in Task 4 (`checkCovers` on a hand-built squad) and Task 5 (found only when every cover is met).
- Cached objectives from yesterday: a group whose `endTime` passed, or an objective already `REDEEMED`, must not be shown or solvable. Test in Task 2.
- A GK in the pool with an attribute condition ("85+ Pace") must not match (GK attributes are DIV/HAN/KIC/REF/SPE/POS). Test in Task 4.

---

## File map

| File | Responsibility |
|---|---|
| `server/objectives/types.ts` (create) | EA DTOs for the objectives payload; `Filter`, `Condition`, `ObjectiveView`, `ObjectiveGroupView` |
| `server/objectives/parse.ts` (create) | `normName`, `resolveName`, `parseConditions(description, names)` |
| `server/objectives/parse.test.ts` (create) | parser fixtures from the spec |
| `server/objectives/open.ts` (create) | `openGroups(categories, now, names)`: active groups, open objectives, parsed conditions |
| `server/objectives/open.test.ts` (create) | expiry / redeemed / conditions attached |
| `server/objectives/play.ts` (create) | `matchesFilter`, `roleSlots`, `playPool`, `buildPlayProblem`, `checkCovers`, `diagnosePlay` |
| `server/objectives/play.test.ts` (create) | pure tests for the above |
| `server/objectives/solve.ts` (create) | `solveObjectives(...)`: pool → CP-SAT → re-check |
| `server/solver.ts` (modify) | export `runCpSat` and a new `playerChem(p, meta)` (extracted from `buildProblem`) |
| `solver/cpsat.py` (modify) | `"play"` mode: `noOff`, `slotCount`, maximise objective |
| `server/events.ts` (modify) | `WATCHED_PATH` += objectives path; cache `objectives`; squad cache keeps `formation` |
| `extension/hook.js`, `extension/manifest.json`, `extension/release.json` (modify) | relay the objectives path; 0.9.0 |
| `server/index.ts` (modify) | `GET /api/objectives`, `POST /api/objectives/solve` |
| `docs/api.md`, `docs/solver.md`, `docs/extension.md` (modify) | docs |
| `web/src/api.ts` (modify) | types + `objectives()`, `solveObjectives()` |
| `web/src/route.ts` (modify) | `objectives` view |
| `web/src/components/objectives/ObjectivesView.tsx` (create) | list, ticks, sticky bar, result |
| `web/src/components/objectives/objectives.ts` (create) | pure helpers: pill text, localStorage keys, time left |
| `web/src/components/objectives/objectives.test.ts` (create) | helper tests |
| `web/src/App.tsx` (modify) | nav item + view mount |
| `web/src/styles.css` (modify) | objectives screen styles |
| `web/src/landing/Objectives.tsx` (create), `web/src/landing/Landing.tsx`, `web/src/landing/landing.css` (modify) | landing section `#objectives` + nav link |
| `web/src/locales/en.ts`, `ro.ts`, `it.ts` (modify) | strings |

---

### Task 1: Condition parser

**Files:**
- Create: `server/objectives/types.ts`
- Create: `server/objectives/parse.ts`
- Test: `server/objectives/parse.test.ts`

**Interfaces:**
- Consumes: nothing (pure). `Names` is the shape of `Meta['names']` restricted to `nation | league | club | rarity` (`Record<string, string>` id → name).
- Produces:
  - `type Stat = 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY'`
  - `interface Filter { nation?: number[]; league?: number[]; club?: number[]; rarity?: number[]; position?: string; preferredOnly?: boolean; attr?: { stat: Stat; min: number } }`
  - `type Role = 'xi' | 'score' | 'assist'`
  - `interface Condition { filter: Filter; role: Role; min: number }`
  - `type Names = Record<'nation' | 'league' | 'club' | 'rarity', Record<string, string>>`
  - `normName(s: string): string`
  - `resolveName(text: string, names: Names): Filter | null`
  - `parseConditions(description: string, names: Names): Condition[]`

- [ ] **Step 1: Write the types**

`server/objectives/types.ts`:

```ts
// EA objectives (GET /scmp/objective/categories/all, relayed from the web app) and what we derive from them.

export type Stat = 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY';

/** Which players a condition accepts; every present field must match. */
export interface Filter {
  nation?: number[];
  league?: number[];
  club?: number[];
  rarity?: number[];
  position?: string; // "ST", "CAM" ...
  preferredOnly?: boolean; // "(Preferred position only)"
  attr?: { stat: Stat; min: number }; // "85+ Pace"
}

/** xi: somewhere in the starting 11; score / assist: in a slot where they score / create. */
export type Role = 'xi' | 'score' | 'assist';

export interface Condition {
  filter: Filter;
  role: Role;
  min: number;
}

export type Names = Record<'nation' | 'league' | 'club' | 'rarity', Record<string, string>>;

export interface EaAward {
  value: number;
  awardType: string;
  untradeable?: boolean;
  itemDataReduced?: { description?: string; itemType?: string; rating?: number } | null;
}

export interface EaObjective {
  objectiveId: number;
  name: string;
  description: string;
  state?: string; // missing = not started; "IN_PROGRESS" | "COMPLETED" | "REDEEMED"
  currentProgress?: number;
  multiplier: number;
  awards: EaAward[];
}

export interface EaGroup {
  groupId: number;
  title: string;
  startTime: number; // seconds
  endTime: number; // seconds, 0 = no end
  awardsList: EaAward[];
  objectives: EaObjective[];
}

export interface EaCategory {
  categoryId: number;
  name: string;
  groupsList: EaGroup[];
}

export interface ObjectiveView {
  id: number;
  name: string;
  description: string;
  progress: number;
  target: number;
  awards: EaAward[];
  conditions: Condition[];
}

export interface ObjectiveGroupView {
  id: number;
  title: string;
  category: string;
  endsAt: number | null; // ms, null = no end
  awards: EaAward[];
  objectives: ObjectiveView[];
}
```

- [ ] **Step 2: Write the failing tests**

`server/objectives/parse.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConditions, resolveName, normName } from './parse.js';
import type { Names } from './types.js';

// ids copied from the real FC 27 meta (server/meta.ts names)
const names: Names = {
  nation: { 14: 'England', 18: 'France', 34: 'Netherlands', 45: 'Spain', 52: 'Argentina', 95: 'United States' },
  league: {
    10: 'Eredivisie', 13: 'Premier League', 31: 'Serie A Enilive', 53: 'LALIGA EA SPORTS',
    2216: 'Barclays Women’s Super League', 2218: 'Arkema Première Ligue',
  },
  club: { 1: 'Arsenal', 245: 'Ajax' },
  rarity: { 1: 'Rare', 151: 'Ultimate Scream', 168: 'Ultimate Scream Hero' },
};
const p = (d: string) => parseConditions(d, names);

test('normName folds case, accents and curly quotes', () => {
  assert.equal(normName('  Arkema  Première Ligue'), 'arkema premiere ligue');
  assert.equal(normName('Barclays Women’s Super League'), "barclays women's super league");
});

test('resolveName: aliases, exact names, prefix names, unknown', () => {
  assert.deepEqual(resolveName('Dutch', names), { nation: [34] });
  assert.deepEqual(resolveName('USA', names), { nation: [95] });
  assert.deepEqual(resolveName('WSL', names), { league: [2216] });
  assert.deepEqual(resolveName("Women's Super League", names), { league: [2216] });
  assert.deepEqual(resolveName('Serie A', names), { league: [31] });
  assert.deepEqual(resolveName('Ultimate Scream', names), { rarity: [151] });
  assert.deepEqual(resolveName('Ajax', names), { club: [245] });
  assert.equal(resolveName('Argentine Primera División', names), null);
});

test('score / assist using a filtered player', () => {
  assert.deepEqual(p('Score 6 goals using a Dutch player in any FUT game mode.'), [{ role: 'score', min: 1, filter: { nation: [34] } }]);
  assert.deepEqual(p('Score 6 goals in Squad Battles on Min. Semi-Pro difficulty (or Rivals/Live Events/Rush) using a player from France.'),
    [{ role: 'score', min: 1, filter: { nation: [18] } }]);
  assert.deepEqual(p('Assist 3 goals in Squad Battles on Min. Semi-Pro difficulty (or Rivals/Live Events/Rush) using a Arkema Première Ligue player.'),
    [{ role: 'assist', min: 1, filter: { league: [2218] } }]);
  assert.deepEqual(p('Assist 6 goals in Squad Battles on Min. Semi-Pro difficulty (or Rush) using a player from Serie A.'),
    [{ role: 'assist', min: 1, filter: { league: [31] } }]);
  assert.deepEqual(p('Score 10 goals in any FUT game mode using a Spanish player.'), [{ role: 'score', min: 1, filter: { nation: [45] } }]);
});

test('score and assist together give two conditions', () => {
  assert.deepEqual(p('Score and Assist in 3 separate matches using a Eredivisie player in any FUT game mode.'), [
    { role: 'score', min: 1, filter: { league: [10] } },
    { role: 'assist', min: 1, filter: { league: [10] } },
  ]);
});

test('positions and attributes', () => {
  assert.deepEqual(p('Assist 5 goals using a CAM (Preferred position only) in any FUT game mode.'),
    [{ role: 'assist', min: 1, filter: { position: 'CAM', preferredOnly: true } }]);
  assert.deepEqual(p('Assist 5 goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) using a ST.'),
    [{ role: 'assist', min: 1, filter: { position: 'ST' } }]);
  assert.deepEqual(p('Score 6 goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) using Players with 85+ Pace.'),
    [{ role: 'score', min: 1, filter: { attr: { stat: 'PAC', min: 85 } } }]);
});

test('starting 11 conditions', () => {
  assert.deepEqual(p('Win 4 matches while having min. 1 Dutch player in your starting 11 in any FUT game mode.'),
    [{ role: 'xi', min: 1, filter: { nation: [34] } }]);
  assert.deepEqual(p('Play 5 matches while having min. 1 Eredivisie player in your starting 11 in any FUT game mode.'),
    [{ role: 'xi', min: 1, filter: { league: [10] } }]);
  assert.deepEqual(p('Play 3 matches in any Football Ultimate Team game mode while having at least 2 players from USA in your starting 11.'),
    [{ role: 'xi', min: 2, filter: { nation: [95] } }]);
  assert.deepEqual(p('Play 5 matches in any Ultimate Team game mode while having Min. 1 Ultimate Scream player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { rarity: [151] } }]);
  assert.deepEqual(p('Win 5 matches in Rivals or Live Events while having min. 1 English Player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { nation: [14] } }]);
  assert.deepEqual(p('Assist 1 goal while having min. 1 Spanish player in your starting XI in the Ones We Watched World Class Challenge.'),
    [{ role: 'xi', min: 1, filter: { nation: [45] } }]);
  assert.deepEqual(
    p("Score 5 goals in any Football Ultimate Team game mode while having at least 1 player from any Premier League team and 1 player from any Women's Super League team in your starting 11."),
    [{ role: 'xi', min: 1, filter: { league: [13] } }, { role: 'xi', min: 1, filter: { league: [2216] } }],
  );
  assert.deepEqual(p('Win 3 matches by 2 or more goals in Squad Battles on min. Semi-Pro difficulty (or Rush/Rivals/Live Events) while having min. 1 WSL Player in your starting 11.'),
    [{ role: 'xi', min: 1, filter: { league: [2216] } }]);
});

test('no squad condition', () => {
  for (const d of [
    'Win 4 matches in Rivals.',
    'Play 15 Draft matches.',
    'Win 100 matches in any FUT game mode with a starting squad of First Owned players.',
    'Win 3 matches in any FUT game mode while having the Icon Home Kit equipped.',
    'Build 20+ Chemistry in your squad.',
    'Play 5 Matches in any Ultimate Team Game mode while having Min. 1 Argentine Primera División player in your starting 11.',
  ])
    assert.deepEqual(p(d), [], d);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --import tsx --test server/objectives/parse.test.ts`
Expected: FAIL, `Cannot find module './parse.js'`.

- [ ] **Step 4: Write the parser**

`server/objectives/parse.ts`:

```ts
// Reads the squad condition out of an EA objective description ("score ... using a Dutch player",
// "min. 1 Eredivisie player in your starting 11"). Only the squad part: game mode and counts stay EA text.
import type { Condition, Filter, Names, Role, Stat } from './types.js';

export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// EA words nations as adjectives and some leagues by short names; values are names as meta has them
const ALIASES: Record<string, ['nation' | 'league', string]> = {
  dutch: ['nation', 'Netherlands'], holland: ['nation', 'Netherlands'],
  english: ['nation', 'England'], spanish: ['nation', 'Spain'], french: ['nation', 'France'],
  german: ['nation', 'Germany'], italian: ['nation', 'Italy'], portuguese: ['nation', 'Portugal'],
  brazilian: ['nation', 'Brazil'], argentine: ['nation', 'Argentina'], argentinian: ['nation', 'Argentina'],
  belgian: ['nation', 'Belgium'], usa: ['nation', 'United States'], american: ['nation', 'United States'],
  wsl: ['league', 'Barclays Women’s Super League'],
  "women's super league": ['league', 'Barclays Women’s Super League'],
};

const ORDER = ['nation', 'league', 'rarity', 'club'] as const;

/** Ids whose name is exactly `want`, else whose name starts with `want` + space ("Serie A" -> "Serie A Enilive"). */
function lookup(table: Record<string, string>, want: string): number[] {
  const rows = Object.entries(table).map(([id, name]) => [Number(id), normName(name)] as const);
  const exact = rows.filter(([, n]) => n === want).map(([id]) => id);
  if (exact.length) return exact;
  const prefix = rows.filter(([, n]) => n.startsWith(`${want} `));
  if (!prefix.length) return [];
  const shortest = Math.min(...prefix.map(([, n]) => n.length));
  return prefix.filter(([, n]) => n.length === shortest).map(([id]) => id);
}

export function resolveName(text: string, names: Names): Filter | null {
  const want = normName(text);
  if (!want) return null;
  const alias = ALIASES[want];
  if (alias) {
    const ids = lookup(names[alias[0]], normName(alias[1]));
    return ids.length ? { [alias[0]]: ids } : null;
  }
  for (const kind of ORDER) {
    const ids = lookup(names[kind], want);
    if (ids.length) return { [kind]: ids };
  }
  return null;
}

const POSITIONS = new Set(['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'RF', 'LF', 'CF', 'ST']);
const STATS: Record<string, Stat> = { pac: 'PAC', sho: 'SHO', pas: 'PAS', dri: 'DRI', def: 'DEF', phy: 'PHY' };

/** "a Dutch player", "player from France", "CAM (Preferred position only)", "Players with 85+ Pace". */
function subjectFilter(raw: string, names: Names): Filter | null {
  const preferredOnly = /\(preferred position only\)/i.test(raw);
  let s = raw.replace(/\(preferred position only\)/i, ' ').trim();
  const attr = s.match(/(\d+)\+\s*(pace|shooting|passing|dribbling|defending|physical(?:ity)?)/i);
  if (attr) return { attr: { stat: STATS[attr[2].toLowerCase().slice(0, 3)], min: Number(attr[1]) } };
  s = s
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/\bplayers?\b/gi, ' ')
    .replace(/\bfrom any\b|\bfrom\b|\bteam\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (POSITIONS.has(s)) return preferredOnly ? { position: s, preferredOnly: true } : { position: s };
  return resolveName(s, names);
}

// "using a Dutch player" up to the next clause ("in any ...", "in the ...", end of sentence)
const USING = /\busing\s+(.+?)(?=\s+in\s+(?:any|the|squad)\b|\.\s*$|$)/i;
// "min. 1 Eredivisie player ... in your starting 11"
const XI = /(?:min\.?|at least)\s*(\d+)\s+(.+?)\s+in your starting (?:11|xi|eleven)\b/i;

export function parseConditions(description: string, names: Names): Condition[] {
  const text = description.replace(/\s+/g, ' ').trim();
  const out: Condition[] = [];

  const using = text.match(USING);
  if (using) {
    const filter = subjectFilter(using[1], names);
    if (filter) {
      const head = text.slice(0, using.index);
      const roles: Role[] = [];
      if (/\bscor/i.test(head)) roles.push('score');
      if (/\bassist/i.test(head)) roles.push('assist');
      for (const role of roles) out.push({ role, min: 1, filter });
    }
  }

  const xi = text.match(XI);
  if (xi) {
    // "1 player from any Premier League team and 1 player from any Women's Super League team"
    const parts = `${xi[1]} ${xi[2]}`.split(/\s+and\s+(?=\d)/i);
    for (const part of parts) {
      const m = part.match(/^(\d+)\s+(.+)$/);
      if (!m) continue;
      const filter = subjectFilter(m[2], names);
      if (filter) out.push({ role: 'xi', min: Number(m[1]), filter });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --import tsx --test server/objectives/parse.test.ts`
Expected: PASS (all 7 tests). If a fixture fails, fix the regex in `parse.ts`, not the fixture: the fixtures are EA's real wording.

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add server/objectives/types.ts server/objectives/parse.ts server/objectives/parse.test.ts
git commit -m "feat(objectives): parse squad conditions from objective text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Relay, cache and open objectives

**Files:**
- Create: `server/objectives/open.ts`
- Test: `server/objectives/open.test.ts`
- Modify: `server/events.ts:27-29` (`WATCHED_PATH`), `server/events.ts:145` (`applyLoadedData`), `server/events.ts:127-140` (`onSquad` keeps `formation`)
- Modify: `server/solver.ts:56-59` (`ActiveSquad` gains `formation?: string`)
- Modify: `extension/hook.js:10` (`WATCH`), `extension/manifest.json` (`"version": "0.9.0"`), `extension/release.json`
- Modify: `docs/extension.md` (relayed paths list)

**Interfaces:**
- Consumes: `parseConditions`, `Names`, `EaCategory`, `ObjectiveGroupView` (Task 1).
- Produces:
  - `openGroups(categories: EaCategory[], now: number, names: Names): ObjectiveGroupView[]` (`now` in ms)
  - cache key `objectives` per account holding `{ categories: EaCategory[] }` (read with `readCache<{ categories: EaCategory[] }>(acc.key('objectives'))`)
  - `ActiveSquad.formation?: string`
  - `OBJECTIVES_PATH = '/scmp/objective/categories/all'` exported from `server/events.ts`

- [ ] **Step 1: Write the failing test**

`server/objectives/open.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openGroups } from './open.js';
import type { EaCategory, EaObjective, Names } from './types.js';

const names: Names = { nation: { 34: 'Netherlands' }, league: { 10: 'Eredivisie' }, club: {}, rarity: {} };
const NOW = 1_791_000_000_000; // ms
const sec = (ms: number) => Math.floor(ms / 1000);
const obj = (id: number, description: string, state?: string): EaObjective => ({
  objectiveId: id, name: `O${id}`, description, state, currentProgress: 1, multiplier: 6, awards: [],
});
const cats = (endTime: number, objectives: EaObjective[]): EaCategory[] => [
  { categoryId: 5, name: 'Campaigns', groupsList: [{ groupId: 120, title: 'Squad Foundations', startTime: sec(NOW) - 100, endTime, awardsList: [], objectives }] },
];

test('keeps open objectives of active groups, with conditions and progress', () => {
  const g = openGroups(cats(sec(NOW) + 3600, [
    obj(1798, 'Score 6 goals using a Dutch player in any FUT game mode.', 'IN_PROGRESS'),
    obj(1797, 'Win 4 matches while having min. 1 Dutch player in your starting 11.', 'REDEEMED'),
    obj(1, 'Play 15 Draft matches.'),
  ]), NOW, names);
  assert.equal(g.length, 1);
  assert.equal(g[0].category, 'Campaigns');
  assert.equal(g[0].endsAt, (sec(NOW) + 3600) * 1000);
  assert.deepEqual(g[0].objectives.map((o) => o.id), [1798, 1]);
  assert.deepEqual(g[0].objectives[0].conditions, [{ role: 'score', min: 1, filter: { nation: [34] } }]);
  assert.equal(g[0].objectives[0].progress, 1);
  assert.equal(g[0].objectives[0].target, 6);
  assert.deepEqual(g[0].objectives[1].conditions, []);
});

test('drops ended groups, not-yet-started groups and groups with nothing open', () => {
  assert.deepEqual(openGroups(cats(sec(NOW) - 1, [obj(1, 'Play 1 match.')]), NOW, names), []);
  const future: EaCategory[] = [{ categoryId: 1, name: 'X', groupsList: [{ groupId: 1, title: 'T', startTime: sec(NOW) + 60, endTime: 0, awardsList: [], objectives: [obj(1, 'x')] }] }];
  assert.deepEqual(openGroups(future, NOW, names), []);
  assert.deepEqual(openGroups(cats(0, [obj(1, 'x', 'REDEEMED')]), NOW, names), []);
});

test('endTime 0 means no end', () => {
  const g = openGroups(cats(0, [obj(1, 'Play 1 match.')]), NOW, names);
  assert.equal(g[0].endsAt, null);
});

test('missing progress counts as 0', () => {
  const o = { ...obj(1, 'x'), currentProgress: undefined };
  assert.equal(openGroups(cats(0, [o]), NOW, names)[0].objectives[0].progress, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test server/objectives/open.test.ts`
Expected: FAIL, `Cannot find module './open.js'`.

- [ ] **Step 3: Implement `open.ts`**

```ts
// Which objectives the user can still work on, with the squad condition we read from each.
import { parseConditions } from './parse.js';
import type { EaCategory, Names, ObjectiveGroupView } from './types.js';

export function openGroups(categories: EaCategory[], now: number, names: Names): ObjectiveGroupView[] {
  const out: ObjectiveGroupView[] = [];
  for (const cat of categories)
    for (const g of cat.groupsList ?? []) {
      const started = g.startTime * 1000 <= now;
      const ended = g.endTime > 0 && g.endTime * 1000 <= now;
      if (!started || ended) continue;
      const objectives = (g.objectives ?? [])
        .filter((o) => o.state !== 'REDEEMED')
        .map((o) => ({
          id: o.objectiveId,
          name: o.name,
          description: o.description,
          progress: o.currentProgress ?? 0,
          target: o.multiplier,
          awards: o.awards ?? [],
          conditions: parseConditions(o.description, names),
        }));
      if (!objectives.length) continue;
      out.push({ id: g.groupId, title: g.title, category: cat.name, endsAt: g.endTime > 0 ? g.endTime * 1000 : null, awards: g.awardsList ?? [], objectives });
    }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test server/objectives/open.test.ts`
Expected: PASS.

- [ ] **Step 5: Relay and cache the payload**

In `server/events.ts`, extend `WATCHED_PATH` (line 28) by adding `|scmp\/objective\/categories\/all` inside the alternation, and export the path:

```ts
export const OBJECTIVES_PATH = '/scmp/objective/categories/all';
export const WATCHED_PATH =
  /^\/(purchased\/items|item(\/\d+)?|club|squad\/(list|active|\d+)|sbs\/sets|sbs\/hub\/v2|sbs\/setId\/\d+\/challenges|sbs\/challenge\/\d+(\/squad)?|chemistry\/profiles|storagepile|academy(\/[\w-]+)*|scmp\/objective\/categories\/all)$/;
```

In `applyLoadedData` (after the `/sbs/hub/v2` branch), add. The response is a top-level JSON array, so read `ev.response`, not `res`:

```ts
  if (method === 'GET' && ev.path === OBJECTIVES_PATH) {
    if (!Array.isArray(ev.response)) return null;
    await writeCache<{ categories: EaCategory[] }>(acc.key('objectives'), { categories: ev.response as EaCategory[] });
    return 'Objectives updated from the web app';
  }
```

Add `import type { EaCategory } from './objectives/types.js';` at the top.

In `onSquad`, accept and keep the formation (EA's squad response carries `formation`, e.g. `"f433"`):

```ts
async function onSquad(acc: Account, squadId: number | 'active', res: { id?: number; formation?: unknown; players?: { index: number; itemData?: { id?: number } }[] }) {
  // ... unchanged until writeCache ...
  await writeCache(acc.key('squad'), {
    squadId: squadId === 'active' ? res.id ?? known : squadId,
    starters: ids.filter((p) => p.index < 11).map((p) => p.id),
    bench: ids.filter((p) => p.index >= 11).map((p) => p.id),
    formation: typeof res.formation === 'string' ? res.formation : undefined,
  });
```

In `server/solver.ts:56`:

```ts
export interface ActiveSquad {
  starters: number[];
  bench: number[];
  formation?: string; // e.g. "f433", from the web app's active squad
}
```

- [ ] **Step 6: Extension 0.9.0**

`extension/hook.js:10`, add the same alternative to `WATCH`:

```js
  const WATCH = /^\/(purchased\/items|item(\/\d+)?|club|squad\/(list|active|\d+)|sbs\/sets|sbs\/hub\/v2|sbs\/setId\/\d+\/challenges|sbs\/challenge\/\d+(\/squad)?|chemistry\/profiles|storagepile|academy(\/[\w-]+)*|scmp\/objective\/categories\/all)$/;
```

`extension/manifest.json`: `"version": "0.9.0"`.

`extension/release.json`: add as the first key:

```json
  "0.9.0": [
    "Reads your Objectives when you open them in the web app, so FC Solver Premium can build a squad for them"
  ],
```

`docs/extension.md`: add `/scmp/objective/categories/all` to the list of relayed paths (search the file for `academy` to find the list).

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git pull --rebase
git add server/objectives/open.ts server/objectives/open.test.ts server/events.ts server/solver.ts extension/hook.js extension/manifest.json extension/release.json docs/extension.md
git commit -m "feat(objectives): relay and cache web app objectives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CP-SAT "play" mode

**Files:**
- Modify: `solver/cpsat.py` (`solve`: lines ~29-37 assignment, ~157-200 constraints, ~201-207 objective, ~230-238 return)
- Modify: `docs/solver.md` (new section "Play mode")
- Test: hand-run fixture `solver/fixtures/play-small.json` (create)

**Interfaces:**
- Consumes: the problem JSON already produced by `buildProblem` (`players[].rating/slots/groups/contrib/maxChem/asset`, `nSlots`, `thresholds`, `constraints`, `needsChem`), plus three new fields:
  - `"mode": "play"`
  - `"chemWeight": int` (points of objective per chemistry point)
  - constraint `{ "kind": "slotCount", "op": ">=", "value": n, "players": [i...], "slots": [s...] }`
- Produces: same answer shape as today (`status`, `slots`, `kept`, `cost`, `wallTime`); in play mode `cost` is the objective value (higher is better).

- [ ] **Step 1: Write the fixture**

`solver/fixtures/play-small.json`: 3-slot toy (GK slot 0, ST slot 1, CM slot 2); player 3 is a weak Dutch striker, player 2 a strong non-Dutch striker. A `slotCount` forces a Dutch player (index 3) into the ST slot.

```json
{
  "mode": "play",
  "chemWeight": 4,
  "nSlots": 3,
  "players": [
    {"rating": 80, "asset": 1, "slots": [0], "groups": {"1": 1, "2": 1, "3": 1}, "contrib": {"1": 1, "2": 1, "3": 1}, "maxChem": false},
    {"rating": 82, "asset": 2, "slots": [2], "groups": {"1": 1, "2": 1, "3": 1}, "contrib": {"1": 1, "2": 1, "3": 1}, "maxChem": false},
    {"rating": 90, "asset": 3, "slots": [1], "groups": {"1": 1, "2": 1, "3": 1}, "contrib": {"1": 1, "2": 1, "3": 1}, "maxChem": false},
    {"rating": 75, "asset": 4, "slots": [1], "groups": {"1": 34, "2": 10, "3": 9}, "contrib": {"1": 1, "2": 1, "3": 1}, "maxChem": false}
  ],
  "thresholds": {"1": [[2, 1], [5, 2], [8, 3]], "2": [[3, 1], [5, 2], [8, 3]], "3": [[2, 1], [4, 2], [7, 3]]},
  "needsChem": true,
  "rating": {},
  "constraints": [{"kind": "slotCount", "op": ">=", "value": 1, "players": [3], "slots": [1]}],
  "timeLimit": 5,
  "workers": 2
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `solver/.venv/bin/python solver/cpsat.py < solver/fixtures/play-small.json`
Expected: crash with `ValueError: unknown constraint slotCount`.

- [ ] **Step 3: Implement play mode**

In `solve(p)`, right after `m.Add(sum(used) == len(open_slots))`:

```python
    play = p.get("mode") == "play"
    if play:  # a playable squad: nobody out of position
        for i in idx:
            m.Add(off[i] == 0)
```

In the constraints loop, before the final `else: raise`:

```python
        elif kind == "slotCount":
            slots = set(c["slots"])
            m.Add(OPS[op](sum(x[i][s] for i in c["players"] for s in x[i] if s in slots), v))
```

Replace the objective block (`keep_bonus = ...` and `m.Minimize(...)`) with:

```python
    keep_bonus = 10_000_000
    if play:
        # strongest squad: ratings plus chemistry (0-3 per player) weighted by chemWeight
        w = int(p.get("chemWeight", 4))
        m.Maximize(
            sum(pl["rating"] * used[i] for i, pl in enumerate(players))
            + (w * (sum(ch) + sum(brick_ch)) if ch is not None else 0)
        )
    else:
        # Costs are floats; CP-SAT wants integers. Keeping a placed player outweighs any cost.
        m.Minimize(
            sum(int(round(pl["cost"] * 100)) * used[i] for i, pl in enumerate(players))
            - keep_bonus * sum(k for _s, k in keep.values())
        )
```

In the return dict, make `cost` mode-aware:

```python
        "cost": solver.ObjectiveValue() if play else (solver.ObjectiveValue() + keep_bonus * len(kept)) / 100,
```

Players in play mode carry no `cost` field; nothing else reads it.

- [ ] **Step 4: Run the fixture**

Run: `solver/.venv/bin/python solver/cpsat.py < solver/fixtures/play-small.json`
Expected: `"status": "OPTIMAL"`, `"slots": [0, 3, 1]` (the Dutch player 3 in ST slot 1, the 90 striker left out).

Then remove the `slotCount` constraint from a copy and check the 90 striker wins:

Run: `python3 -c "import json;p=json.load(open('solver/fixtures/play-small.json'));p['constraints']=[];print(json.dumps(p))" | solver/.venv/bin/python solver/cpsat.py`
Expected: `"slots": [0, 2, 1]`.

- [ ] **Step 5: Check SBC mode is unchanged**

Run: `npm test`
Expected: PASS. Then solve one real SBC in the running dev app (`npm run dev`, open any set, Solve) and confirm a squad comes back as before.

- [ ] **Step 6: Document**

Add to `docs/solver.md`, after "Search":

```markdown
## Play mode (objectives)

`"mode": "play"` builds the strongest playable squad instead of the cheapest SBC answer (`server/objectives/`). Out-of-position players are forbidden (`off = 0`). The objective is `maximise Σ rating·used + chemWeight · Σ chem` (chem 0-3 per player). Objective conditions arrive as `count` (somewhere in the XI) and `slotCount` (`Σ x[i][s] ≥ n` over matching players and the role's slots: scorer, creator or a named position). `cost` in the answer is the objective value.
```

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add solver/cpsat.py solver/fixtures/play-small.json docs/solver.md
git commit -m "feat(solver): play mode for strongest in-position squad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pure play-problem builder and checks

**Files:**
- Modify: `server/solver.ts` (extract `chemOf` from `buildProblem` into exported `playerChem`; export `runCpSat`)
- Create: `server/objectives/play.ts`
- Test: `server/objectives/play.test.ts`

**Interfaces:**
- Consumes: `Filter`, `Condition` (Task 1); `Player` from `server/squad.ts`; `POSITION_IDS` from `server/meta.ts`; `Meta`; `ActiveSquad` (Task 2); problem format (Task 3).
- Produces:
  - in `server/solver.ts`: `export function playerChem(p: Player, meta: Meta): { groups: Record<1|2|3, number>; contrib: Record<1|2|3, number>; maxChem: boolean }` and `export function runCpSat(problem: unknown): Promise<CpResult>` (also `export interface CpResult`)
  - `SCORE_TYPES: number[]`, `ASSIST_TYPES: number[]`
  - `matchesFilter(p: Player, f: Filter): boolean`
  - `roleSlots(c: Condition, slotTypes: number[]): number[]` (slot indexes; all slots for `xi`)
  - `playPool(players: Player[], o: { excludeIds: number[]; maxRating: number }): Player[]`
  - `buildPlayProblem(pool: Player[], slotTypes: number[], conds: Condition[], meta: Meta, timeLimit: number, chemWeight?: number): object`
  - `interface Cover { condition: Condition; itemIds: number[]; met: boolean }`
  - `checkCovers(slots: (Player | null)[], slotTypes: number[], conds: Condition[]): Cover[]`
  - `type PlayReason = { code: 'noMatch'; condition: Condition } | { code: 'combo' }`
  - `diagnosePlay(pool: Player[], slotTypes: number[], conds: Condition[]): PlayReason[]`

- [ ] **Step 1: Extract `playerChem` and export `runCpSat`**

In `server/solver.ts`, move the `chemOf` closure out of `buildProblem` into a top-level exported function and call it from `buildProblem` as `playerChem(p, meta)` (keeping `groupOf` inside it):

```ts
/** A player's chemistry groups and per-group contribution, as the CP-SAT model wants them. */
export function playerChem(p: Player, meta: Meta) {
  const groupOf = (param: ParamId) => (param === CLUB ? normClub(meta, p.club) : param === LEAGUE ? p.league : p.nation);
  const prof = profileFor(p, meta);
  const contrib = (param: ParamId) => {
    if (param === CLUB && RESTRICTED_CLUBS.has(p.club)) return 0;
    if (param === LEAGUE && p.league === LEGENDS_LEAGUE_ID) return 0;
    return prof.rules[param]?.value ?? 0;
  };
  return {
    groups: { 1: groupOf(NATION), 2: groupOf(LEAGUE), 3: groupOf(CLUB) },
    contrib: { 1: contrib(NATION), 2: contrib(LEAGUE), 3: contrib(CLUB) },
    maxChem: prof.maxChem || isLegend(p) || isHero(p),
  };
}
```

Inside `buildProblem`, replace the two uses: `...chemOf(p)` → `...playerChem(p, meta)` and `...chemOf(bp)` → `...playerChem(bp, meta)`; delete the old closure and `groupOf`. Add `export` to `interface CpResult` and `function runCpSat`.

Run: `npm test && npm run typecheck`
Expected: PASS (pure refactor).

- [ ] **Step 2: Write the failing tests**

`server/objectives/play.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, roleSlots, playPool, checkCovers, diagnosePlay, buildPlayProblem } from './play.js';
import type { Player } from '../squad.js';
import type { Condition } from './types.js';
import { POSITION_IDS } from '../meta.js';

let n = 1;
const pl = (p: Partial<Player> = {}): Player => ({
  id: n++, assetId: n * 10, resourceId: n * 10, name: `P${n}`, rating: 80, points: 0, rareflag: 1, tier: 3,
  positions: [POSITION_IDS.ST], preferredPosition: 'ST', possiblePositions: ['ST'], club: 1, league: 13, nation: 14,
  untradeable: true, firstOwner: true, groups: [], state: 'free', isLoan: false, minPrice: 0, fullName: 'P', rarityName: 'Rare',
  attributes: [80, 80, 80, 80, 40, 70], skillMoves: 3, weakFoot: 3, foot: 'Right', ...p,
});
// 4-3-3 slot types as meta has them: GK RB RCB LCB LB RCM CM LCM RW ST LW
const F433 = [0, 3, 5, 5, 7, 14, 14, 14, 23, 25, 27];
const c = (role: Condition['role'], filter: Condition['filter'], min = 1): Condition => ({ role, filter, min });

test('matchesFilter: nation, league, rarity, positions, attributes', () => {
  const dutchSt = pl({ nation: 34 });
  assert.ok(matchesFilter(dutchSt, { nation: [34] }));
  assert.ok(!matchesFilter(dutchSt, { nation: [18] }));
  assert.ok(matchesFilter(pl({ rareflag: 151 }), { rarity: [151] }));
  const cmCam = pl({ preferredPosition: 'CM', possiblePositions: ['CM', 'CAM'] });
  assert.ok(matchesFilter(cmCam, { position: 'CAM' }));
  assert.ok(!matchesFilter(cmCam, { position: 'CAM', preferredOnly: true }));
  assert.ok(matchesFilter(pl({ attributes: [86, 0, 0, 0, 0, 0] }), { attr: { stat: 'PAC', min: 85 } }));
  assert.ok(!matchesFilter(pl({ attributes: [84, 0, 0, 0, 0, 0] }), { attr: { stat: 'PAC', min: 85 } }));
});

test('a goalkeeper never matches an attribute condition', () => {
  const gk = pl({ preferredPosition: 'GK', possiblePositions: ['GK'], attributes: [90, 90, 90, 90, 90, 90] });
  assert.ok(!matchesFilter(gk, { attr: { stat: 'PAC', min: 85 } }));
});

test('roleSlots: score, assist, named position, xi', () => {
  assert.deepEqual(roleSlots(c('score', {}), F433), [8, 9, 10]);
  assert.deepEqual(roleSlots(c('assist', {}), F433), [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(roleSlots(c('assist', { position: 'ST' }), F433), [9]);
  assert.deepEqual(roleSlots(c('score', { position: 'CAM' }), F433), []);
  assert.deepEqual(roleSlots(c('xi', {}), F433), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('playPool keeps loans, drops storage, exclusions and players over max OVR', () => {
  const loan = pl({ isLoan: true });
  const stored = pl({ inStorage: true });
  const excluded = pl();
  const tooGood = pl({ rating: 95 });
  const ok = pl();
  const pool = playPool([loan, stored, excluded, tooGood, ok], { excludeIds: [excluded.id], maxRating: 90 });
  assert.deepEqual(pool.map((p) => p.id), [loan.id, ok.id]);
});

test('checkCovers: met only when enough matching players sit in the role slots', () => {
  const slots: (Player | null)[] = F433.map(() => pl({ nation: 14 }));
  const dutchCb = pl({ nation: 34, positions: [POSITION_IDS.CB], preferredPosition: 'CB', possiblePositions: ['CB'] });
  const conds = [c('score', { nation: [34] }), c('xi', { nation: [34] }, 2)];
  slots[2] = dutchCb; // a Dutch CB in a CB slot: counts for the XI, but is not a scorer
  let r = checkCovers(slots, F433, conds);
  assert.deepEqual(r.map((x) => x.met), [false, false]);
  slots[9] = pl({ nation: 34 }); // a Dutch ST
  r = checkCovers(slots, F433, conds);
  assert.deepEqual(r.map((x) => x.met), [true, true]);
  assert.deepEqual(r[0].itemIds, [slots[9]!.id]);
});

test('diagnosePlay: names a condition nobody in the pool can meet, else combo', () => {
  const pool = [pl({ nation: 14 }), pl({ nation: 14 })];
  const missing = c('score', { nation: [34] });
  assert.deepEqual(diagnosePlay(pool, F433, [missing]), [{ code: 'noMatch', condition: missing }]);
  const cbOnly = pl({ nation: 34, positions: [POSITION_IDS.CB], preferredPosition: 'CB', possiblePositions: ['CB'] });
  // a Dutch player exists but only as a CB: nobody can score -> noMatch too
  assert.deepEqual(diagnosePlay([cbOnly], F433, [missing]), [{ code: 'noMatch', condition: missing }]);
  const dutchSt = pl({ nation: 34 });
  assert.deepEqual(diagnosePlay([dutchSt], F433, [missing]), [{ code: 'combo' }]);
});

test('buildPlayProblem: count for xi, slotCount for roles, play mode, no cost', () => {
  const meta = { formations: {}, names: {}, thresholds: { 1: [], 2: [], 3: [] } } as never;
  const dutch = pl({ nation: 34 });
  const other = pl();
  const prob = buildPlayProblem([other, dutch], F433, [c('xi', { nation: [34] }), c('score', { nation: [34] })], meta, 10, (p) => ({
    groups: { 1: p.nation, 2: p.league, 3: p.club }, contrib: { 1: 1, 2: 1, 3: 1 }, maxChem: false,
  })) as { mode: string; constraints: unknown[]; players: { slots: number[] }[]; needsChem: boolean };
  assert.equal(prob.mode, 'play');
  assert.equal(prob.needsChem, true);
  assert.deepEqual(prob.constraints, [
    { kind: 'count', op: '>=', value: 1, players: [1] },
    { kind: 'slotCount', op: '>=', value: 1, players: [1], slots: [8, 9, 10] },
  ]);
  assert.deepEqual(prob.players[0].slots, [9]); // a ST fits only the ST slot of 4-3-3
});
```

Note: `buildPlayProblem` takes an optional last parameter `chem` (defaults to `playerChem`) so the test does not need a real `Meta`. Signature: `buildPlayProblem(pool, slotTypes, conds, meta, timeLimit, chem = (p: Player) => playerChem(p, meta), chemWeight = CHEM_WEIGHT)`.

- [ ] **Step 3: Run to verify it fails**

Run: `node --import tsx --test server/objectives/play.test.ts`
Expected: FAIL, `Cannot find module './play.js'`.

- [ ] **Step 4: Implement `play.ts`**

```ts
// Objective conditions -> the CP-SAT "play" problem, and the checks we trust instead of the solver.
import { NATION, LEAGUE, CLUB, POSITION_IDS, type Meta, type ParamId } from '../meta.js';
import type { Player } from '../squad.js';
import { playerChem } from '../solver.js';
import type { Condition, Filter, Stat } from './types.js';

/** One chemistry point is worth this many rating points in the play objective (tuned on real clubs). */
export const CHEM_WEIGHT = 4;

const T = POSITION_IDS;
/** Slots where a player scores: strikers, forwards, wingers, CAM. */
export const SCORE_TYPES = [T.ST, T.CF, T.LF, T.RF, T.LW, T.RW, T.CAM];
/** Slots where a player creates: the scorers plus wide and central midfielders. */
export const ASSIST_TYPES = [...SCORE_TYPES, T.LM, T.RM, T.CM];
const STAT_INDEX: Record<Stat, number> = { PAC: 0, SHO: 1, PAS: 2, DRI: 3, DEF: 4, PHY: 5 };

export function matchesFilter(p: Player, f: Filter): boolean {
  if (f.nation && !f.nation.includes(p.nation)) return false;
  if (f.league && !f.league.includes(p.league)) return false;
  if (f.club && !f.club.includes(p.club)) return false;
  if (f.rarity && !f.rarity.includes(p.rareflag)) return false;
  if (f.position && (f.preferredOnly ? p.preferredPosition !== f.position : !p.possiblePositions.includes(f.position))) return false;
  if (f.attr) {
    if (p.preferredPosition === 'GK') return false; // GK attributes are DIV/HAN/KIC/REF/SPE/POS
    if ((p.attributes[STAT_INDEX[f.attr.stat]] ?? 0) < f.attr.min) return false;
  }
  return true;
}

/** Slot indexes of the formation where this condition's player has to stand. */
export function roleSlots(c: Condition, slotTypes: number[]): number[] {
  const types =
    c.filter.position !== undefined ? [T[c.filter.position]] : c.role === 'score' ? SCORE_TYPES : c.role === 'assist' ? ASSIST_TYPES : null;
  return slotTypes.flatMap((t, s) => (types === null || types.includes(t) ? [s] : []));
}

/** The club as a playing squad sees it: storage is out, loans are in, the user's exclusions apply. */
export function playPool(players: Player[], o: { excludeIds: number[]; maxRating: number }): Player[] {
  const excluded = new Set(o.excludeIds);
  return players.filter((p) => !p.inStorage && !excluded.has(p.id) && p.rating <= o.maxRating);
}

type Chem = ReturnType<typeof playerChem>;

export function buildPlayProblem(
  pool: Player[], slotTypes: number[], conds: Condition[], meta: Meta, timeLimit: number,
  chem: (p: Player) => Chem = (p) => playerChem(p, meta), chemWeight = CHEM_WEIGHT,
) {
  const matching = (f: Filter) => pool.flatMap((p, i) => (matchesFilter(p, f) ? [i] : []));
  const constraints = conds.map((c) =>
    c.role === 'xi' && c.filter.position === undefined
      ? { kind: 'count', op: '>=', value: c.min, players: matching(c.filter) }
      : { kind: 'slotCount', op: '>=', value: c.min, players: matching(c.filter), slots: roleSlots(c, slotTypes) },
  );
  return {
    mode: 'play',
    chemWeight,
    players: pool.map((p) => ({
      rating: p.rating,
      asset: p.assetId,
      slots: slotTypes.flatMap((t, s) => (p.positions.includes(t) ? [s] : [])),
      fixed: null,
      ...chem(p),
    })),
    nSlots: slotTypes.length,
    blocked: [],
    bricks: [],
    thresholds: Object.fromEntries(
      ([NATION, LEAGUE, CLUB] as ParamId[]).map((param) => [param, (meta.thresholds[param] ?? []).map((t) => [t.requirement, t.points])]),
    ),
    rating: {},
    needsChem: true,
    constraints,
    timeLimit,
    workers: 8,
  };
}

export interface Cover {
  condition: Condition;
  itemIds: number[]; // players in the squad that satisfy it
  met: boolean;
}

/** The squad re-checked against every condition (in-position players in the role's slots). */
export function checkCovers(slots: (Player | null)[], slotTypes: number[], conds: Condition[]): Cover[] {
  return conds.map((c) => {
    const allowed = new Set(roleSlots(c, slotTypes));
    const itemIds = slots.flatMap((p, s) =>
      p && allowed.has(s) && p.positions.includes(slotTypes[s]) && matchesFilter(p, c.filter) ? [p.id] : [],
    );
    return { condition: c, itemIds, met: itemIds.length >= c.min };
  });
}

export type PlayReason = { code: 'noMatch'; condition: Condition } | { code: 'combo' };

/** Why there is no squad: a condition nobody can meet in its slots, else the conditions clash. */
export function diagnosePlay(pool: Player[], slotTypes: number[], conds: Condition[]): PlayReason[] {
  const missing = conds.filter((c) => {
    const slots = roleSlots(c, slotTypes);
    const fits = pool.filter((p) => matchesFilter(p, c.filter) && slots.some((s) => p.positions.includes(slotTypes[s])));
    return new Set(fits.map((p) => p.assetId)).size < c.min;
  });
  return missing.length ? missing.map((condition) => ({ code: 'noMatch' as const, condition })) : [{ code: 'combo' }];
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --import tsx --test server/objectives/play.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add server/solver.ts server/objectives/play.ts server/objectives/play.test.ts
git commit -m "feat(objectives): play problem builder and cover checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Solve, endpoints and docs

**Files:**
- Create: `server/objectives/solve.ts`
- Modify: `server/index.ts` (two routes after `/api/gallery`, ~line 545)
- Modify: `docs/api.md` (new "Objectives" section after Gallery)

**Interfaces:**
- Consumes: `playPool`, `buildPlayProblem`, `checkCovers`, `diagnosePlay`, `Cover`, `PlayReason` (Task 4); `runCpSat`, `ActiveSquad` (Tasks 2/4); `evaluate`, `SquadEval`, `Player` (`server/squad.ts`); `openGroups` (Task 2); `clubPlayers`, `siteContext`, `planFor`, `metaFor`, `readCache`, `logEvent`, `SessionError` (existing in `server/index.ts`).
- Produces:
  - `solveObjectives(players: Player[], formation: string, conds: Condition[], meta: Meta, options: { excludeIds: number[]; maxRating: number }, timeLimit?: number): Promise<{ found: boolean; slots: (Player | null)[]; eval: SquadEval | null; covers: Cover[]; reasons: PlayReason[]; status: string }>`
  - `GET /api/objectives` → `{ fetchedAt: number | null; formation: string | null; groups: ObjectiveGroupView[] }`
  - `POST /api/objectives/solve` body `{ objectiveIds: number[]; formation: string; options?: { excludeIds?: number[]; maxRating?: number } }` → `{ found, ms, formation, slots: { position, player, chem }[], eval, covers: { objectiveId, condition, itemIds, met }[], reasons }`

- [ ] **Step 1: Implement `solve.ts`**

```ts
// Objectives -> the strongest playable squad. found comes from our own re-check, never from CP-SAT.
import type { Meta } from '../meta.js';
import { evaluate, type Player, type SquadEval } from '../squad.js';
import { runCpSat } from '../solver.js';
import { buildPlayProblem, checkCovers, diagnosePlay, playPool, type Cover, type PlayReason } from './play.js';
import type { Condition } from './types.js';

export async function solveObjectives(
  players: Player[], formation: string, conds: Condition[], meta: Meta,
  options: { excludeIds: number[]; maxRating: number }, timeLimit = 10,
): Promise<{ found: boolean; slots: (Player | null)[]; eval: SquadEval | null; covers: Cover[]; reasons: PlayReason[]; status: string }> {
  const slotTypes = meta.formations[formation]?.map((s) => s.typeId);
  if (!slotTypes) throw new Error(`Unknown formation ${formation}`);
  const pool = playPool(players, options);
  const empty = slotTypes.map(() => null);
  const problem = buildPlayProblem(pool, slotTypes, conds, meta, timeLimit);
  if (process.env.SOLVER_DUMP) (await import('node:fs')).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  if (!res.slots) return { found: false, slots: empty, eval: null, covers: checkCovers(empty, slotTypes, conds), reasons: diagnosePlay(pool, slotTypes, conds), status: res.status };
  const slots = res.slots.map((i) => (i === null ? null : pool[i]));
  const covers = checkCovers(slots, slotTypes, conds);
  const found = slots.every((p) => p !== null) && covers.every((c) => c.met);
  return { found, slots, eval: evaluate(slots, slotTypes, [], 'AND', meta, []), covers, reasons: found ? [] : [{ code: 'combo' }], status: res.status };
}
```

- [ ] **Step 2: Add the routes**

In `server/index.ts`, after the `/api/gallery` route, add (reuse the existing imports; add `openGroups`, `solveObjectives`, `EaCategory`, `Condition`):

```ts
// Objectives (Premium): the web app's objectives with the squad condition read from each
async function objectiveGroups(acc: Account, meta: Meta) {
  const cached = await readCache<{ categories: EaCategory[] }>(acc.key('objectives'));
  const groups = cached ? openGroups(cached.data.categories, Date.now(), meta.names) : [];
  return { fetchedAt: cached?.fetchedAt ?? null, groups };
}

app.get('/api/objectives', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
  const meta = await metaFor(acc);
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return { ...(await objectiveGroups(acc, meta)), formation: squad?.formation ?? null };
});

app.post<{ Body: { objectiveIds?: unknown; formation?: unknown; options?: { excludeIds?: unknown; maxRating?: unknown } } }>(
  '/api/objectives/solve',
  async (req, reply) => {
    const { userId, acc } = await siteContext(req);
    if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
    const meta = await metaFor(acc);
    const ids = Array.isArray(req.body?.objectiveIds) ? req.body.objectiveIds.filter((x): x is number => Number.isInteger(x)) : [];
    const formation = typeof req.body?.formation === 'string' ? req.body.formation : '';
    if (!meta.formations[formation]) return reply.code(400).send({ error: 'unknown formation', code: 'badFormation', params: {} });
    const { groups } = await objectiveGroups(acc, meta);
    const picked = groups.flatMap((g) => g.objectives).filter((o) => ids.includes(o.id) && o.conditions.length > 0);
    if (picked.length === 0) return reply.code(400).send({ error: 'pick at least one objective with a squad condition', code: 'noObjectives', params: {} });
    const { players } = await clubPlayers(acc);
    if (players.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)', code: 'clubEmpty', params: {} });
    const o = req.body?.options ?? {};
    const options = {
      excludeIds: Array.isArray(o.excludeIds) ? o.excludeIds.filter((x): x is number => Number.isInteger(x)) : [],
      maxRating: typeof o.maxRating === 'number' ? o.maxRating : 99,
    };
    const conds: { objectiveId: number; condition: Condition }[] = picked.flatMap((ob) => ob.conditions.map((condition) => ({ objectiveId: ob.id, condition })));
    const t0 = Date.now();
    const r = await solveObjectives(players, formation, conds.map((c) => c.condition), meta, options);
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { kind: 'objectives', found: r.found, objectives: picked.length } });
    const slotsMeta = meta.formations[formation];
    return {
      found: r.found,
      ms: Date.now() - t0,
      formation,
      slots: slotsMeta.map((position, i) => ({ position, player: r.slots[i], chem: r.eval?.perSlotChem[i] ?? 0 })),
      eval: r.eval,
      covers: r.covers.map((c, i) => ({ objectiveId: conds[i].objectiveId, condition: c.condition, itemIds: c.itemIds, met: c.met })),
      reasons: r.reasons,
    };
  },
);
```

If `logEvent`'s `data` type is a strict union in `server/db/events.ts`, extend it with `{ kind: 'objectives'; found: boolean; objectives: number }`.

- [ ] **Step 3: Document**

Add to `docs/api.md` after the Gallery section:

```markdown
### `GET /api/objectives` (site, Premium)

The objectives the web app last loaded (`GET /scmp/objective/categories/all`, relayed by extension 0.9.0+; no EA call), active groups only, objectives not yet redeemed: `{ "fetchedAt": 1791000000000 | null, "formation": "f433" | null, "groups": [{ "id": 120, "title": "Squad Foundations: Ringo Meerveld", "category": "Campaigns", "endsAt": 1791565199000 | null, "awards": [...], "objectives": [{ "id": 1798, "name": "The Dutch", "description": "Score 6 goals using a Dutch player in any FUT game mode.", "progress": 3, "target": 6, "awards": [...], "conditions": [{ "role": "score", "min": 1, "filter": { "nation": [34] } }] }] }] }`. `conditions` is empty when the text has no squad condition we can read. `formation`: the active squad's, if the web app loaded it. Free: `403 premiumOnly`.

### `POST /api/objectives/solve` (site, Premium)

`{ "objectiveIds": [1798, 1797], "formation": "f433", "options": { "excludeIds": [], "maxRating": 99 } }` → the strongest in-position squad from the club (no storage, loans in) that covers every condition of the picked objectives: `{ "found": true, "ms": 2100, "formation": "f433", "slots": [{ "position": {...}, "player": {...} | null, "chem": 3 }], "eval": { "rating": 84, "chemistry": 31, ... }, "covers": [{ "objectiveId": 1798, "condition": {...}, "itemIds": [123], "met": true }], "reasons": [] }`. Not found: `reasons` is `[{ "code": "noMatch", "condition": {...} }]` (nobody in the club can meet it in its slots) or `[{ "code": "combo" }]` (each works alone, not together in this formation). Errors: `400 badFormation`, `400 noObjectives`, `409 clubEmpty`, `403 premiumOnly`. Logged as a `solve` event with `kind: "objectives"`; no quota.
```

- [ ] **Step 4: Verify against real data**

Run (dev server must be running, `npm run dev`): open the FC27 web app in the browser with the extension loaded (built from this branch), open Objectives once, then:

```bash
ls data/accounts/*/ | grep -i objectives
```

Expected: an `objectives` cache file for the account. Then in the browser devtools on the FC Solver tab:

```js
await (await fetch('/api/objectives', { headers: { Authorization: 'Bearer ' + await window.Clerk.session.getToken(), 'X-Persona': localStorage.getItem('sbc-active') } })).json()
```

Expected: groups with the "Squad Foundations: Ringo Meerveld" objectives carrying parsed conditions. (If the `localStorage` key for the active persona differs, read it from `web/src/App.tsx` `ACTIVE`.)

Then POST a solve for two of them with `formation: 'f4231'` and check `found: true`, a full XI, and `covers[].met` all true. Dump the problem with `SOLVER_DUMP=/tmp/p.json` to inspect if not.

- [ ] **Step 5: Tune `CHEM_WEIGHT`**

On the real club, solve the same pick with `CHEM_WEIGHT` 2, 4 and 6 (edit `server/objectives/play.ts`, the dev server reloads). Pick the value where the squad stays ≥ 30 chemistry without dropping obvious 85+ players for 75s. Keep 4 unless another value is clearly better; note the choice in the constant's comment.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck
git pull --rebase
git add server/objectives/solve.ts server/index.ts docs/api.md server/objectives/play.ts
git commit -m "feat(objectives): solve endpoint for objective squads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Objectives screen

**Files:**
- Modify: `web/src/api.ts` (types + two calls next to `gallery:` at ~line 348)
- Modify: `web/src/route.ts` (view `objectives`, path `/dashboard/objectives`)
- Create: `web/src/components/objectives/objectives.ts`
- Test: `web/src/components/objectives/objectives.test.ts`
- Create: `web/src/components/objectives/ObjectivesView.tsx`
- Modify: `web/src/App.tsx` (nav item after Gallery ~line 816; view mount next to the Gallery block ~line 910; title map ~line 383)
- Modify: `web/src/styles.css`
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts`

**Interfaces:**
- Consumes: `GET /api/objectives`, `POST /api/objectives/solve` (Task 5); existing `Pitch` (`web/src/components/Pitch.tsx`, props at line 129), `PremiumPreview`, `useI18n`, `readLocal`/`writeLocal` helpers used in `App.tsx`, `Meta` from `web/src/api.ts`.
- Produces:
  - `api.objectives(): Promise<ObjectivesResponse>`, `api.solveObjectives(body): Promise<ObjectivesSolve>`
  - types `Condition`, `ObjectiveView`, `ObjectiveGroupView`, `ObjectivesResponse`, `ObjectivesSolve` in `web/src/api.ts` (same shapes as the server)
  - route `{ view: 'objectives' }`
  - `conditionLabel(c: Condition, meta: Meta, t: TFn): string`, `pickKey(personaId: number): string`, `resultKey(personaId: number): string`, `timeLeft(endsAt: number | null, now: number): { days: number; hours: number } | null` in `objectives.ts`

- [ ] **Step 1: API types and calls**

In `web/src/api.ts`:

```ts
export type Role = 'xi' | 'score' | 'assist';
export interface ObjFilter { nation?: number[]; league?: number[]; club?: number[]; rarity?: number[]; position?: string; preferredOnly?: boolean; attr?: { stat: 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY'; min: number } }
export interface ObjCondition { filter: ObjFilter; role: Role; min: number }
export interface ObjAward { value: number; awardType: string; untradeable?: boolean; itemDataReduced?: { description?: string; itemType?: string; rating?: number } | null }
export interface ObjectiveView { id: number; name: string; description: string; progress: number; target: number; awards: ObjAward[]; conditions: ObjCondition[] }
export interface ObjectiveGroupView { id: number; title: string; category: string; endsAt: number | null; awards: ObjAward[]; objectives: ObjectiveView[] }
export interface ObjectivesResponse { fetchedAt: number | null; formation: string | null; groups: ObjectiveGroupView[] }
export interface ObjectivesSolve {
  found: boolean; ms: number; formation: string;
  slots: SlotResult[];
  eval: { rating: number; chemistry: number; perSlotChem: number[]; results: []; allMet: boolean } | null;
  covers: { objectiveId: number; condition: ObjCondition; itemIds: number[]; met: boolean }[];
  reasons: ({ code: 'noMatch'; condition: ObjCondition } | { code: 'combo' })[];
}
```

and next to `gallery:`:

```ts
  objectives: () => req<ObjectivesResponse>('/api/objectives'),
  solveObjectives: (b: { objectiveIds: number[]; formation: string; options?: { excludeIds?: number[]; maxRating?: number } }) =>
    req<ObjectivesSolve>('/api/objectives/solve', { method: 'POST', body: b }),
```

- [ ] **Step 2: Route**

In `web/src/route.ts`: add `| { view: 'objectives' }` to the route union (~line 27), parse `x === 'objectives'` → `{ view: 'objectives' }` (next to the gallery parse at ~line 68), and in the path builder add `case 'objectives': return '/dashboard/objectives';` (next to `case 'gallery':` ~line 107). Add `/dashboard/objectives` to the header comment list at the top. If `route.test.ts` exists, add a round-trip case like the gallery one.

- [ ] **Step 3: Write failing helper tests**

`web/src/components/objectives/objectives.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionLabel, timeLeft, pickKey, resultKey } from './objectives.js';

const meta = { names: { nation: { 34: 'Netherlands' }, league: { 10: 'Eredivisie' }, club: {}, rarity: { 151: 'Ultimate Scream' } } } as never;
const t = (k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ''}`;

test('conditionLabel names role and filter with EA names', () => {
  assert.equal(conditionLabel({ role: 'score', min: 1, filter: { nation: [34] } }, meta, t), 'obj.role.score{"what":"Netherlands"}');
  assert.equal(conditionLabel({ role: 'xi', min: 2, filter: { league: [10] } }, meta, t), 'obj.role.xi{"what":"Eredivisie","count":2}');
  assert.equal(conditionLabel({ role: 'assist', min: 1, filter: { position: 'CAM', preferredOnly: true } }, meta, t),
    'obj.role.assist{"what":"CAM (obj.preferredOnly)"}');
  assert.equal(conditionLabel({ role: 'score', min: 1, filter: { attr: { stat: 'PAC', min: 85 } } }, meta, t), 'obj.role.score{"what":"85+ PAC"}');
});

test('timeLeft in days and hours, null without an end or when over', () => {
  assert.deepEqual(timeLeft(1_000 + (33 * 3600 + 120) * 1000, 1_000), { days: 1, hours: 9 });
  assert.equal(timeLeft(null, 0), null);
  assert.equal(timeLeft(10, 20), null);
});

test('storage keys are per persona and keep the sbc- prefix', () => {
  assert.equal(pickKey(7), 'sbc-objectives-pick-7');
  assert.equal(resultKey(7), 'sbc-objectives-result-7');
});
```

Run: `node --import tsx --test web/src/components/objectives/objectives.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the helpers**

`web/src/components/objectives/objectives.ts`:

```ts
// Pure helpers for the Objectives screen.
import type { Meta, ObjCondition } from '../../api';

type TFn = (key: string, params?: Record<string, unknown>) => string;

/** "Score with Netherlands", "Starting 11: 2 × Eredivisie" ... (names as EA sends them). */
export function conditionLabel(c: ObjCondition, meta: Meta, t: TFn): string {
  const f = c.filter;
  const name = (kind: 'nation' | 'league' | 'club' | 'rarity', ids?: number[]) =>
    ids?.map((id) => meta.names[kind][id] ?? `#${id}`).join(' / ');
  const what =
    name('nation', f.nation) ?? name('league', f.league) ?? name('club', f.club) ?? name('rarity', f.rarity) ??
    (f.position ? (f.preferredOnly ? `${f.position} (${t('obj.preferredOnly')})` : f.position) : undefined) ??
    (f.attr ? `${f.attr.min}+ ${f.attr.stat}` : '');
  return c.min > 1 ? t(`obj.role.${c.role}`, { what, count: c.min }) : t(`obj.role.${c.role}`, { what });
}

export function timeLeft(endsAt: number | null, now: number): { days: number; hours: number } | null {
  if (endsAt === null || endsAt <= now) return null;
  const h = Math.floor((endsAt - now) / 3_600_000);
  return { days: Math.floor(h / 24), hours: h % 24 };
}

export const pickKey = (personaId: number) => `sbc-objectives-pick-${personaId}`;
export const resultKey = (personaId: number) => `sbc-objectives-result-${personaId}`;
```

Adjust the `Meta` import name to whatever `web/src/api.ts` exports for `/api/meta` (`names` with `nation/league/club/rarity`). Note: the xi label must include the count when `min > 1`; the en key uses `{count}` only in its `_other` form (see Step 6).

Run: `node --import tsx --test web/src/components/objectives/objectives.test.ts`
Expected: PASS.

- [ ] **Step 5: The view**

`web/src/components/objectives/ObjectivesView.tsx` (props come from `App.tsx`):

```tsx
import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Square, SoccerBall, HandPointing, UsersThree, Warning, ArrowsClockwise } from '@phosphor-icons/react';
import { api, ApiError, type Meta, type ObjectivesResponse, type ObjectivesSolve, type ObjCondition } from '../../api';
import { useI18n } from '../../i18n';
import { conditionLabel, timeLeft, pickKey, resultKey } from './objectives';
import { Pitch } from '../Pitch';

const ROLE_ICON = { score: SoccerBall, assist: HandPointing, xi: UsersThree } as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private window: the pick just isn't remembered */
  }
}

export function ObjectivesView({ meta, personaId, extVersionOk, excludeIds, maxRating, onError }: {
  meta: Meta; personaId: number; extVersionOk: boolean; excludeIds: number[]; maxRating: number; onError: (e: unknown) => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<ObjectivesResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<number[]>(() => readJson(pickKey(personaId), []));
  const [formation, setFormation] = useState<string>('');
  const [result, setResult] = useState<ObjectivesSolve | null>(() => readJson(resultKey(personaId), null));
  const [solving, setSolving] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    api.objectives().then(
      (d) => {
        if (!alive) return;
        setData(d);
        setFormation((f) => f || d.formation || 'f433');
      },
      (e) => alive && setLoadError(e),
    );
    return () => {
      alive = false;
    };
  }, [personaId, tries]);

  useEffect(() => writeJson(pickKey(personaId), picked), [personaId, picked]);

  const open = useMemo(() => new Set(data?.groups.flatMap((g) => g.objectives.filter((o) => o.conditions.length).map((o) => o.id)) ?? []), [data]);
  const active = picked.filter((id) => open.has(id)); // a ticked objective that has since been done drops out

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const solve = async () => {
    setSolving(true);
    try {
      const r = await api.solveObjectives({ objectiveIds: active, formation, options: { excludeIds, maxRating } });
      setResult(r);
      writeJson(resultKey(personaId), r);
    } catch (e) {
      onError(e);
    } finally {
      setSolving(false);
    }
  };

  if (loadError) return (
    <div className="gallery-error" role="alert">
      <p className="muted">{loadError instanceof ApiError ? t(`err.${loadError.code}`) : t('err.generic')}</p>
      <button type="button" className="ghost" onClick={() => setTries((n) => n + 1)}>
        <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('auth.retry')}
      </button>
    </div>
  );
  if (!data) return <p className="muted" role="status">{t('admin.loading')}</p>;

  const pill = (c: ObjCondition, k: number) => {
    const Icon = ROLE_ICON[c.role];
    return (
      <li key={k} className="obj-pill">
        <Icon weight="bold" aria-hidden="true" /> {conditionLabel(c, meta, t)}
      </li>
    );
  };

  return (
    <section className="objectives-view">
      <header className="page-head">
        <div>
          <h1>{t('obj.title')}</h1>
          <p className="muted">
            {data.fetchedAt ? t('obj.fetched', { minutes: Math.max(1, Math.round((now - data.fetchedAt) / 60000)) }) : null}
          </p>
        </div>
      </header>

      {!data.fetchedAt ? (
        <div className="obj-empty">
          <Warning weight="bold" aria-hidden="true" />
          <p>{extVersionOk ? t('obj.emptyOpenWebApp') : t('obj.emptyUpdateExtension')}</p>
        </div>
      ) : (
        <div className="obj-groups">
          {data.groups.map((g) => {
            const left = timeLeft(g.endsAt, now);
            return (
              <article key={g.id} className="obj-group">
                <header>
                  <h2>{g.title}</h2>
                  <p className="muted">
                    {g.category}
                    {left ? ` · ${t('obj.timeLeft', { days: left.days, hours: left.hours })}` : ''}
                  </p>
                </header>
                <ul className="obj-list">
                  {g.objectives.map((o) => {
                    const can = o.conditions.length > 0;
                    const on = active.includes(o.id);
                    return (
                      <li key={o.id} className={`obj-item${can ? '' : ' is-dim'}`}>
                        <button type="button" className="obj-check" role="checkbox" aria-checked={on} disabled={!can} onClick={() => toggle(o.id)}>
                          {on ? <CheckSquare weight="fill" aria-hidden="true" /> : <Square weight="bold" aria-hidden="true" />}
                          <span className="obj-name">{o.name}</span>
                          <span className="obj-progress">{o.progress}/{o.target}</span>
                        </button>
                        <p className="obj-desc">{o.description}</p>
                        {can ? <ul className="obj-pills">{o.conditions.map(pill)}</ul> : <p className="muted obj-none">{t('obj.noCondition')}</p>}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}

      {result && (
        <div className="obj-result">
          <Pitch
            meta={meta}
            challenge={{ formation: result.formation, requirements: [] } as never}
            result={{ found: result.found, ms: result.ms, eval: { ...(result.eval ?? { rating: 0, chemistry: 0 }), results: [], allMet: result.found }, slots: result.slots } as never}
            solving={solving}
            onSolve={() => void solve()}
            onToggleOptions={() => {}}
            lock={null}
            localOptions={false}
            placed={new Map()}
            selectedId={null}
            onPlayerClick={() => {}}
            outOfSolves={false}
            marked={new Set()}
          />
          <ul className="obj-covers">
            {result.covers.map((c, i) => {
              const ids = new Set(c.itemIds);
              const who = result.slots.filter((s) => s.player && ids.has(s.player.id)).map((s) => `${s.player!.name} (${s.position.name})`);
              return (
                <li key={i} className={c.met ? 'is-met' : 'is-miss'}>
                  <span className="obj-mark" aria-hidden="true">{c.met ? '✓' : '✕'}</span>
                  <span className="sr-only">{c.met ? t('obj.met') : t('obj.notMet')}</span>
                  {conditionLabel(c.condition, meta, t)} {who.length ? `→ ${who.join(', ')}` : ''}
                </li>
              );
            })}
          </ul>
          {!result.found && (
            <ul className="obj-reasons" role="alert">
              {result.reasons.map((r, i) => (
                <li key={i}>{r.code === 'noMatch' ? t('obj.reason.noMatch', { what: conditionLabel(r.condition, meta, t) }) : t('obj.reason.combo', { formation: result.formation })}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="obj-bar">
        <label>
          <span>{t('obj.formation')}</span>
          <select value={formation} onChange={(e) => setFormation(e.target.value)}>
            {Object.keys(meta.formations).map((f) => (
              <option key={f} value={f}>{f.replace(/^f/, '')}</option>
            ))}
          </select>
        </label>
        <span className="muted">{t('obj.picked', { count: active.length })}</span>
        <button type="button" className="primary" disabled={!active.length || solving} onClick={() => void solve()}>
          {solving ? t('obj.solving') : t('obj.find')}
        </button>
      </div>
    </section>
  );
}
```

Before writing, open `web/src/components/Pitch.tsx` and `web/src/api.ts` (`SlotResult`, `Challenge`) and match the exact shapes instead of `as never` where the types line up; keep `as never` only for fields the objectives result does not have. Check how the existing primary button is classed in `App.tsx` (search `className="primary"` or the Solve button) and use the same class. Check the formation label helper used elsewhere (search `formation` in `SetList.tsx`/`Pitch.tsx`) and reuse it instead of `f.replace(/^f/, '')` if one exists. Badge on the pitch: if `Pitch` has no hook for per-player badges, add an optional `badges?: Set<number>` prop rendering a small `obj-badge` (icon + `sr-only` text) on those cards; keep it optional so SBC screens are unchanged.

- [ ] **Step 6: Strings**

`web/src/locales/en.ts` (keep the file's grouping; add near `gallery.*`):

```ts
  'nav.objectives': 'Objectives',
  'obj.title': 'Objectives squad',
  'obj.lede': 'Tick the objectives you are playing; FC Solver builds the strongest squad from your club that covers them.',
  'obj.fetched': 'Objectives from the web app, {minutes} min ago',
  'obj.emptyOpenWebApp': 'Open Objectives in the FC27 web app once, then come back here.',
  'obj.emptyUpdateExtension': 'Update the FC Solver extension (0.9.0 or newer) so it can read your Objectives.',
  'obj.timeLeft': '{days}d {hours}h left',
  'obj.noCondition': 'No squad condition',
  'obj.preferredOnly': 'preferred position',
  'obj.role.score': 'Score with: {what}',
  'obj.role.assist': 'Assist with: {what}',
  'obj.role.xi_one': 'Starting 11: {what}',
  'obj.role.xi_other': 'Starting 11: {count} × {what}',
  'obj.formation': 'Formation',
  'obj.picked_one': '{count} objective picked',
  'obj.picked_other': '{count} objectives picked',
  'obj.find': 'Find squad',
  'obj.solving': 'Building squad…',
  'obj.met': 'Covered',
  'obj.notMet': 'Not covered',
  'obj.reason.noMatch': 'Nobody in your club can do this: {what}',
  'obj.reason.combo': 'These objectives do not fit together in {formation}. Try another formation or fewer objectives.',
  'obj.lockedTitle': 'Objectives squads are Premium',
  'obj.lockedBody': 'Pick objectives like "score with a Dutch player" and get the best squad from your own club for them.',
  'err.noObjectives': 'Pick at least one objective with a squad condition.',
  'err.badFormation': 'Unknown formation.',
```

Use the `count` plural form the i18n helper expects for `obj.role.xi` (check how `t()` picks `_one`/`_other`; if it needs `count` always, pass `count: c.min` in `conditionLabel` for `xi` and update the test expectation accordingly). Add the same keys to `ro.ts` (plurals `_one`/`_few`/`_other`) and `it.ts` (`_one`/`_other`), translated, e.g. ro `'obj.find': 'Găsește echipa'`, `'obj.role.score': 'Gol cu: {what}'`, `'obj.role.assist': 'Assist cu: {what}'`, `'obj.role.xi_one': 'Primii 11: {what}'`, `'obj.role.xi_few': 'Primii 11: {count} × {what}'`, `'obj.role.xi_other': 'Primii 11: {count} × {what}'`; it `'obj.find': 'Trova la squadra'`, `'obj.role.score': 'Segna con: {what}'`, `'obj.role.assist': 'Assist con: {what}'`, `'obj.role.xi_one': 'Titolari: {what}'`, `'obj.role.xi_other': 'Titolari: {count} × {what}'`.

Run: `npm run i18n:check`
Expected: no missing keys.

- [ ] **Step 7: Mount in `App.tsx`**

Nav, after the Gallery button (~line 816), with a Phosphor icon not used elsewhere in the nav (e.g. `Target`):

```tsx
          <button type="button" className="nav-item" aria-current={view === 'objectives' && !showGuide ? 'page' : undefined} onClick={() => go('objectives')}>
            <Target weight="bold" aria-hidden="true" />
            <span>{t('nav.objectives')}</span>
          </button>
```

`go('objectives')` must map to `{ view: 'objectives' }` (see the `v === 'gallery'` mapping ~line 555). Add `'objectives'` to the page-title map (~line 383) with `'Objectives'`. View, next to the Gallery block (~line 910):

```tsx
          {!showGuide && view === 'objectives' && meta && (
            !premium ? (
              <section className="objectives-view">
                <header className="page-head">
                  <div>
                    <h1>{t('obj.title')}</h1>
                    <p className="muted">{t('obj.lede')}</p>
                  </div>
                </header>
                <PremiumPreview title={t('obj.lockedTitle')} body={t('obj.lockedBody')}>
                  <div className="obj-demo" />
                </PremiumPreview>
              </section>
            ) : (
              activeId && (
                <ObjectivesView
                  key={activeId}
                  meta={meta}
                  personaId={activeId}
                  extVersionOk={compareVersions(persona?.extVersion ?? '0', '0.9.0') >= 0}
                  excludeIds={settings.excludeIds}
                  maxRating={settings.maxRating}
                  onError={onApiError}
                />
              )
            )
          )}
```

Read what `App.tsx` actually calls the global solver settings object and the active persona (search `excludeIds` and `extVersion`), and use those names. `compareVersions` comes from `web/src/components/UpdateBanner.tsx`. If `persona` carries no `extVersion` on the site, pass `extVersionOk={true}` and show only the "open Objectives in the web app" empty state (spec allows either message; do not add a new API field for this).

- [ ] **Step 8: Styles**

Append to `web/src/styles.css`, using existing tokens (check the names at the top of the file: surface, line, text-muted, `--go`, radius tokens):

```css
.objectives-view { display: grid; gap: 16px; padding-bottom: 88px; }
.obj-groups { display: grid; gap: 16px; }
.obj-group { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.obj-group h2 { font-size: 1.05rem; margin: 0; }
.obj-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; }
.obj-item { border-top: 1px solid var(--line); padding-top: 10px; }
.obj-item.is-dim { opacity: 0.6; }
.obj-check { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: 4px 0; cursor: pointer; border-radius: 8px; }
.obj-check:disabled { cursor: default; }
.obj-check[aria-checked='true'] svg { color: var(--go); }
.obj-name { font-weight: 600; flex: 1; }
.obj-progress { font-variant-numeric: tabular-nums; color: var(--text-muted); }
.obj-desc { margin: 4px 0 0 28px; color: var(--text-muted); font-size: 0.9rem; }
.obj-pills { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0 28px; padding: 0; }
.obj-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85rem; }
.obj-none { margin: 6px 0 0 28px; font-size: 0.85rem; }
.obj-empty { display: flex; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.obj-covers, .obj-reasons { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; }
.obj-covers .is-met .obj-mark { color: var(--go); }
.obj-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 12px 16px; background: var(--surface); border-top: 1px solid var(--line); z-index: 5; }
.obj-bar label { display: flex; gap: 6px; align-items: center; margin-right: auto; }
@media (min-width: 860px) { .obj-bar { left: var(--sidebar-w, 240px); } }
@media (max-width: 480px) { .obj-bar { flex-wrap: wrap; } .obj-bar .primary { flex: 1 0 100%; } }
```

Replace any token name that does not exist in `styles.css` with the real one (e.g. the sidebar width variable).

- [ ] **Step 9: Verify in the browser**

Run: `npm run typecheck && npm test && npm run i18n:check && npm run build`
Expected: all pass.

In the running dev app (`http://localhost:5173/dashboard/objectives`) with a Premium account that has the `objectives` cache:
1. Groups and pills show; no-condition objectives are dimmed and not tickable.
2. Tick "The Dutch" + "Winner Mentality" → Find squad → pitch with a full XI, ✓ covers naming the Dutch player.
3. Tick an objective nobody can meet (or exclude the only Dutch players in Settings) → reason text shows.
4. Reload: ticks and last result are still there.
5. Free account: Premium preview, no request to `/api/objectives` (Network tab).
6. Width 390px (devtools): sticky bar wraps, nothing overflows horizontally; sidebar is the hamburger menu.
7. Keyboard: Tab reaches each checkbox, Space toggles it; screen-reader text says Covered / Not covered.

- [ ] **Step 10: Commit**

```bash
git pull --rebase
git add web/src/api.ts web/src/route.ts web/src/components/objectives web/src/App.tsx web/src/styles.css web/src/locales web/src/components/Pitch.tsx
git commit -m "feat(objectives): objectives screen with squad finder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Landing section

**Files:**
- Create: `web/src/landing/Objectives.tsx`
- Modify: `web/src/landing/Landing.tsx` (nav link ~line 77, section between `<Pillars />` and `<Steps />` ~line 93)
- Modify: `web/src/landing/landing.css`
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`landing.obj.*`, `landing.nav.objectives`)

**Interfaces:**
- Consumes: landing patterns in `web/src/landing/Pillars.tsx` (section markup `lp-section`, `aria-labelledby`), scroll-driven reveal used there or in `motion.ts`, card art already in `web/public/landing/`.
- Produces: `export function Objectives()` rendering `<section id="objectives" className="lp-section lp-obj" aria-labelledby="lp-obj-title">`.

- [ ] **Step 1: Read the patterns**

Open `web/src/landing/Pillars.tsx` and `web/src/landing/motion.ts` and `web/src/landing/landing.css` (only the `.lp-why` / reveal rules). Note how a section heading, eyebrow/badge and reveal-on-scroll are done, and which card images exist in `web/public/landing/` (`ls web/public/landing`).

- [ ] **Step 2: Component**

`web/src/landing/Objectives.tsx`:

```tsx
import { SoccerBall, HandPointing, UsersThree, Crown } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

// Static demo: three objective cards tick one after another, then the pitch lights up the players covering them.
const CARDS = [
  { icon: SoccerBall, key: 'score' },
  { icon: UsersThree, key: 'xi' },
  { icon: HandPointing, key: 'assist' },
] as const;

export function Objectives() {
  const { t } = useI18n();
  return (
    <section id="objectives" className="lp-section lp-obj" aria-labelledby="lp-obj-title">
      <div className="lp-obj-copy">
        <p className="lp-obj-badge"><Crown weight="fill" aria-hidden="true" /> {t('landing.obj.badge')}</p>
        <h2 id="lp-obj-title">{t('landing.obj.title')}</h2>
        <p className="lp-lede">{t('landing.obj.lede')}</p>
      </div>
      <div className="lp-obj-demo" aria-hidden="true">
        <ol className="lp-obj-cards">
          {CARDS.map(({ icon: Icon, key }, i) => (
            <li key={key} className="lp-obj-card" style={{ ['--i' as string]: i }}>
              <Icon weight="bold" />
              <span>{t(`landing.obj.card.${key}`)}</span>
              <span className="lp-obj-tick">✓</span>
            </li>
          ))}
        </ol>
        <div className="lp-obj-pitch">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <span key={n} className={`lp-obj-dot${[1, 6, 9].includes(n) ? ' is-hit' : ''}`} style={{ ['--n' as string]: n }} />
          ))}
        </div>
      </div>
      <p className="sr-only">{t('landing.obj.demoAlt')}</p>
    </section>
  );
}
```

If `web/public/landing/` has player card art, swap the `.lp-obj-dot.is-hit` spans for `<img>` cards (decorative, `alt=""`); keep the dots for the rest.

- [ ] **Step 3: Styles**

Append to `web/src/landing/landing.css`, reusing the landing tokens and the reveal mechanism found in Step 1 (scroll-driven `animation-timeline: view()` or the `is-in` class from `motion.ts`):

```css
.lp-obj { display: grid; gap: 32px; align-items: center; }
@media (min-width: 860px) { .lp-obj { grid-template-columns: 1fr 1.1fr; } }
.lp-obj-badge { display: inline-flex; gap: 6px; align-items: center; padding: 2px 10px; border-radius: 8px; border: 1px solid var(--lp-line); }
.lp-obj-demo { display: grid; gap: 16px; }
.lp-obj-cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.lp-obj-card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--lp-surface); border: 1px solid var(--lp-line); }
.lp-obj-tick { margin-left: auto; color: var(--go); opacity: 0; transform: scale(0.6); }
.lp-obj-pitch { position: relative; aspect-ratio: 3 / 2; border-radius: 14px; background: var(--lp-pitch, oklch(0.32 0.06 160)); }
.lp-obj-dot { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: oklch(0.85 0 0 / 0.5);
  left: calc(8% + (var(--n) * 8%)); top: calc(20% + mod(var(--n), 3) * 25%); }
.lp-obj-dot.is-hit { background: var(--go); }
@media (prefers-reduced-motion: no-preference) {
  .lp-obj-tick { animation: lp-obj-tick 0.4s ease-out both; animation-delay: calc(0.5s + var(--i) * 0.6s); }
  .lp-obj-dot.is-hit { animation: lp-obj-hit 0.5s ease-out both; animation-delay: 2.4s; }
}
@media (prefers-reduced-motion: reduce) { .lp-obj-tick { opacity: 1; transform: none; } }
@keyframes lp-obj-tick { to { opacity: 1; transform: none; } }
@keyframes lp-obj-hit { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
```

Tie the animations to the section entering the viewport the same way the other landing sections do (Step 1), so they do not run off-screen. Replace `--lp-*` names with the real landing tokens. If `mod()` is not supported by the build targets, place the 11 dots with explicit per-index positions instead.

- [ ] **Step 4: Mount and nav**

In `web/src/landing/Landing.tsx`: `import { Objectives } from './Objectives';`, add `<a href="#objectives">{t('landing.nav.objectives')}</a>` after the `#why` link, and render `<Objectives />` between `<Pillars />` and `<Steps link={link} />`.

- [ ] **Step 5: Strings**

en:

```ts
  'landing.nav.objectives': 'Objectives',
  'landing.obj.badge': 'Premium',
  'landing.obj.title': 'The right squad for your objectives',
  'landing.obj.lede': 'Score with a Dutch player, keep an Eredivisie player in your starting 11, assist with a CAM: tick the objectives and FC Solver builds the strongest squad from your own club that covers them, with the scorer where he scores.',
  'landing.obj.card.score': 'Score 6 goals using a player from France',
  'landing.obj.card.xi': 'Min. 1 Eredivisie player in your starting 11',
  'landing.obj.card.assist': 'Assist 5 goals using a ST',
  'landing.obj.demoAlt': 'Three objectives get ticked and the squad lights up the players that cover them.',
```

The card texts imitate EA objective wording but are our demo copy, so they are translated in ro / it like the rest of the landing. Add ro and it translations for every key.

Run: `npm run i18n:check`
Expected: no missing keys.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: pass.

In the browser at `http://localhost:5173/`: the nav link scrolls to the section; ticks then dots animate once when the section scrolls into view; with "Emulate prefers-reduced-motion: reduce" in devtools everything shows static and complete; at 390px the copy stacks above the demo with no horizontal scroll; contrast of the badge and card text passes (devtools contrast check).

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add web/src/landing/Objectives.tsx web/src/landing/Landing.tsx web/src/landing/landing.css web/src/locales
git commit -m "feat(landing): objectives squad section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final check

**Files:** none new.

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run i18n:check && npm run build`
Expected: all pass. Paste the summary lines (tests pass count, build done) in the final report.

- [ ] **Step 2: End-to-end on real data**

With the dev server running and the 0.9.0 extension loaded unpacked from `extension/`: open FC27 web app → Objectives; open FC Solver → Objectives; solve two real objectives; confirm the squad in the result is all in position (no red position marks on the pitch), chemistry and rating match what the pitch shows, and covers are ✓.

- [ ] **Step 3: Review the diff**

Run: `git diff dev...HEAD --stat` (or against the branch base) and read through for leftovers (`console.log`, `as never` that could be real types, unused imports). Diff is over 200 lines, so request a review with caveman:cavecrew-reviewer per CLAUDE.md before merging.

- [ ] **Step 4: Hand back**

Do not push. Report: what changed (paths), commands run + results, anything not verified, and that pushing / deploying needs the user's go-ahead (prod also needs users to update the extension to 0.9.0).
