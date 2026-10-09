// The FC Solver Discord server as data: roles, categories, channels, names, topics and who sees what.
// The owner edits names / emojis / topics here and re-runs `npm run discord:setup` (old names go in `aliases`).
import type { PermissionsString } from 'discord.js';
import { BRAND } from './brand.js';

export type PickerGroup = 'lang' | 'world' | 'superliga';
export type Access = 'everyone' | 'member' | 'ro' | 'en' | 'staff';
export type ChannelKind = 'text' | 'announcement' | 'voice';
export type Target = 'category' | ChannelKind;
export interface RoleSpec { name: string; color: number; permissions: PermissionsString[]; hoist: boolean; group?: PickerGroup; icon?: string; aliases?: string[] }
export interface ChannelSpec { name: string; kind: ChannelKind; topic?: string; readOnly?: boolean; slowmode?: number; access?: Access; aliases?: string[] }
export interface CategorySpec { name: string; access: Access; channels: ChannelSpec[]; aliases?: string[] }

// one style everywhere: "📜・rules", "🔊 Lounge", "━━ INFO ━━"
export const textName = (emoji: string, name: string) => `${emoji}・${name}`;
export const voiceName = (name: string) => `🔊 ${name}`;
export const categoryName = (name: string) => `━━ ${name} ━━`;

export const ROLE = { admin: 'Admin', mod: 'Moderator', member: 'Member', ro: 'RO', en: 'EN' } as const;
export const CAT = {
  info: categoryName('INFO'), ro: categoryName('ROMÂNĂ'), en: categoryName('ENGLISH'), voice: categoryName('VOICE'), staff: categoryName('STAFF'),
} as const;
export const CH = {
  rules: textName('📜', 'rules'),
  welcome: textName('👋', 'welcome'),
  announcements: textName('📢', 'announcements'),
  roles: textName('🎭', 'roles'),
  daily: textName('⚽', 'daily'),
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
// Team role colours (hex ints), one per club, keyed by the names above. Main kit/crest colour, tuned to read on Discord's dark UI.
// White/black primaries use the signature secondary (Real Madrid gold, Juventus silver, Milan red, Inter blue, Dortmund yellow...). Never 0 (Discord: "no colour").
export const TEAM_COLORS: Record<string, number> = {
  'Real Madrid': 0xfebe10, Barcelona: 0xa50044, 'Atlético Madrid': 0xe03a3e, 'Manchester City': 0x6cabdd, Liverpool: 0xc8102e,
  Arsenal: 0xef0107, 'Manchester United': 0xda291c, Chelsea: 0x2a6ebb, 'Bayern München': 0xdc052d, 'Borussia Dortmund': 0xfde100,
  PSG: 0x2f5fb3, Juventus: 0xb4b9c0, Inter: 0x1b5eb5, Milan: 0xfb090b, Napoli: 0x12a0d7,
  'Universitatea Craiova': 0x2f6fd0, 'Universitatea Cluj': 0xc8c8c8, 'CFR Cluj': 0x8b1a3a, 'Dinamo București': 0xe30613, 'Rapid București': 0x9b2d43,
  'FC Argeș': 0x7d5cc6, 'UTA Arad': 0xd9a400, FCSB: 0xd8202f, 'Oțelul Galați': 0x4a73c9, 'FC Botoșani': 0xf2c200, Csíkszereda: 0xd62a2a,
  'Petrolul Ploiești': 0xf4c20d, 'Farul Constanța': 0x2c9fd9, 'FC Voluntari': 0xf28c28, 'Corvinul Hunedoara': 0xe34a4a, 'Sepsi OSK': 0x2fa04a,
};
export const PICKERS: Record<PickerGroup, string[]> = { lang: [ROLE.ro, ROLE.en], world: WORLD_CLUBS, superliga: SUPERLIGA };

// order = hierarchy, top first (setup stacks them under the bot's role). A Premium role (later) goes after Moderator.
export const ROLES: RoleSpec[] = [
  { name: ROLE.admin, color: BRAND.lime, permissions: ['Administrator'], hoist: true },
  { name: ROLE.mod, color: BRAND.mod, permissions: ['ManageMessages', 'ModerateMembers', 'KickMembers', 'ManageThreads', 'MuteMembers', 'MoveMembers'], hoist: true },
  { name: ROLE.member, color: BRAND.cream, permissions: [], hoist: false },
  ...PICKERS.lang.map((name): RoleSpec => ({ name, color: 0, permissions: [], hoist: false, group: 'lang' })),
  // club roles: club colour (TEAM_COLORS); the ⚽ role icon is only applied on boost level 2 servers
  ...WORLD_CLUBS.map((name): RoleSpec => ({ name, color: TEAM_COLORS[name], permissions: [], hoist: false, group: 'world', icon: '⚽' })),
  ...SUPERLIGA.map((name): RoleSpec => ({ name, color: TEAM_COLORS[name], permissions: [], hoist: false, group: 'superliga', icon: '⚽' })),
];

export const CATEGORIES: CategorySpec[] = [
  {
    name: CAT.info, access: 'member', channels: [
      { name: CH.rules, kind: 'text', readOnly: true, access: 'everyone', topic: 'Regulament · Rules: react ✅ to unlock the server / reacționează cu ✅ ca să deblochezi serverul' },
      { name: CH.welcome, kind: 'text', readOnly: true, topic: 'Bine ai venit · Welcome to FC Solver' },
      { name: CH.announcements, kind: 'announcement', readOnly: true, topic: 'Noutăți FC Solver · FC Solver news (follow it from your own server)' },
      { name: CH.roles, kind: 'text', readOnly: true, topic: 'Limbă și echipe favorite · Language and favourite teams' },
      { name: CH.daily, kind: 'text', readOnly: true, topic: 'FC Solver Daily: un jucător nou în fiecare zi · a new player every day' },
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
    name: CAT.en, access: 'en', channels: [
      { name: textName('💬', 'general'), kind: 'text', topic: 'Talk FC, SBCs and anything else' },
      { name: CH.sbcEn, kind: 'text', slowmode: 10, topic: 'Help with SBCs and FC Solver; /sbc and /stats work here' },
      { name: textName('🐞', 'bugs'), kind: 'text', slowmode: 30, topic: 'Something broken? Say what you pressed and what you saw' },
      { name: textName('💡', 'suggestions'), kind: 'text', slowmode: 30, topic: 'Ideas for FC Solver' },
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
 * Discord ORs permissions across roles, so "RO and Member" cannot be an overwrite: the bot removes RO / EN
 * when Member goes (discord/index.ts). The bot's own role is allowed everywhere so read-only stays writable for it.
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
    allow: voice ? ['ViewChannel', 'Connect'] : ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions', 'ManageMessages'],
    deny: [],
  };
  const noWrite = readOnly && !voice ? WRITE : [];
  if (access === 'everyone') return [{ id: ids.everyone, allow: see, deny: [...noWrite, 'AddReactions'] }, bot];
  const viewer = { member: ROLE.member, ro: ROLE.ro, en: ROLE.en, staff: ROLE.mod }[access];
  const out: Overwrite[] = [{ id: ids.everyone, allow: [], deny: ['ViewChannel'] }, { id: id(viewer), allow: see, deny: noWrite }];
  if (access !== 'staff') out.push({ id: id(ROLE.mod), allow: [...see, 'ManageMessages'], deny: [] });
  out.push(bot);
  return out;
}
