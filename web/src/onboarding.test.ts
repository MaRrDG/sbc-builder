import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingMode } from './onboarding';

test('phone wins: the extension cannot run there', () => {
  assert.equal(onboardingMode({ present: true, phone: true, fromInstall: true }), 'phone');
});
test('extension present or just installed: linking', () => {
  assert.equal(onboardingMode({ present: true, phone: false, fromInstall: false }), 'linking');
  assert.equal(onboardingMode({ present: false, phone: false, fromInstall: true }), 'linking');
});
test('otherwise: install', () => {
  assert.equal(onboardingMode({ present: false, phone: false, fromInstall: false }), 'install');
});

test('Chrome Web Store first only on the production site', async () => {
  const { storeFirst } = await import('./onboarding');
  assert.equal(storeFirst('https://fc-solver.app'), true);
  assert.equal(storeFirst('https://sbc-builder.mario-theodor.ro'), false);
  assert.equal(storeFirst('http://localhost:5188'), false);
});
