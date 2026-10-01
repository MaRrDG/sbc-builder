// One-off: fut.gg Gallery dump + EA static names → server/gallery/sets.json.
// Run: node --import tsx scripts/gallery-catalogue.ts  (prints unresolved sets; fix them in the tables below)
//
// Input: server/gallery/fut-gg-dump.json, one entry per set page (127), exported from fut.gg in the browser:
// url (path), name, requires, size, grades [[grade, score, reward]], lineupAssetIds (fut.gg's cheapest lineup),
// and for club sets clubEaId (fut.gg's own EA club id for the set, from its category page data).
//
// Eligibility decisions:
// - Club sets follow the "Requires" text: "Mens or Womens" → [men's club, women's club]; "Mens"/"Men's" → men's
//   club only; "Women's" → women's club only. fut.gg's clubEaId is the men's club for most sets but the women's
//   club for some (women-only sets, Bayern, Strasbourg), so WOMEN / MEN below name the other id. Icons / Heroes are
//   not added as assetIds: no club-set lineup on fut.gg contains a legends card (Arsenal's 20 includes women's
//   cards, which the women's club id covers), so club = men + women explains every lineup.
//   Same-name EA teams that are NOT the set's club are left out on purpose: Arsenal 110394 (Arsenal de Sarandí),
//   Everton 112584 (Everton de Viña del Mar), the "… XI" teams (Chelsea 132706, Liverpool 132703, Real Madrid 132704,
//   Bayern 132705, Juventus 132702), Union Berlin 111716 (Unión).
// - "1. FC Nürnberg": the dump regex cut its requires text at "1."; restored by hand from the set page
//   ("… 1. FC Nürnberg Women's players …"), so it is women only.
// - "Bergamo Calcio" requires no gender ("Bergamo Calcio players"): the one club id fut.gg gives.
// - Rarity sets (category 'rarity', as on fut.gg; Season 1 is a promo mix but fut.gg files it under Rarities too):
//   TOTW / Holographics / Heroes by kind; Season 1 = rareflags of "Ones to Watch" (150), "Destined for Glory" (22),
//   "Future Stars" (71); Squad Foundations = rareflag 87; Starter Set ("Bronze, Silver or Gold players") = the base
//   rareflags Common (0) and Rare (1): bronze / silver / gold is only the rating band of those base cards, and every
//   special card has its own rareflag.
// - League sets: league id from the "Requires 30 <league> players" text against EA's league names.
import { readFileSync, writeFileSync } from 'node:fs';
import type { GallerySet, Grade, SetFilter } from '../server/gallery/types.js';

interface Dumped {
  url: string;
  name: string;
  requires: string;
  size: number;
  grades: [Grade, number, string][];
  clubEaId?: number;
  lineupAssetIds: number[];
}

const dump: Dumped[] = JSON.parse(readFileSync('server/gallery/fut-gg-dump.json', 'utf8'));
const loc: Record<string, string> = JSON.parse(readFileSync('data/static.json', 'utf8')).data.loc;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// name → ids from EA's localisation keys (global.leagueFull.2027.league13, global.teamabbr15.2027.team1)
const index = (re: RegExp) => {
  const m = new Map<string, number[]>();
  for (const [k, v] of Object.entries(loc)) {
    const id = re.exec(k)?.[1];
    if (id) m.set(norm(v), [...new Set([...(m.get(norm(v)) ?? []), Number(id)])]);
  }
  return m;
};
const leagues = index(/^global\.league(?:Full|abbr15)\.2027\.league(\d+)$/);
const teamNames = new Map<number, string[]>();
for (const [k, v] of Object.entries(loc)) {
  const id = /^global\.teamabbr(?:10|15)\.2027\.team(\d+)$/.exec(k)?.[1];
  if (id) teamNames.set(Number(id), [...(teamNames.get(Number(id)) ?? []), v]);
}

/** Women's club id where it is not fut.gg's clubEaId (sets open to women). */
const WOMEN: Record<string, number> = {
  'laliga-rcd-espanyol': 131733,
  'laliga-atletico-de-madrid': 116327,
  'laliga-fc-barcelona': 116325,
  'laliga-real-madrid': 116326,
  'laliga-athletic-club': 116328,
  'laliga-real-sociedad': 116336,
  'laliga-sevilla-fc': 116337,
  'laliga-granada-cf': 131391,
  'premier-league-arsenal': 116009,
  'premier-league-chelsea': 116010,
  'premier-league-liverpool': 116343,
  'premier-league-manchester-city': 116017,
  'premier-league-manchester-united': 116012,
  'premier-league-aston-villa': 116015,
  'premier-league-tottenham-hotspur': 116011,
  'premier-league-brighton-hove-albion': 116013,
  'premier-league-everton': 116016,
  'premier-league-birmingham-city': 116019,
  'premier-league-charlton': 132867,
  'premier-league-west-ham': 116014,
  'bundesliga-vfb-stuttgart': 132865,
  'bundesliga-fsv-mainz-05': 132866,
  'bundesliga-hamburger-sv': 132533,
  'bundesliga-1-fc-nurnberg': 131386,
  'bundesliga-fc-union-berlin': 132589,
  'bundesliga-bayer-04-leverkusen': 115996,
  'bundesliga-eintracht-frankfurt': 115997,
  'bundesliga-rb-leipzig': 116021,
  'bundesliga-tsg-hoffenheim': 115999,
  'bundesliga-sc-freiburg': 116002,
  'bundesliga-werder-bremen': 116004,
  'bundesliga-fc-koln': 116003,
  'ligue-1-toulouse-fc': 132831,
  'ligue-1-le-havre-ac': 116416,
  'ligue-1-paris-saint-germain': 116034,
  'ligue-1-olympique-de-marseille': 132370,
  'ligue-1-olympique-lyonnais': 116033,
  'ligue-1-paris-fc': 116035,
};
/** Men's club id where fut.gg's clubEaId is the women's team. */
const MEN: Record<string, number> = {
  'bundesliga-fc-bayern-munchen': 21,
  'ligue-1-rc-strasbourg': 76,
};
/** Gender words the requires text lacks or lost. */
const GENDER: Record<string, 'men' | 'women' | 'both'> = {
  'serie-a-bergamo-calcio': 'men',
};
/** Sets the name lookup cannot resolve: rarity sets. */
const OVERRIDES: Record<string, Pick<GallerySet, 'category' | 'filter'>> = {
  'rarities-totw': { category: 'rarity', filter: { kinds: ['totw'] } },
  'rarities-holographics': { category: 'rarity', filter: { kinds: ['holo'] } },
  'rarities-heroes': { category: 'rarity', filter: { kinds: ['hero'] } },
  'rarities-season-1': { category: 'rarity', filter: { rarities: [150, 22, 71] } },
  'rarities-squad-foundations': { category: 'rarity', filter: { rarities: [87] } },
  'rarities-starter-set': { category: 'rarity', filter: { rarities: [0, 1] } },
};

// '/fut-gallery/premier-league/arsenal/' → 'premier-league-arsenal'
const slug = (url: string) => url.split('/').filter(Boolean).slice(1).join('-');
const gender = (id: string, requires: string) =>
  GENDER[id] ?? (/Mens or Womens/i.test(requires) ? 'both' : /Women'?s/i.test(requires) ? 'women' : /Men'?s/i.test(requires) ? 'men' : null);

const out: GallerySet[] = [];
const unresolved: string[] = [];
const warnings: string[] = [];
for (const d of dump) {
  const id = slug(d.url);
  const grades = Object.fromEntries(d.grades.map(([g, score]) => [g, score])) as Record<Grade, number>;
  const rewards = Object.fromEntries(d.grades.map(([g, , reward]) => [g, reward]));
  let filter: SetFilter | null = null;
  let category: GallerySet['category'] = 'campaign';
  if (OVERRIDES[id]) ({ category, filter } = OVERRIDES[id]);
  else if (d.url.startsWith('/fut-gallery/leagues/')) {
    category = 'league';
    const name = /Requires \d+ (.+) players to complete/.exec(d.requires)?.[1];
    const ids = name ? leagues.get(norm(name)) : undefined;
    if (ids?.length === 1) filter = { leagues: ids };
  } else if (d.clubEaId) {
    category = 'club';
    const g = gender(id, d.requires);
    const men = MEN[id] ?? d.clubEaId;
    const women = WOMEN[id] ?? d.clubEaId;
    const clubs = g === 'both' ? [men, women] : g === 'women' ? [women] : g === 'men' ? [men] : [];
    if (clubs.length && (g !== 'both' || men !== women)) filter = { clubs };
    // sanity: every chosen id must be an EA team whose name looks like the set's
    const want = norm(d.name).split(/\s+/);
    for (const c of clubs) {
      const names = (teamNames.get(c) ?? []).map(norm).join(' ');
      if (!names) warnings.push(`${id}: club ${c} has no EA name`);
      else if (!want.some((w) => w.length > 2 && names.includes(w))) warnings.push(`${id}: club ${c} is "${teamNames.get(c)!.join(' / ')}"`);
    }
  }
  if (!filter || !d.size || d.grades.length !== 5) unresolved.push(`${id}: ${d.requires}`);
  out.push({ id, name: d.name, category, size: d.size, filter: filter ?? {}, grades, rewards });
}
writeFileSync('server/gallery/sets.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} sets written, ${unresolved.length} need an override:\n` + unresolved.join('\n'));
if (warnings.length) console.log(`name check:\n` + warnings.join('\n'));
