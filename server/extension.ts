// Serves the Chrome extension as a zip, pre-configured for the server it was downloaded
// from, so friends never have to type a server address.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { ROOT } from './store.js';

const DIR = join(ROOT, 'extension');
const DEFAULT_SERVER = 'http://localhost:5178';

export async function buildExtensionZip(origin: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const name of await readdir(DIR)) {
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
