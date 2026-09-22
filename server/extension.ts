// Serves the Chrome extension as a zip, pre-configured for the server it was downloaded
// from, so friends never have to type a server address.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
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
  for (const entry of await readdir(DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const rel = relative(DIR, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (rel === 'release.json') continue; // server-side notes, not part of the extension
    // the folder name stays: updates are unzipped over the old folder, and a new name would be a new extension
    const path = `fc27-sbc-builder/${rel}`;
    if (!/\.(js|json|html)$/.test(rel)) {
      files[path] = new Uint8Array(await readFile(join(DIR, rel))); // icons: copied byte for byte
      continue;
    }
    let text = await readFile(join(DIR, rel), 'utf8');
    if (rel.endsWith('.js')) text = text.replaceAll(DEFAULT_SERVER, origin);
    if (rel === 'manifest.json') {
      const manifest = JSON.parse(text);
      const pattern = `${origin}/*`;
      if (!manifest.host_permissions.includes(pattern)) manifest.host_permissions.push(pattern);
      text = JSON.stringify(manifest, null, 2);
    }
    files[path] = strToU8(text);
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
