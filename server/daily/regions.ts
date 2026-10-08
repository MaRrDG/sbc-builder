// Static football geography for the Daily tiles: "near" nation = same confederation, "near" league =
// same country, "near" position = same line. EA ids from players' nation / leagueId (names in
// data/static.json loc: search.nationName.nation<id>, global.leagueFull.2027.league<id>). Unknown → no "near".
export type Confed = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
export type Line = 'gk' | 'def' | 'mid' | 'att';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CONFED = new Map<number, Confed>();
const put = (c: Confed, ids: number[]) => ids.forEach((id) => CONFED.set(id, c));
put('UEFA', [...range(1, 51), 165, 205, 208, 219]);
put('CONMEBOL', range(52, 61));
put('CONCACAF', [...range(62, 96).filter((id) => id !== 75), 207]);
put('CAF', [...range(97, 148), 214, 218]);
put('AFC', [...range(149, 193).filter((id) => id !== 165), 195, 212, 213]);
put('OFC', [194, ...range(196, 204), 215]);

export const confederationOf = (nation: number) => CONFED.get(nation);

const COUNTRY: Record<string, number[]> = {
  ENG: [13, 14, 60, 61, 2208, 10061, 2216],
  ESP: [53, 54, 10054, 2222],
  ITA: [31, 32, 2179, 10032, 2236],
  GER: [19, 20, 2076, 10020, 2215],
  FRA: [16, 17, 10017, 2218],
  NED: [10, 10010, 2229],
  BEL: [4, 10004],
  POR: [308, 10308, 2228],
  SCO: [50, 51, 371, 10050, 2233],
  USA: [39, 390, 2221],
  MEX: [84, 85, 341, 10341],
  ARG: [353, 1008, 1009, 10353],
  DEN: [1, 10001],
  NOR: [41, 10041, 2272],
  SWE: [56, 10056, 2232],
  AUT: [80, 10080],
  SUI: [189, 10189, 2231],
  POL: [66, 10066],
  IRL: [65, 10065],
  KOR: [83, 10083],
  KSA: [350, 10350],
  COL: [2209, 1005, 10336],
  CHI: [2249, 10335],
  RUS: [3006, 10067],
  CZE: [319, 2230],
  THA: [2070, 2271],
  TUR: [68], GRE: [63], CRO: [317], FIN: [322], ROU: [330], UKR: [332], EGY: [343], RSA: [347],
  AUS: [351], CHN: [2012], IND: [2149], UAE: [2172], CYP: [2210], HUN: [2211], AZE: [2244],
  BRA: [2267], BUL: [2274], ISL: [2273],
};
const LEAGUE = new Map<number, string>(Object.entries(COUNTRY).flatMap(([c, ids]) => ids.map((id) => [id, c] as [number, string])));
export const leagueCountry = (league: number) => LEAGUE.get(league);

const LINES: Record<Line, string[]> = {
  gk: ['GK'],
  def: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  mid: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  att: ['LW', 'RW', 'CF', 'ST'],
};
const LINE = new Map<string, Line>(Object.entries(LINES).flatMap(([l, ps]) => ps.map((p) => [p, l as Line] as [string, Line])));
export const positionLine = (pos: string) => LINE.get(pos);
