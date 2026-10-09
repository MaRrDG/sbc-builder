// Bot strings, English and Romanian only. The channel's category decides, then the user's site language, then Discord's locale.
import { CAT } from './layout.js';

export type Lang = 'en' | 'ro';

const en = {
  'roles.pick': 'Pick any number, then close the menu. Unticking removes the role.',
  'roles.saved': 'Saved: {list}',
  'roles.none': 'Saved: no roles from this list.',
  'roles.failed': "Couldn't change your roles. Ask an Admin.",
  'roles.needMember': 'Accept the rules first: react ✅ in {rules}.',
  'lang.pending': 'Language: {list}. Now read {rules} and react ✅ to unlock the server.',
  'lang.saved': 'Language saved: {list}.',
  'lang.none': 'No language selected. Pick at least one to continue.',
  cooldown: 'Wait {s}s before the next /sbc.',
  'sbc.intro': "Cheapest squad from {user}'s club",
  'sbc.rating': 'Rating',
  'sbc.chem': 'Chemistry',
  'sbc.points': 'Points',
  'sbc.pts': 'pts',
  'sbc.locked': 'locked',
  'sbc.storage': '(S) = from SBC storage',
  'sbc.notFound': "No squad from {user}'s club completes it.",
  'sbc.open': 'Open on FC Solver',
  'sbc.defaults': 'default solver settings',
  'sbc.quota': 'Free: {used}/{limit} solves this week',
  'sbc.more': '+{n} more',
  'reason.pool': 'Only {have} players are usable, {need} are needed.',
  'reason.count': '{req}: you have {have} usable.',
  'reason.sameGroup': '{req}: your biggest group has {have}.',
  'reason.distinct': '{req}: your usable players cover only {have}.',
  'reason.rating': '{req}: your best {need} usable players only reach {have}.',
  'reason.points': 'Your club has {have} of the {need} points needed.',
  'reason.combo': 'Each requirement is possible on its own, but not all together with your club.',
  'stats.title': "{user}'s FC Solver stats",
  'stats.sbcs': 'SBCs completed',
  'stats.challenges': 'Challenges completed',
  'stats.objectives': 'Objectives completed',
  'stats.club': 'Players in the club',
  'stats.streak': 'Daily streak',
  'stats.since': 'Counted by FC Solver since {date}; SBCs that expired before that are not included.',
  'stats.noHistory': 'Nothing counted yet: open your SBCs in the EA web app once.',
  'err.link': 'Connect your Discord account in FC Solver (Linked accounts) first: {url}',
  'err.noPersona': 'Link an EA account to FC Solver first (Linked accounts): {url}',
  'err.quota': 'You used all {limit} Free solves this week (more {when}). Premium has no limit: {url}',
  'err.slow': 'Too many solves, or one is already running for you. Wait a minute.',
  'err.challenge': 'Challenge not found. Open the SBC once in the EA web app.',
  'err.clubEmpty': 'Your club is empty. Open your club in the web app or sync it.',
  'err.needsLayout': 'This SBC has locked slots. Open it once in the FC27 web app so FC Solver sees which, then try again.',
  'err.pointsDone': 'This challenge already has all its points.',
  'err.cannotPost': "I can't post in this channel. Try 🧩・sbc-help or 🧩・ajutor-sbc.",
  'err.generic': "FC Solver didn't answer. Try again in a minute.",
  'err.notAvailable': 'This SBC is done or cannot be repeated right now.',
  'err.badRequest': 'Something in that request was off. Pick the SBC from the list and try again.',
};
export type Key = keyof typeof en;
const ro: Record<Key, string> = {
  'roles.pick': 'Alege oricâte, apoi închide meniul. Debifarea scoate rolul.',
  'roles.saved': 'Salvat: {list}',
  'roles.none': 'Salvat: niciun rol din lista asta.',
  'roles.failed': 'Nu ți-am putut schimba rolurile. Scrie unui Admin.',
  'roles.needMember': 'Acceptă întâi regulamentul: reacționează cu ✅ în {rules}.',
  'lang.pending': 'Limbă: {list}. Acum citește {rules} și reacționează cu ✅ ca să deblochezi serverul.',
  'lang.saved': 'Limbă salvată: {list}.',
  'lang.none': 'Nicio limbă aleasă. Alege cel puțin una ca să continui.',
  cooldown: 'Mai așteaptă {s}s până la următorul /sbc.',
  'sbc.intro': 'Cel mai ieftin lot din clubul lui {user}',
  'sbc.rating': 'Rating',
  'sbc.chem': 'Chimie',
  'sbc.points': 'Puncte',
  'sbc.pts': 'pct',
  'sbc.locked': 'blocat',
  'sbc.storage': '(S) = din depozitul SBC',
  'sbc.notFound': 'Niciun lot din clubul lui {user} nu îl completează.',
  'sbc.open': 'Deschide în FC Solver',
  'sbc.defaults': 'setări implicite ale solverului',
  'sbc.quota': 'Free: {used}/{limit} rezolvări săptămâna asta',
  'sbc.more': 'încă {n}',
  'reason.pool': 'Doar {have} jucători se pot folosi, e nevoie de {need}.',
  'reason.count': '{req}: ai {have} utilizabili.',
  'reason.sameGroup': '{req}: cel mai mare grup al tău are {have}.',
  'reason.distinct': '{req}: jucătorii tăi utilizabili acoperă doar {have}.',
  'reason.rating': '{req}: cei mai buni {need} jucători utilizabili ajung doar la {have}.',
  'reason.points': 'Clubul tău are {have} din cele {need} de puncte necesare.',
  'reason.combo': 'Fiecare cerință e posibilă separat, dar nu toate împreună cu clubul tău.',
  'stats.title': 'Statisticile FC Solver ale lui {user}',
  'stats.sbcs': 'SBC-uri completate',
  'stats.challenges': 'Challenge-uri completate',
  'stats.objectives': 'Obiective completate',
  'stats.club': 'Jucători în club',
  'stats.streak': 'Serie Daily',
  'stats.since': 'Numărate de FC Solver din {date}; SBC-urile expirate înainte nu sunt incluse.',
  'stats.noHistory': 'Nimic numărat încă: deschide o dată SBC-urile în web app-ul EA.',
  'err.link': 'Conectează-ți întâi contul de Discord în FC Solver (Conturi legate): {url}',
  'err.noPersona': 'Leagă întâi un cont EA de FC Solver (Conturi legate): {url}',
  'err.quota': 'Ai folosit toate cele {limit} rezolvări Free din săptămâna asta (altele {when}). Premium n-are limită: {url}',
  'err.slow': 'Prea multe rezolvări sau ai deja una în curs. Așteaptă un minut.',
  'err.challenge': 'Challenge-ul nu a fost găsit. Deschide o dată SBC-ul în web app-ul EA.',
  'err.clubEmpty': 'Clubul tău e gol. Deschide clubul în web app sau sincronizează-l.',
  'err.needsLayout': 'Acest SBC are sloturi blocate. Deschide-l o dată în web app-ul FC27 ca FC Solver să vadă care, apoi încearcă din nou.',
  'err.pointsDone': 'Challenge-ul are deja toate punctele.',
  'err.cannotPost': 'Nu pot scrie în canalul ăsta. Încearcă 🧩・ajutor-sbc sau 🧩・sbc-help.',
  'err.generic': 'FC Solver nu a răspuns. Încearcă din nou peste un minut.',
  'err.notAvailable': 'Acest SBC e făcut sau nu se poate repeta acum.',
  'err.badRequest': 'Ceva din cerere nu e în regulă. Alege SBC-ul din listă și încearcă din nou.',
};
export const STRINGS: Record<Lang, Record<Key, string>> = { en, ro };

export function tr(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  let s = STRINGS[lang][key];
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function langFor(c: { category: string | null; siteLang?: string | null; locale?: string | null }): Lang {
  if (c.category === CAT.ro) return 'ro';
  if (c.category === CAT.en) return 'en';
  if (c.siteLang) return c.siteLang === 'ro' ? 'ro' : 'en';
  return c.locale?.toLowerCase().startsWith('ro') ? 'ro' : 'en';
}
