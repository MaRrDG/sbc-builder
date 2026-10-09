import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsubToken } from '../evo-rules.js';
import { checkReminderUnsub, CUTOFF_MS, dayUnit, eligibility, inWindow, LEAD_MS, reminderKey, reminderMail, reminderUnsubToken, reminderWindow, type ReminderUser } from './reminder-rules.js';

const DROP = Date.UTC(2026, 9, 9, 17, 1); // 20:01 Bucharest (UTC+3)
const MIN = 60_000;

test('window: 17:00 to 20:00 Bucharest for the 20:01 drop', () => {
  const w = reminderWindow(DROP);
  assert.equal(w.from, Date.UTC(2026, 9, 9, 14, 0));
  assert.equal(w.until, Date.UTC(2026, 9, 9, 17, 0));
  assert.equal(LEAD_MS - CUTOFF_MS, 3 * 3600_000);
});

test('inWindow: due at 17:00, catch-up until 20:00, never after', () => {
  assert.equal(inWindow(DROP - LEAD_MS - MIN, DROP), false); // 16:59
  assert.equal(inWindow(DROP - LEAD_MS, DROP), true); // 17:00
  assert.equal(inWindow(DROP - 90 * MIN, DROP), true); // 18:31, server was down at 17:00
  assert.equal(inWindow(DROP - 2 * MIN, DROP), true); // 19:59
  assert.equal(inWindow(DROP - CUTOFF_MS, DROP), false); // 20:00
  assert.equal(inWindow(DROP + MIN, DROP + 24 * 3600_000), false); // just after the drop: next day's window is hours away
});

const user = (o: Partial<ReminderUser> = {}): ReminderUser => ({
  dailyReminder: true, tier: 'premium', email: 'a@b.c',
  plays: [{ day: 8, won: true, guesses: 3 }, { day: 9, won: true, guesses: 2 }], ...o,
});

test('eligibility: opted in, Premium, streak alive, today unplayed', () => {
  assert.deepEqual(eligibility(user(), 10), { send: true, streak: 2 });
  assert.deepEqual(eligibility(user({ dailyReminder: false }), 10), { send: false, reason: 'off' });
  assert.deepEqual(eligibility(user({ email: '' }), 10), { send: false, reason: 'noEmail' });
  assert.deepEqual(eligibility(user({ tier: 'free' }), 10), { send: false, reason: 'free' }); // Premium ended: pref kept, no mail
  assert.deepEqual(eligibility(user({ tier: null }), 10), { send: false, reason: 'plan' });
});

test('eligibility: played today (won or lost) means no reminder', () => {
  assert.deepEqual(eligibility(user({ plays: [...user().plays, { day: 10, won: false, guesses: 5 }] }), 10), { send: false, reason: 'played' });
  assert.deepEqual(eligibility(user({ plays: [...user().plays, { day: 10, won: true, guesses: 1 }] }), 10), { send: false, reason: 'played' });
});

test('eligibility: no active streak (lost or skipped yesterday) means no reminder', () => {
  assert.deepEqual(eligibility(user({ plays: [{ day: 8, won: true, guesses: 3 }, { day: 9, won: false, guesses: 5 }] }), 10), { send: false, reason: 'noStreak' });
  assert.deepEqual(eligibility(user({ plays: [{ day: 8, won: true, guesses: 3 }] }), 10), { send: false, reason: 'noStreak' });
  assert.deepEqual(eligibility(user({ plays: [] }), 10), { send: false, reason: 'noStreak' });
});

test('dayUnit plurals', () => {
  assert.deepEqual([1, 2, 19, 20, 101, 120].map((n) => dayUnit('ro', n)), ['zi', 'zile', 'zile', 'de zile', 'zile', 'de zile']);
  assert.deepEqual([1, 2].map((n) => dayUnit('it', n)), ['giorno', 'giorni']);
  assert.deepEqual([1, 2].map((n) => dayUnit('en', n)), ['day', 'days']);
});

test('reminderMail: streak, link, unsubscribe in every language, html escaped', () => {
  const links = { dailyUrl: 'https://x.test/daily', unsubUrl: 'https://x.test/api/daily/unsubscribe?u=a&t=b' };
  const en = reminderMail('en', 7, links);
  assert.match(en.subject, /7-day/);
  assert.match(en.text, /https:\/\/x\.test\/daily/);
  assert.match(en.html, /u=a&amp;t=b/);
  assert.match(reminderMail('ro', 20, links).subject, /seria de 20 de zile/);
  assert.match(reminderMail('it', 1, links).subject, /serie di 1 giorno/);
});

test('reminderKey: same day + users = same key, order-free; another day differs', () => {
  assert.equal(reminderKey(10, ['b', 'a']), reminderKey(10, ['a', 'b']));
  assert.notEqual(reminderKey(10, ['a']), reminderKey(11, ['a']));
});

test('unsubscribe token: own HMAC, not interchangeable with the evolution one', () => {
  const tok = reminderUnsubToken('user_1', 's3cret');
  assert.equal(checkReminderUnsub('user_1', tok, 's3cret'), true);
  assert.equal(checkReminderUnsub('user_2', tok, 's3cret'), false);
  assert.equal(checkReminderUnsub('user_1', tok, 'other'), false);
  assert.equal(checkReminderUnsub('user_1', unsubToken('user_1', 's3cret'), 's3cret'), false);
});
