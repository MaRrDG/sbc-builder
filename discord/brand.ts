// FC Solver brand for Discord (DESIGN.md brand colours): embeds, role colours, images in discord/assets/.
import { join } from 'node:path';

export const BRAND = {
  lime: 0xc8f53c, // accent: found / success / Admin
  green: 0x0e3b2b, // default embed colour
  cream: 0xf2efe8, // Member, neutral
  mod: 0x7fd1ae, // Moderator, a softer green
  red: 0xe5484d, // not found / errors
  boost: 0xf47fff, // Discord's boost pink: the managed Server Booster role
} as const;

export const ASSETS = { avatar: 'avatar-fc.png', check: 'avatar-check.png', lime: 'avatar-fc-lime.png', banner: 'banner.png' } as const;

export const assetPath = (file: string) => join(import.meta.dirname, 'assets', file);
