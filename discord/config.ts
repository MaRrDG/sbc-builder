// Bot settings from the environment (.env locally, compose in production). Values are never printed.
import { join } from 'node:path';

export interface BotConfig { token: string; appId: string; guildId: string; apiUrl: string; apiToken: string; siteUrl: string }

export function loadEnvFile(): void {
  try {
    process.loadEnvFile(join(import.meta.dirname, '..', '.env'));
  } catch {
    /* no .env: compose passes the environment */
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const need = (k: string) => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  const trim = (s: string) => s.replace(/\/+$/, '');
  return {
    token: need('DISCORD_TOKEN'),
    appId: need('DISCORD_APP_ID'),
    guildId: need('DISCORD_GUILD_ID'),
    apiUrl: trim(env.BOT_API_URL?.trim() || 'http://127.0.0.1:5178'),
    apiToken: env.BOT_API_TOKEN?.trim() ?? '',
    siteUrl: trim(env.SITE_URL?.trim() || 'http://localhost:5173'),
  };
}
