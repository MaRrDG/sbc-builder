// Before sign-in, solver settings were stored per browser access key (sbc-options-<first 8 chars>).
// Keys now stay in the extension; this moves those settings to the persona id, once per key.
import { api } from './api';

const KEYS = 'sbc-account-keys';
const PREFIXES = ['sbc-options-', 'sbc-local-options-', 'sbc-results-'];

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? '[]');
  } catch {
    return [];
  }
}

export async function migrateLegacyKeys(): Promise<void> {
  // old extension links still carry #keys=...: take them, then scrub the address bar
  const m = window.location.hash.match(/keys=([\w,-]+)/);
  if (m) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  const keys = [...new Set([...(m ? m[1].split(',').filter(Boolean) : []), ...read()])];
  if (!keys.length) return;
  try {
    const { map } = await api.legacyKeys(keys);
    for (const [prefix, personaId] of Object.entries(map))
      for (const p of PREFIXES) {
        const old = localStorage.getItem(p + prefix);
        if (old !== null && localStorage.getItem(`${p}p${personaId}`) === null) localStorage.setItem(`${p}p${personaId}`, old);
        localStorage.removeItem(p + prefix);
      }
    // keys whose persona is not linked to this user yet stay for a later visit
    const left = keys.filter((k) => !(k.slice(0, 8) in map));
    if (left.length) localStorage.setItem(KEYS, JSON.stringify(left));
    else localStorage.removeItem(KEYS);
  } catch {
    /* offline or storage blocked: try again next load */
  }
}
