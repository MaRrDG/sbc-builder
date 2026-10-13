// Serves the Chrome extension as a zip, pre-configured for the server it was downloaded
// from, so friends never have to type a server address.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { ROOT } from './store.js';

const DIR = join(ROOT, 'extension');
const DEFAULT_SERVER = 'http://localhost:5178';

/** Oldest extension the site still supports: an older installed one gets a required (not hideable) update notice. */
export const MIN_EXTENSION = '1.0.0';

export interface ExtensionRelease {
  version: string;
  notes: string[];
  minVersion: string;
}

let release: ExtensionRelease | null = null;

/** Version shipped from extension/manifest.json + its notes from extension/release.json. */
export async function latestExtension(): Promise<ExtensionRelease> {
  if (release) return release;
  const { version } = JSON.parse(await readFile(join(DIR, 'manifest.json'), 'utf8')) as { version: string };
  const notes = JSON.parse(await readFile(join(DIR, 'release.json'), 'utf8')) as Record<string, string[]>;
  release = { version, notes: notes[version] ?? [], minVersion: MIN_EXTENSION };
  return release;
}

const LOCAL_HOST = /^[a-z*]+:\/\/(localhost|127\.0\.0\.1)(:[0-9*]+)?(\/|$)/i;

/** True for http(s)://localhost or 127.0.0.1 (any port). */
export function isLocalOrigin(origin: string): boolean {
  return LOCAL_HOST.test(origin);
}

type Manifest = {
  host_permissions?: string[];
  content_scripts?: { matches?: string[] }[];
  externally_connectable?: { matches?: string[] };
  [k: string]: unknown;
};

/**
 * The manifest as served from `origin`: its own `origin/*` host permission added, and when the
 * origin is a public one, the localhost / 127.0.0.1 entries (host permissions, content script and
 * externally_connectable matches) dropped: they are for development only. A content script left
 * with no matches is removed (Chrome refuses empty ones). Pure; the input is not changed.
 */
export function publicManifest(input: Manifest, origin: string): Manifest {
  const m: Manifest = structuredClone(input);
  const pattern = `${origin}/*`;
  const hosts = m.host_permissions ?? [];
  if (!hosts.includes(pattern)) hosts.push(pattern);
  m.host_permissions = hosts;
  if (isLocalOrigin(origin)) return m;
  const keep = (list: string[]) => list.filter((p) => !LOCAL_HOST.test(p));
  m.host_permissions = keep(m.host_permissions);
  if (m.content_scripts) {
    m.content_scripts = m.content_scripts
      .map((cs) => (cs.matches ? { ...cs, matches: keep(cs.matches) } : cs))
      .filter((cs) => !cs.matches || cs.matches.length > 0);
  }
  if (m.externally_connectable?.matches) {
    m.externally_connectable = { ...m.externally_connectable, matches: keep(m.externally_connectable.matches) };
  }
  return m;
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
    if (rel === 'manifest.json') text = JSON.stringify(publicManifest(JSON.parse(text), origin), null, 2);
    files[path] = strToU8(text);
  }
  return zipSync(files, { level: 6 });
}

/**
 * Origin as the browser saw it. The host comes from Host (nginx keeps it via proxy.conf,
 * Cloudflare routes by it), never from X-Forwarded-Host: proxies append to that one, so its first
 * value is whatever the client wrote. The scheme is the last X-Forwarded-Proto (nginx sets it).
 * Still client-influenced: callers only print one of our own origins (see origins.ts).
 */
export function requestOrigin(headers: Record<string, string | string[] | undefined>, fallbackProto = 'http'): string {
  const last = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v)?.split(',').pop()?.trim() || undefined;
  const proto = last(headers['x-forwarded-proto']) ?? fallbackProto;
  const host = last(headers.host) ?? 'localhost:5178';
  return `${proto}://${host}`;
}
