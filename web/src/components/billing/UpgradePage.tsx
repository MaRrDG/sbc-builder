// /dashboard/upgrade: a checkout page of its own (no sidebar), dark summary left, Paddle's inline form on a
// white card right; stacked under 860px. Premium comes from Paddle's webhook to our server; after
// "checkout.completed" this screen only waits for /api/me to say so.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, CheckCircle, Crown, ShieldCheck } from '@phosphor-icons/react';
import { api, type BillingConfig, type BillingState, type PlanInfo } from '../../api';
import { useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { formatEur, proPrice, yearlySaving } from '../../landing/pricing-rules';
import { FRAME_TARGET, billingConfig, loadPaddle, onPaddleEvent, pricePreview, type PaddleEvent } from '../../billing/paddle';
import { track, trackPayment } from '../../track';
import { LangMenu } from '../LangMenu';

type Interval = 'month' | 'year';
type Phase = 'loading' | 'off' | 'pick' | 'activating' | 'slow' | 'done';

const POLL_MS = 2000;
const POLL_MAX_MS = 30_000;
const BENEFITS = ['f1', 'f2', 'f7', 'f5', 'f4', 'f6'];

export function UpgradePage({ plan, billing, onActivated, onSettings, onBack }: {
  plan: PlanInfo | null;
  billing: BillingState | null;
  onActivated: () => Promise<unknown>;
  onSettings: () => void;
  onBack: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [period, setPeriod] = useState<Interval>('month');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const opened = useRef<Interval | null>(null);
  const previewed = useRef(false);
  // admins and lifetime Premium have nothing to buy (the server refuses them too: alreadyPremium)
  const lifetime = plan?.source === 'admin' || (plan?.source === 'paid' && plan.premiumUntil === null);
  const subscribed = !!billing?.subscribed;

  useEffect(() => {
    let live = true;
    void billingConfig().then((c) => {
      if (!live) return;
      setConfig(c);
      setPhase(c ? 'pick' : 'off');
    });
    return () => {
      live = false;
    };
  }, []);

  // after payment: wait for the webhook to reach the server (seen through /api/me)
  const waitForPremium = useCallback(async () => {
    setPhase('activating');
    const until = Date.now() + POLL_MAX_MS;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const me = await api.me().catch(() => null);
      if (me?.billing?.subscribed) {
        await onActivated();
        setPhase('done');
        return;
      }
    }
    setPhase('slow');
  }, [onActivated]);

  const onEvent = useCallback(
    (e: PaddleEvent) => {
      if (e.name === 'checkout.loaded') setFrameReady(true);
      if (e.name === 'checkout.completed') {
        track('checkout_done', { interval: opened.current ?? 'month' });
        const total = Number(e.data?.totals?.total ?? 0);
        if (e.data?.transaction_id && e.data.currency_code && total > 0) trackPayment(Math.round(total * 100), e.data.currency_code, e.data.transaction_id);
        void waitForPremium();
      }
      if (e.name === 'checkout.error') setError(t('billing.checkoutError'));
    },
    [t, waitForPremium],
  );

  const canBuy = phase === 'pick' && !lifetime && !subscribed;

  // open (or reopen on a plan switch) the inline checkout
  useEffect(() => {
    if (!config || !canBuy) return;
    let live = true;
    onPaddleEvent(onEvent);
    setError(null);
    setFrameReady(false);
    void (async () => {
      try {
        const [p, data] = await Promise.all([loadPaddle(config), api.billingCheckout(period)]);
        if (!live) return;
        if (!previewed.current) {
          previewed.current = true;
          void pricePreview(p, [config.prices.month, config.prices.year]).then(setPrices);
        }
        if (opened.current) p.Checkout.close();
        p.Checkout.open({
          items: [{ priceId: data.priceId, quantity: 1 }],
          customer: data.customerId ? { id: data.customerId } : data.email ? { email: data.email } : undefined,
          customData: data.customData,
          settings: {
            displayMode: 'inline',
            variant: 'one-page',
            theme: 'light',
            locale: lang,
            frameTarget: FRAME_TARGET,
            frameInitialHeight: 450,
            frameStyle: 'width: 100%; min-width: 286px; background-color: transparent; border: none;',
            allowLogout: false,
          },
        });
        opened.current = period;
        track('checkout_open', { interval: period });
      } catch (e) {
        if (live) setError(e instanceof Error && e.message === 'Paddle.js did not load' ? t('billing.loadError') : errorText(e, t));
      }
    })();
    return () => {
      live = false;
    };
  }, [config, canBuy, period, lang, onEvent, t]);

  // leaving the screen closes the checkout
  useEffect(
    () => () => {
      onPaddleEvent(null);
      if (opened.current) window.Paddle?.Checkout.close();
      opened.current = null;
    },
    [],
  );

  const eur = (n: number) => formatEur(n, lang);
  // Paddle's localised total (currency and tax for the visitor's country), else the landing price
  const shown = (i: Interval) => (config && prices[config.prices[i]]) || eur(proPrice(i === 'month' ? 'monthly' : 'yearly').billed);

  const top = (
    <div className="checkout-top">
      <button type="button" className="checkout-back" onClick={onBack}>
        <ArrowLeft weight="bold" aria-hidden="true" />
        <img src="/brand/logo-on-dark.svg" alt="" width="124" height="32" />
        <span className="sr-only">{t('billing.back')}</span>
      </button>
      <LangMenu lang={lang} setLang={setLang} label={t('top.language')} compact />
    </div>
  );

  const notice = (title: string, body: string, action?: ReactNode) => (
    <div className="checkout checkout-single">
      {top}
      <section className="checkout-notice" role="status">
        <h1><CheckCircle weight="fill" aria-hidden="true" /> {title}</h1>
        <p>{body}</p>
        {action}
      </section>
    </div>
  );
  const toSettings = <button type="button" className="ghost bordered" onClick={onSettings}>{t('billing.toSettings')}</button>;

  if (phase === 'loading') return <div className="checkout checkout-single">{top}<p className="muted" role="status">{t('admin.loading')}</p></div>;
  if (phase === 'done') return notice(t('billing.doneTitle'), t('billing.doneBody'), toSettings);
  if (phase === 'activating') return notice(t('billing.activatingTitle'), t('billing.activatingBody'));
  if (phase === 'slow') return notice(t('billing.slowTitle'), t('billing.slowBody'), toSettings);
  if (phase === 'off') return notice(t('billing.offTitle'), t('billing.offBody'));
  if (lifetime) return notice(t('billing.haveTitle'), t('billing.lifetimeBody'), toSettings);
  if (subscribed) return notice(t('billing.haveTitle'), t('billing.subscribedBody'), toSettings);

  return (
    <div className="checkout">
      <section className="checkout-summary" aria-labelledby="checkout-title">
        <div className="checkout-col">
          {top}
          <div className="checkout-offer">
            <p className="checkout-kicker">{t('billing.subscribeTo')}</p>
            <h1 id="checkout-title"><Crown weight="fill" aria-hidden="true" /> {t('billing.product')}</h1>
            <p className="checkout-price">
              <b>{shown(period)}</b> <span>{period === 'month' ? t('billing.perMonthShort') : t('billing.perYearShort')}</span>
            </p>
            <p className="checkout-billed">
              {period === 'month' ? t('billing.billedMonthly') : t('billing.billedYearly', { perMonth: eur(proPrice('yearly').perMonth) })}
            </p>
          </div>
          <fieldset className="checkout-period">
            <legend className="sr-only">{t('landing.price.period')}</legend>
            {(['month', 'year'] as const).map((i) => (
              <label key={i} className={period === i ? 'on' : ''}>
                <input type="radio" name="interval" value={i} checked={period === i} onChange={() => setPeriod(i)} />
                {i === 'month' ? t('landing.price.monthly') : t('landing.price.yearly')}
                {i === 'year' && <small>{t('landing.price.save', { amount: eur(yearlySaving()) })}</small>}
              </label>
            ))}
          </fieldset>
          <ul className="checkout-feats">
            {BENEFITS.map((k) => (
              <li key={k}><Check weight="bold" aria-hidden="true" /> {t(`landing.price.pro.${k}`)}</li>
            ))}
          </ul>
          <div className="checkout-fine">
            <p><ShieldCheck weight="bold" aria-hidden="true" /> {t('billing.guarantee')}</p>
            <p>
              {t('billing.mor')} <a href="/refunds" target="_blank" rel="noopener">{t('billing.refunds')}<span className="sr-only"> {t('nav.newTab')}</span></a>
            </p>
          </div>
        </div>
      </section>
      <section className="checkout-pay" aria-label={t('billing.payment')}>
        <div className="checkout-card">
          {error && <p className="checkout-error" role="alert">{error}</p>}
          {!frameReady && !error && <p className="checkout-loading" role="status">{t('billing.loadingCheckout')}</p>}
          {/* Paddle's form ends with its own total ("€5.00 now, then …"), so no total of ours */}
          <div className={FRAME_TARGET} />
        </div>
      </section>
    </div>
  );
}
