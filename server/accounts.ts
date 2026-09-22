// Every EA account (persona) gets its own session, request queue and data folder:
// data/accounts/<personaId>/{account,club,sets,challenges/*}.json
import { readdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { Utas, content } from './ea.js';
import { DATA_DIR, readCache, writeCache } from './store.js';

export interface AccountInfo {
  personaId: number;
  personaName: string;
  clubName: string;
  sid: string | null;
  sidUpdatedAt: number;
  accessKey: string; // secret the browser uses to read this account's data
}

export class Account {
  utas: Utas | null = null;

  constructor(public info: AccountInfo) {
    if (info.sid) this.attach(info.sid);
  }

  get id() {
    return this.info.personaId;
  }

  key(name: string) {
    return `accounts/${this.id}/${name}`;
  }

  get hasSession() {
    return !!this.utas;
  }

  attach(sid: string) {
    this.utas = new Utas(sid);
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
export async function registerSession(sid: string, contentGuid?: string): Promise<{ account: Account; isNew: boolean }> {
  if (contentGuid) content.guid = contentGuid;
  const known = [...accounts.values()].find((a) => a.info.sid === sid && a.hasSession);
  if (known) return { account: known, isNew: false };
  const { userInfo } = await new Utas(sid).userInfo();
  let account = accounts.get(userInfo.personaId);
  const isNew = !account || account.info.sid !== sid;
  if (!account) {
    account = new Account({ ...userInfo, sid: null, sidUpdatedAt: 0, accessKey: newKey() });
    accounts.set(account.id, account);
  }
  account.info.personaName = userInfo.personaName;
  account.info.clubName = userInfo.clubName;
  account.info.sid = sid;
  account.info.sidUpdatedAt = Date.now();
  account.attach(sid);
  await account.save();
  return { account, isNew };
}

export function listAccounts() {
  return [...accounts.values()];
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
