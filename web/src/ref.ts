// An invite link (/?ref=CODE): the code is kept until the signed-in user applies or dismisses it.
export const REF_KEY = 'sbc-ref';

export function refFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('ref');
  if (!raw) return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

export const shouldOfferRef = (ref: string | null, s: { usedInvite: boolean; ownCode: string }) => !!ref && !s.usedInvite && ref !== s.ownCode;

export function readRef(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}
export function saveRef(code: string) {
  try {
    localStorage.setItem(REF_KEY, code);
  } catch {
    /* private mode: the link just does not prefill */
  }
}
export function clearRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* same */
  }
}
