// Custom events for OpenWebTrack (cookieless script from ANALYTICS_SNIPPET, see docs/analytics.md).
// Only the events and props typed here, never personal data (no email, names, ids, usernames, codes, SBC names).
// Without the snippet (local dev), for admins, or when the script is blocked, every call does nothing.

type YN = 'yes' | 'no';
type Mode = 'daily' | 'practice';

export interface TrackEvents {
  cta_click: { where: 'header' | 'hero' | 'pricing' | 'premium' | 'invite' | 'daily' };
  signin_done: { method: 'google' | 'email'; new: YN };
  extension_linked: undefined;
  sync_done: { kind: 'club' | 'sbcs'; ok: YN };
  sbc_open: undefined;
  solve: { found: YN; deep: YN };
  daily_start: { mode: Mode; signed_in: YN };
  daily_end: { mode: Mode; won: YN; tries: number; streak?: string };
  daily_share: { mode: Mode };
  daily_leaderboard: undefined;
  daily_history: undefined;
  sbc_page_cta: { signed_in: YN };
  invite_copy: undefined;
  premium_view: { where: 'landing' | 'daily' | 'quota' };
  discord_click: { where: 'landing' | 'daily' | 'sidebar' | 'accounts' };
  reminder_on: undefined;
  checkout_open: { interval: 'month' | 'year' };
  checkout_done: { interval: 'month' | 'year' };
  pwa_install_prompt: { platform: 'android' | 'ios' };
  pwa_installed: undefined;
}

type Owt = { trackEvent?: (name: string, props?: Record<string, string>) => void; trackPayment?: (amountInCents: number, currency: string, transactionId: string) => void };
declare global {
  interface Window {
    owt?: Owt;
    _trk_disabled?: boolean;
  }
}

const NO_TRACK = 'sbc-no-track';

export const yn = (b: boolean): YN => (b ? 'yes' : 'no');

/** The tracker's limits: at most 10 props, string values up to 255 characters. */
export function cleanProps(props: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null) continue;
    if (Object.keys(out).length >= 10) break;
    out[k] = String(v).slice(0, 255);
  }
  return out;
}

export function streakBucket(n: number): string {
  return n <= 0 ? '0' : n < 7 ? '1-6' : n < 14 ? '7-13' : n < 30 ? '14-29' : '30+';
}

export function track<K extends keyof TrackEvents>(name: K, ...props: TrackEvents[K] extends undefined ? [] : [TrackEvents[K]]): void {
  try {
    if (typeof window === 'undefined' || window._trk_disabled) return;
    window.owt?.trackEvent?.(name, cleanProps(props[0] as Record<string, unknown> | undefined));
  } catch {
    /* analytics never breaks the app */
  }
}

/** A Paddle payment as revenue (amount, currency and Paddle's transaction id only, nothing about the user). */
export function trackPayment(amountInCents: number, currency: string, transactionId: string): void {
  try {
    if (typeof window === 'undefined' || window._trk_disabled) return;
    window.owt?.trackPayment?.(amountInCents, currency, transactionId);
  } catch {
    /* analytics never breaks the app */
  }
}

/** Admins are not counted: from now on, and on later loads (main.tsx calls applyNoTrack before the deferred tracker runs). */
export function disableTracking(): void {
  window._trk_disabled = true;
  try {
    localStorage.setItem(NO_TRACK, '1');
  } catch {
    /* storage blocked: this page load only */
  }
}

export function applyNoTrack(): void {
  try {
    if (localStorage.getItem(NO_TRACK)) window._trk_disabled = true;
  } catch {
    /* storage blocked */
  }
}
