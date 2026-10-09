// The FC Solver Discord server as data: roles, categories, channels, names, topics and who sees what.
// The owner edits names / emojis / topics here and re-runs `npm run discord:setup` (old names go in `aliases`).
import type { PermissionsString } from 'discord.js';
import { BRAND } from './brand.js';

export type PickerGroup = 'lang' | 'world' | 'superliga';
export type Access = 'everyone' | 'rules' | 'member' | 'ro' | 'en' | 'staff';
export type ChannelKind = 'text' | 'announcement' | 'voice';
export type Target = 'category' | ChannelKind;
export interface RoleSpec { name: string; color: number; permissions: PermissionsString[]; hoist: boolean; group?: PickerGroup; icon?: string; aliases?: string[] }
export interface ChannelSpec { name: string; kind: ChannelKind; topic?: string; readOnly?: boolean; slowmode?: number; access?: Access; aliases?: string[] }
export interface CategorySpec { name: string; access: Access; channels: ChannelSpec[]; aliases?: string[] }

// one style everywhere: "📜・rules", "🔊 Lounge", "━━ INFO ━━"
export const textName = (emoji: string, name: string) => `${emoji}・${name}`;
export const voiceName = (name: string) => `🔊 ${name}`;
export const categoryName = (name: string) => `━━ ${name} ━━`;

export const ROLE = { admin: 'Admin', mod: 'Moderator', member: 'Member', en: 'EN', ro: 'RO', pendingEn: 'Pending EN', pendingRo: 'Pending RO' } as const;
export const CAT = {
  info: categoryName('INFO'), en: categoryName('ENGLISH'), ro: categoryName('ROMÂNĂ'), voice: categoryName('VOICE'), staff: categoryName('STAFF'),
} as const;
export const CH = {
  language: textName('🌐', 'language'),
  rules: textName('📜', 'rules'),
  welcome: textName('👋', 'welcome'),
  announcements: textName('📢', 'announcements'),
  roles: textName('🎭', 'roles'),
  daily: textName('⚽', 'daily'),
  polls: textName('📊', 'polls'),
  boost: textName('💎', 'boost-perks'),
  sbcRo: textName('🧩', 'ajutor-sbc'),
  sbcEn: textName('🧩', 'sbc-help'),
  superliga: textName('🏟️', 'echipe-superliga'),
  modLog: textName('📋', 'mod-log'),
} as const;

export const WORLD_CLUBS = [
  'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Manchester City', 'Liverpool', 'Arsenal', 'Manchester United', 'Chelsea',
  'Bayern München', 'Borussia Dortmund', 'PSG', 'Juventus', 'Inter', 'Milan', 'Napoli',
];
// SuperLiga 2026-2027, verified 2026-10-09
export const SUPERLIGA = [
  'Universitatea Craiova', 'Universitatea Cluj', 'CFR Cluj', 'Dinamo București', 'Rapid București', 'FC Argeș', 'UTA Arad', 'FCSB',
  'Oțelul Galați', 'FC Botoșani', 'Csíkszereda', 'Petrolul Ploiești', 'Farul Constanța', 'FC Voluntari', 'Corvinul Hunedoara', 'Sepsi OSK',
];
// Team role colours (hex ints), one per club, keyed by the names above. Main kit/crest colour, each at least 3:1 against Discord's dark UI (#313338), enforced by layout.test.ts.
// White/black primaries use the signature secondary (Real Madrid gold, Juventus silver, Milan red, Inter blue, Dortmund yellow...). Never 0 (Discord: "no colour").
export const TEAM_COLORS: Record<string, number> = {
  'Real Madrid': 0xfebe10, Barcelona: 0xc7618b, 'Atlético Madrid': 0xe24a4d, 'Manchester City': 0x6cabdd, Liverpool: 0xd75369,
  Arsenal: 0xf23439, 'Manchester United': 0xe15045, Chelsea: 0x4c85c6, 'Bayern München': 0xe54664, 'Borussia Dortmund': 0xfde100,
  PSG: 0x5d82c4, Juventus: 0xb4b9c0, Inter: 0x5285c7, Milan: 0xfb090b, Napoli: 0x12a0d7,
  'Universitatea Craiova': 0x4880d6, 'Universitatea Cluj': 0xc8c8c8, 'CFR Cluj': 0xb56c81, 'Dinamo București': 0xea424c, 'Rapid București': 0xb96c7b,
  'FC Argeș': 0x8d70cd, 'UTA Arad': 0xd9a400, FCSB: 0xe04d59, 'Oțelul Galați': 0x5c81ce, 'FC Botoșani': 0xf2c200, Csíkszereda: 0xdd5050,
  'Petrolul Ploiești': 0xf4c20d, 'Farul Constanța': 0x2c9fd9, 'FC Voluntari': 0xf28c28, 'Corvinul Hunedoara': 0xe34a4a, 'Sepsi OSK': 0x2fa04a,
};
export const PICKERS: Record<PickerGroup, string[]> = { lang: [ROLE.en, ROLE.ro], world: WORLD_CLUBS, superliga: SUPERLIGA };

// order = hierarchy, top first (setup stacks them under the bot's role). A Premium role (later) goes after Moderator.
export const ROLES: RoleSpec[] = [
  { name: ROLE.admin, color: BRAND.lime, permissions: ['Administrator'], hoist: true },
  { name: ROLE.mod, color: BRAND.mod, permissions: ['ManageMessages', 'ModerateMembers', 'KickMembers', 'ManageThreads', 'MuteMembers', 'MoveMembers'], hoist: true },
  { name: ROLE.member, color: BRAND.cream, permissions: [], hoist: false },
  ...PICKERS.lang.map((name): RoleSpec => ({ name, color: 0, permissions: [], hoist: false, group: 'lang' })),
  // club roles: club colour (TEAM_COLORS); the ⚽ role icon is only applied on boost level 2 servers
  ...WORLD_CLUBS.map((name): RoleSpec => ({ name, color: TEAM_COLORS[name], permissions: [], hoist: false, group: 'world', icon: '⚽' })),
  ...SUPERLIGA.map((name): RoleSpec => ({ name, color: TEAM_COLORS[name], permissions: [], hoist: false, group: 'superliga', icon: '⚽' })),
  // hidden onboarding roles (language picked, rules not accepted yet): uncoloured, lowest, they only open the rules channel
  { name: ROLE.pendingEn, color: 0, permissions: [], hoist: false },
  { name: ROLE.pendingRo, color: 0, permissions: [], hoist: false },
];

export const CATEGORIES: CategorySpec[] = [
  {
    name: CAT.info, access: 'member', channels: [
      { name: CH.language, kind: 'text', readOnly: true, access: 'everyone', topic: 'Pick your language / Alege limba: the first step · primul pas' },
      { name: CH.rules, kind: 'text', readOnly: true, access: 'rules', topic: 'Rules · Regulament: react ✅ to unlock the server / reacționează cu ✅ ca să deblochezi serverul' },
      { name: CH.welcome, kind: 'text', readOnly: true, topic: 'Welcome to FC Solver · Bine ai venit' },
      { name: CH.announcements, kind: 'announcement', readOnly: true, topic: 'FC Solver news (follow it from your own server) · Noutăți FC Solver' },
      { name: CH.roles, kind: 'text', readOnly: true, topic: 'Language and favourite teams · Limbă și echipe favorite' },
      { name: CH.daily, kind: 'text', readOnly: true, topic: 'FC Solver Daily: a new player every day · un jucător nou în fiecare zi' },
      { name: CH.polls, kind: 'text', readOnly: true, topic: 'Community polls: vote here (created by Admins and Moderators) · Sondaje: votează aici (create de Admini și Moderatori)' },
      { name: CH.boost, kind: 'text', readOnly: true, topic: 'Premium while you boost · Premium cât timp dai boost' },
    ],
  },
  {
    name: CAT.en, access: 'en', channels: [
      { name: textName('💬', 'general'), kind: 'text', topic: 'Talk FC, SBCs and anything else' },
      { name: CH.sbcEn, kind: 'text', slowmode: 10, topic: 'Help with SBCs and FC Solver; /sbc and /stats work here' },
      { name: textName('🐞', 'bugs'), kind: 'text', slowmode: 30, topic: 'Something broken? Say what you pressed and what you saw' },
      { name: textName('💡', 'suggestions'), kind: 'text', slowmode: 30, topic: 'Ideas for FC Solver' },
    ],
  },
  {
    name: CAT.ro, access: 'ro', channels: [
      { name: textName('💬', 'general'), kind: 'text', topic: 'Discuții despre FC, SBC-uri și orice altceva' },
      { name: CH.sbcRo, kind: 'text', slowmode: 10, topic: 'Ajutor cu SBC-uri și FC Solver; aici merg /sbc și /stats' },
      { name: textName('🐞', 'buguri'), kind: 'text', slowmode: 30, topic: 'Ceva nu merge? Spune ce ai apăsat și ce ai văzut' },
      { name: textName('💡', 'sugestii'), kind: 'text', slowmode: 30, topic: 'Idei pentru FC Solver' },
      { name: CH.superliga, kind: 'text', readOnly: true, topic: 'Alege echipele tale din SuperLiga' },
    ],
  },
  {
    name: CAT.voice, access: 'member', channels: [
      { name: voiceName('Lounge'), kind: 'voice' },
      { name: voiceName('Vocal'), kind: 'voice', access: 'ro' },
      { name: voiceName('Voice'), kind: 'voice', access: 'en' },
    ],
  },
  {
    name: CAT.staff, access: 'staff', channels: [
      { name: textName('🛡️', 'staff'), kind: 'text' },
      { name: CH.modLog, kind: 'text', topic: 'Discord community updates and moderation log' },
    ],
  },
];

export interface Overwrite { id: string; allow: PermissionsString[]; deny: PermissionsString[] }
export interface RoleIds { everyone: string; bot: string; byName: ReadonlyMap<string, string> }

const WRITE: PermissionsString[] = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'];

/**
 * Discord ORs permissions across roles, so "RO and Member" cannot be an overwrite: the bot only hands out RO / EN together with
 * Member (✅ on the rules) and removes them when Member goes (discord/index.ts). The bot's own role is allowed everywhere so read-only stays writable for it.
 */
export function overwritesFor(access: Access, target: Target, readOnly: boolean, ids: RoleIds): Overwrite[] {
  const id = (name: string) => {
    const v = ids.byName.get(name.toLowerCase());
    if (!v) throw new Error(`role "${name}" is missing, run setup again`);
    return v;
  };
  const voice = target === 'voice';
  const see: PermissionsString[] = voice ? ['ViewChannel', 'Connect', 'Speak'] : ['ViewChannel', 'ReadMessageHistory'];
  const bot: Overwrite = {
    id: ids.bot,
    allow: voice ? ['ViewChannel', 'Connect'] : ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions', 'ManageMessages', 'SendPolls'],
    deny: [],
  };
  const noWrite = readOnly && !voice ? WRITE : [];
  if (access === 'everyone') return [{ id: ids.everyone, allow: see, deny: [...noWrite, 'AddReactions'] }, bot];
  // rules: read by new joiners who picked a language (pending roles) and by Members; others cannot add new reactions
  const viewers = { member: [ROLE.member], ro: [ROLE.ro], en: [ROLE.en], staff: [ROLE.mod], rules: [ROLE.pendingEn, ROLE.pendingRo, ROLE.member] }[access];
  const out: Overwrite[] = [
    { id: ids.everyone, allow: [], deny: ['ViewChannel'] },
    ...viewers.map((v) => ({ id: id(v), allow: see, deny: access === 'rules' ? [...noWrite, 'AddReactions' as const] : noWrite })),
  ];
  if (access !== 'staff') out.push({ id: id(ROLE.mod), allow: [...see, 'ManageMessages'], deny: [] });
  out.push(bot);
  return out;
}
