// Every EA account (persona) gets its own session, request queue and data folder:
// data/accounts/<personaId>/{account,club,sets,challenges/*}.json
import { readdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { Utas, content } from './ea.js';
import { RequestMeter } from './meter.js';
import { webAppOpen } from './jobs.js';
import { DATA_DIR, readCache, writeCache } from './store.js';

export interface AccountInfo {
  personaId: number;
  personaName: string;
  clubName: string;
  sid: string | null;
  sidUpdatedAt: number;
  accessKey: string; // secret the browser uses to read this account's data
  extVersion?: string | null; // extension version that last reported a session
  /** 'client': extension 0.7+ makes every EA request from the web app tab; the server keeps no SID. */
  mode?: 'client';
}

export class Account {
  utas: Utas | null = null;
  readonly meter: RequestMeter;

  constructor(public info: AccountInfo) {
    this.meter = new RequestMeter(`accounts/${info.personaId}/ea-requests`);
    if (info.sid) this.attach(info.sid);
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

  /** Live: the server can sync now (legacy: holds a SID; client mode: a web app tab is polling). */
  get hasSession() {
    return this.clientMode ? webAppOpen(this) : !!this.utas;
  }

  /** From now on this account syncs through the web app tab; drop any stored SID. */
  useClientMode(extVersion?: string) {
    this.info.mode = 'client';
    this.info.sid = null;
    this.utas = null;
    this.info.sidUpdatedAt = Date.now(); // start of this web app session (sync grace period)
    if (extVersion) this.info.extVersion = extVersion;
  }

  attach(sid: string) {
    this.utas = new Utas(sid, this.meter);
    this.utas.onExpired = () => {
      this.utas = null;
      this.info.sid = null;
      void this.save();
    };
  }

  save() {
    return writeCache(this.key('account'), this.info);
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
    const acc = new Account({ ...c.data, accessKey: c.data.accessKey || newKey() });
    if (!c.data.accessKey) await acc.save();
    accounts.set(acc.id, acc);
  }
}

/** A fresh X-UT-SID arrived (from the extension or pasted): find out whose it is. */
export async function registerSession(
  sid: string, contentGuid?: string, extVersion?: string,
): Promise<{ account: Account; isNew: boolean }> {
  if (contentGuid) content.guid = contentGuid;
  const known = [...accounts.values()].find((a) => a.info.sid === sid && a.hasSession);
  if (known) {
    if (extVersion && known.info.extVersion !== extVersion) {
      known.info.extVersion = extVersion;
      await known.save();
    }
    return { account: known, isNew: false };
  }
  const { userInfo } = await new Utas(sid).userInfo();
  let account = accounts.get(userInfo.personaId);
  if (account?.clientMode) {
    // an old extension in another browser: prove the session, but never keep the SID again
    account.info.extVersion = extVersion ?? account.info.extVersion;
    await account.meter.record('GET', '/usermassinfo', 200);
    await account.save();
    return { account, isNew: false };
  }
  const isNew = !account || account.info.sid !== sid;
  if (!account) {
    account = new Account({ ...userInfo, sid: null, sidUpdatedAt: 0, accessKey: newKey() });
    accounts.set(account.id, account);
  }
  account.info.personaName = userInfo.personaName;
  account.info.clubName = userInfo.clubName;
  account.info.sid = sid;
  account.info.sidUpdatedAt = Date.now();
  account.info.extVersion = extVersion ?? null;
  account.attach(sid);
  // the "who is this?" call above ran before we knew the account; count it now
  await account.meter.record('GET', '/usermassinfo', 200);
  await account.save();
  return { account, isNew };
}

let verifyWindow = { start: 0, count: 0 };

/**
 * Extension 0.7+: the web app told the extension who is logged in. `proved`: this call checked a SID with EA.
 * With a key already held for that persona nothing reaches EA. Otherwise (new account or new
 * browser) the SID is sent once and proven with one /usermassinfo call, then thrown away.
 */
export async function hello(opts: {
  key?: string | null; personaId?: number; sid?: string; contentGuid?: string; extVersion?: string;
}): Promise<{ account: Account; proved: boolean } | { needSid: true }> {
  if (opts.contentGuid) content.guid = opts.contentGuid;
  const byKey = accountByKey(opts.key);
  if (byKey && opts.personaId === byKey.id) {
    byKey.useClientMode(opts.extVersion);
    await byKey.save();
    return { account: byKey, proved: false };
  }
  if (!opts.sid) return { needSid: true };
  // proving sessions calls EA: a handful per minute is plenty for a friends' server
  if (Date.now() - verifyWindow.start > 60_000) verifyWindow = { start: Date.now(), count: 0 };
  if (++verifyWindow.count > 10) throw Object.assign(new Error('Too many new sessions, try again in a minute.'), { statusCode: 429 });
  const { userInfo } = await new Utas(opts.sid).userInfo();
  if (opts.personaId && opts.personaId !== userInfo.personaId)
    throw Object.assign(new Error('Session does not belong to that account.'), { statusCode: 403 });
  let account = accounts.get(userInfo.personaId);
  if (!account) {
    account = new Account({ ...userInfo, sid: null, sidUpdatedAt: 0, accessKey: newKey() });
    accounts.set(account.id, account);
  }
  account.info.personaName = userInfo.personaName;
  account.info.clubName = userInfo.clubName;
  account.useClientMode(opts.extVersion);
  await account.meter.record('GET', '/usermassinfo', 200);
  await account.save();
  return { account, proved: true };
}

export function listAccounts() {
  return [...accounts.values()];
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
