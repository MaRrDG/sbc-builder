import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerVisible, installOffer, isIos, isPhone, isStandalone } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

test('isStandalone: display-mode media query or iOS navigator.standalone', () => {
  assert.equal(isStandalone(true, undefined), true);
  assert.equal(isStandalone(false, true), true);
  assert.equal(isStandalone(false, false), false);
  assert.equal(isStandalone(false, undefined), false);
});

test('isIos: iPhone, and iPadOS that reports a Mac user agent but has touch', () => {
  assert.equal(isIos(IPHONE, 5), true);
  assert.equal(isIos(IPAD_DESKTOP_UA, 5), true);
  assert.equal(isIos(IPAD_DESKTOP_UA, 0), false); // a real Mac
  assert.equal(isIos(ANDROID, 5), false);
  assert.equal(isIos(DESKTOP, 0), false);
});

test('isPhone: mobile phones only, not tablets or desktops', () => {
  assert.equal(isPhone(IPHONE), true);
  assert.equal(isPhone(ANDROID), true);
  assert.equal(isPhone(ANDROID_TABLET), false);
  assert.equal(isPhone(DESKTOP), false);
});

test('installOffer: nothing when installed; native prompt when the browser gave one; iOS steps on iOS', () => {
  assert.equal(installOffer({ standalone: true, ios: false, canPrompt: true }), null);
  assert.equal(installOffer({ standalone: true, ios: true, canPrompt: false }), null);
  assert.equal(installOffer({ standalone: false, ios: false, canPrompt: true }), 'prompt');
  assert.equal(installOffer({ standalone: false, ios: true, canPrompt: false }), 'ios');
  assert.equal(installOffer({ standalone: false, ios: false, canPrompt: false }), null); // desktop Firefox, already installed elsewhere, …
});

test('bannerVisible: phones with an offer, once', () => {
  assert.equal(bannerVisible({ phone: true, offer: 'prompt', dismissedAt: null, installedAt: null }), true);
  assert.equal(bannerVisible({ phone: true, offer: 'ios', dismissedAt: null, installedAt: null }), true);
  assert.equal(bannerVisible({ phone: false, offer: 'prompt', dismissedAt: null, installedAt: null }), false);
  assert.equal(bannerVisible({ phone: true, offer: null, dismissedAt: null, installedAt: null }), false);
  assert.equal(bannerVisible({ phone: true, offer: 'prompt', dismissedAt: 1, installedAt: null }), false);
  assert.equal(bannerVisible({ phone: true, offer: 'prompt', dismissedAt: null, installedAt: 1 }), false);
});
