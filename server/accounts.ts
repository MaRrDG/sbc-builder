// Every EA account (persona) gets its own session, request queue and data folder:
// data/accounts/<personaId>/{account,club,sets,challenges/*}.json
import { readdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { Utas, content } from './ea.js';
import { RequestMeter } from './meter.js';
import { webAppOpen } from './jobs.js';
import { DATA_DIR, readCache, writeCache } from './store.js';
import { noteStoreVersion, type ExtInstall } from './extension.js';

export interface AccountInfo {
  personaId: number;
  personaName: string;
  clubName: string;
  sid: string | null;
  sidUpdatedAt: number;
  accessKey: string; // secret the browser uses to read this account's data
  extVersion?: string | null; // extension version that last reported a session
  extInstall?: ExtInstall | null; // where that extension came from (1.0.7+; older ones say nothing)
  /** 'client': extension 0.7+ makes every EA request from the web app tab; the server keeps no SID. */
  mode?: 'client';
}

export class Account {
  readonly meter: RequestMeter;
  /** Set by forgetAccount (account deletion): a racing request holding this object must not write account.json again. */
  dropped = false;

  constructor(public info: AccountInfo) {
    this.meter = new RequestMeter(`accounts/${info.personaId}/ea-requests`, info.personaId);
  }

  get id() {
    return this.info.personaId;
  }

  key(name: string) {
    return `accounts/${this.id}/${name}`;
  }

  get clientMode() {
    return this.info.mode === 'client';
  }

  /** Live: the server can sync now (a web app tab is polling). */
  get hasSession() {
    return this.clientMode && webAppOpen(this);
  }

  /** From now on this account syncs through the web app tab; drop any stored SID. */
  useClientMode(extVersion?: string, extInstall?: ExtInstall) {
    this.info.mode = 'client';
    this.info.sid = null;
    this.info.sidUpdatedAt = Date.now(); // start of this web app session (sync grace period)
    if (extVersion) this.reportExtension(extVersion, extInstall);
  }

  /** The extension said which version it is (and, from 1.0.7, where it came from). True when something changed. */
  reportExtension(version: string, install?: ExtInstall): boolean {
    const changed = this.info.extVersion !== version || (!!install && this.info.extInstall !== install);
    this.info.extVersion = version;
    if (install) this.info.extInstall = install;
    if (this.info.extInstall === 'store') noteStoreVersion(version);
    return changed;
  }

  async save() {
    if (this.dropped) return;
    await writeCache(this.key('account'), this.info);
  }

  /** Public view: never leak the SID or the access key. */
  toJSON() {
    const { sid: _sid, accessKey: _key, ...rest } = this.info;
    return { ...rest, session: this.hasSession };
  }
}

const accounts = new Map<number, Account>();
const newKey = () => randomBytes(24).toString('base64url');

export async function loadAccounts() {
  let dirs: string[] = [];
  try {
    dirs = await readdir(join(DATA_DIR, 'accounts'));
  } catch {
    return;
  }
  for (const d of dirs) {
    const c = await readCache<AccountInfo>(`accounts/${d}/account`);
    if (!c) continue;
    const acc = new Account({ ...c.data, sid: null, accessKey: c.data.accessKey || newKey() });
    if (!c.data.accessKey || c.data.sid) await acc.save(); // legacy SIDs are never kept
    if (acc.info.extInstall === 'store' && acc.info.extVersion) noteStoreVersion(acc.info.extVersion);
    accounts.set(acc.id, acc);
  }
}

let verifyWindow = { start: 0, count: 0 };

/**
 * Extension 0.7+: the web app told the extension who is logged in. `proved`: this call checked a SID with EA.
 * With a key already held for that persona nothing reaches EA. Otherwise (new account or new
 * browser) the SID is sent once and proven with one /usermassinfo call, then thrown away.
 */
export async function hello(opts: {
  key?: string | null; personaId?: number; sid?: string; contentGuid?: string; extVersion?: string; extInstall?: ExtInstall;
}): Promise<{ account: Account; proved: boolean } | { needSid: true }> {
  const byKey = accountByKey(opts.key);
  if (byKey && opts.personaId === byKey.id) {
    // a held key is the extension that already proved this persona. Its content guid is NOT taken: the
    // guid is global (card art for everyone), so only a session EA just accepted may set it (below)
    byKey.useClientMode(opts.extVersion, opts.extInstall);
    await byKey.save();
    return { account: byKey, proved: false };
  }
  if (!opts.sid) return { needSid: true };
  // proving sessions calls EA: capped for the whole server too (per IP: /api/hello in index.ts)
  if (Date.now() - verifyWindow.start > 60_000) verifyWindow = { start: Date.now(), count: 0 };
  if (++verifyWindow.count > 30) throw Object.assign(new Error('Too many new sessions, try again in a minute.'), { statusCode: 429 });
  const { userInfo } = await new Utas(opts.sid).userInfo();
  if (opts.personaId && opts.personaId !== userInfo.personaId)
    throw Object.assign(new Error('Session does not belong to that account.'), { statusCode: 403 });
  if (opts.contentGuid) content.guid = opts.contentGuid; // only from a session EA just accepted
  let account = accounts.get(userInfo.personaId);
  if (!account) {
    account = new Account({ ...userInfo, sid: null, sidUpdatedAt: 0, accessKey: newKey() });
    accounts.set(account.id, account);
  }
  account.info.personaName = userInfo.personaName;
  account.info.clubName = userInfo.clubName;
  account.useClientMode(opts.extVersion, opts.extInstall);
  await account.meter.record('GET', '/usermassinfo', 200);
  await account.save();
  return { account, proved: true };
}

export function listAccounts() {
  return [...accounts.values()];
}

/** Drop an account from memory (account deletion purges its folder right after). */
export function forgetAccount(personaId: number): void {
  const a = accounts.get(personaId);
  if (a) a.dropped = true;
  accounts.delete(personaId);
}

export function accountById(id: number): Account | null {
  return accounts.get(id) ?? null;
}

function keyMatches(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Resolve an access key to its account (null if unknown). */
export function accountByKey(key: string | undefined | null): Account | null {
  if (!key) return null;
  for (const a of accounts.values()) if (keyMatches(a.info.accessKey, key)) return a;
  return null;
}
