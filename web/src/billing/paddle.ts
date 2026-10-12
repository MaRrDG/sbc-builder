// Paddle.js v2, loaded once on demand (the upgrade screen). The browser only gets the public client
// token and price ids; Premium is switched on by the server's webhook, never from here.
import { ApiError, api, type BillingConfig } from '../api';

export type PaddleEventName = 'checkout.loaded' | 'checkout.completed' | 'checkout.closed' | 'checkout.error' | string;
export interface PaddleEvent {
  name?: PaddleEventName;
  data?: { transaction_id?: string; currency_code?: string; totals?: { total?: number | string } } | null;
  error?: unknown;
}

interface PricePreviewLine {
  price: { id: string };
  formattedTotals: { total: string };
}
interface PaddleJs {
  Environment: { set(env: 'sandbox'): void };
  Initialize(o: { token: string; eventCallback: (e: PaddleEvent) => void }): void;
  Checkout: { open(o: Record<string, unknown>): void; close(): void };
  PricePreview(o: { items: { priceId: string; quantity: number }[] }): Promise<{ data: { details: { lineItems: PricePreviewLine[] } } }>;
}
declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';
/** Class of the inline checkout's container. Never `paddle-frame…`: Paddle.js gives its iframes that class and
 *  removes old ones before opening, which would delete a container React still owns (insertBefore crash). */
export const FRAME_TARGET = 'fcs-checkout';

// one listener at a time: the screen that opened the checkout
let listener: ((e: PaddleEvent) => void) | null = null;
export const onPaddleEvent = (fn: ((e: PaddleEvent) => void) | null) => {
  listener = fn;
};

let config: Promise<BillingConfig | null> | null = null;
/** Billing settings, or null while billing is off (the server answers 404 billingOff). Asked once per page load. */
export function billingConfig(): Promise<BillingConfig | null> {
  config ??= api.billingConfig().catch((e) => {
    if (e instanceof ApiError && e.code === 'billingOff') return null;
    config = null; // a network blip: ask again next time
    return null;
  });
  return config;
}

let paddle: Promise<PaddleJs> | null = null;
export function loadPaddle(c: BillingConfig): Promise<PaddleJs> {
  paddle ??= new Promise<PaddleJs>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => {
      const p = window.Paddle;
      if (!p) return reject(new Error('Paddle.js did not load'));
      if (c.env === 'sandbox') p.Environment.set('sandbox');
      p.Initialize({ token: c.clientToken, eventCallback: (e) => listener?.(e) });
      resolve(p);
    };
    s.onerror = () => {
      paddle = null;
      s.remove();
      reject(new Error('Paddle.js did not load'));
    };
    document.head.appendChild(s);
  });
  return paddle;
}

/** Localised totals per price id (currency and tax for the visitor's country); empty on failure. */
export async function pricePreview(p: PaddleJs, priceIds: string[]): Promise<Record<string, string>> {
  try {
    const r = await p.PricePreview({ items: priceIds.map((priceId) => ({ priceId, quantity: 1 })) });
    return Object.fromEntries(r.data.details.lineItems.map((l) => [l.price.id, l.formattedTotals.total]));
  } catch {
    return {};
  }
}
