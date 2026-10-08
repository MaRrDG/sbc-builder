// Signed-out games are stateless on the server: the guesses so far travel in an HMAC-signed state
// token (so they cannot be edited), and a Practice answer travels AES-256-GCM encrypted (so it cannot
// be read). Keys are derived from one server secret (service.ts dailySecret()).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_GUESSES = 5;
export interface GameState { k: string; g: number[] }
export interface Practice { id: string; a: number; exp: number }

const keys = new Map<string, Buffer>();
function key(secret: string, info: 'state' | 'practice'): Buffer {
  const id = `${info}:${secret}`;
  let k = keys.get(id);
  if (!k) keys.set(id, (k = Buffer.from(hkdfSync('sha256', secret, 'fc-solver-daily', info, 32))));
  return k;
}

const mac = (secret: string, body: string) => createHmac('sha256', key(secret, 'state')).update(body).digest();

export function signState(secret: string, s: GameState): string {
  const body = Buffer.from(JSON.stringify({ k: s.k, g: s.g })).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyState(secret: string, token: unknown, k: string): GameState | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const want = mac(secret, body);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<GameState>;
    if (s.k !== k || !Array.isArray(s.g) || s.g.length > MAX_GUESSES || !s.g.every((x) => Number.isInteger(x) && x > 0)) return null;
    return { k: s.k, g: s.g };
  } catch {
    return null;
  }
}

export function sealPractice(secret: string, p: Practice): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret, 'practice'), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(p), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

export function openPractice(secret: string, token: unknown, now: number): Practice | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const buf = Buffer.from(token, 'base64url');
  if (buf.length < 29) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key(secret, 'practice'), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')) as Partial<Practice>;
    if (typeof p.id !== 'string' || !Number.isInteger(p.a) || typeof p.exp !== 'number' || p.exp <= now) return null;
    return { id: p.id, a: p.a as number, exp: p.exp };
  } catch {
    return null;
  }
}
