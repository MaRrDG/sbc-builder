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
