// Postgres connection. initDb() must succeed before the API listens; it applies pending migrations.
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { ROOT } from '../store.js';
import * as schema from './schema.js';

let client: postgres.Sql | null = null;
export let db: PostgresJsDatabase<typeof schema>;

export async function initDb(): Promise<void> {
  try {
    process.loadEnvFile(join(ROOT, '.env')); // local dev; in the container the env comes from compose
  } catch {
    /* no .env */
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  client = postgres(url, { max: 5, onnotice: () => {} });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(ROOT, 'server/db/migrations') });
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = null;
}

/** For writes that ride along a sync or relay: a DB hiccup is logged, never breaks the caller. */
export async function softly(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[db] ${what} failed: ${(e as Error).message}`);
  }
}
