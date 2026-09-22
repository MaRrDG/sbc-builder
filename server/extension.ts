// Serves the Chrome extension as a zip, pre-configured for the server it was downloaded
// from, so friends never have to type a server address.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { ROOT } from './store.js';

const DIR = join(ROOT, 'extension');
const DEFAULT_SERVER = 'http://localhost:5178';

export interface ExtensionRelease {
  version: string;
  notes: string[];
}

let release: ExtensionRelease | null = null;

/** Version shipped from extension/manifest.json + its notes from extension/release.json. */
export async function latestExtension(): Promise<ExtensionRelease> {
  if (release) return release;
  const { version } = JSON.parse(await readFile(join(DIR, 'manifest.json'), 'utf8')) as { version: string };
  const notes = JSON.parse(await readFile(join(DIR, 'release.json'), 'utf8')) as Record<string, string[]>;
  release = { version, notes: notes[version] ?? [] };
  return release;
}

export async function buildExtensionZip(origin: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const name of await readdir(DIR)) {
    if (name === 'release.json') continue; // server-side notes, not part of the extension
    let text = await readFile(join(DIR, name), 'utf8');
    if (name.endsWith('.js')) text = text.replaceAll(DEFAULT_SERVER, origin);
    if (name === 'manifest.json') {
      const manifest = JSON.parse(text);
      const pattern = `${origin}/*`;
      if (!manifest.host_permissions.includes(pattern)) manifest.host_permissions.push(pattern);
      text = JSON.stringify(manifest, null, 2);
    }
    files[`fc27-sbc-builder/${name}`] = strToU8(text);
  }
  return zipSync(files, { level: 6 });
}

/** Origin as the browser saw it (works behind a reverse proxy that sets X-Forwarded-*). */
export function requestOrigin(headers: Record<string, string | string[] | undefined>, fallbackProto = 'http'): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0].trim();
  const proto = first(headers['x-forwarded-proto']) ?? fallbackProto;
  const host = first(headers['x-forwarded-host']) ?? first(headers.host) ?? 'localhost:5178';
  return `${proto}://${host}`;
}
