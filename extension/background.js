// Watches the FC27 web app's own requests and tells the SBC Builder server:
//  1. the session id (X-UT-SID), so it can read your club and SBCs;
//  2. which club items you just used in a submitted SBC, so they leave the cached club
//     without another sync. Nothing is ever sent to EA by this extension.
const DEFAULT_SERVER = 'http://localhost:5178';
const UTAS = 'https://utas.mob.v1.prd.futc-ext.gcp.ea.com/ut/game/fc27/';

const state = () =>
  chrome.storage.local.get({ server: DEFAULT_SERVER, lastSid: null, contentGuid: null, accessKey: null, keys: [] });

async function pushSession(sid) {
  const { server, lastSid, contentGuid, keys, accessKey } = await state();
  if (sid === lastSid && accessKey) return;
  try {
    const res = await fetch(`${server}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, contentGuid }),
    });
    const body = await res.json().catch(() => ({}));
    const who = body.account ? `${body.account.personaName} (${body.account.clubName})` : '';
    await chrome.storage.local.set({
      lastSid: res.ok ? sid : null,
      accessKey: body.accessKey ?? null,
      keys: body.accessKey ? [...new Set([body.accessKey, ...keys])] : keys,
      lastStatus: res.ok ? `Connected: ${who}` : `Server error: ${body.error ?? res.status}`,
      lastAt: Date.now(),
    });
  } catch {
    await chrome.storage.local.set({ lastStatus: `Server not reachable at ${server}`, lastAt: Date.now() });
  }
}

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const h = details.requestHeaders?.find((x) => x.name.toLowerCase() === 'x-ut-sid');
    if (h?.value) pushSession(h.value);
  },
  { urls: [`${UTAS}*`] },
  ['requestHeaders'],
);

// The content CDN path contains a GUID that changes between game updates.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const m = details.url.match(/\/web-app\/content\/([0-9A-F-]{36})\//i);
    if (m) chrome.storage.local.set({ contentGuid: m[1] });
  },
  { urls: ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/*'] },
);

// 1) The web app saves the SBC squad: PUT sbs/challenge/{id}/squad {players:[{itemData:{id,dream}}]}
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== 'PUT') return;
    const m = details.url.match(/\/sbs\/challenge\/(\d+)\/squad(?:\?|$)/);
    const raw = details.requestBody?.raw?.[0]?.bytes;
    if (!m || !raw) return;
    try {
      const body = JSON.parse(new TextDecoder().decode(raw));
      const ids = (body.players ?? [])
        .map((p) => p.itemData)
        .filter((it) => it && it.id && !it.dream) // concept players are not owned
        .map((it) => it.id);
      chrome.storage.session.set({ [`sbc-${m[1]}`]: ids });
    } catch {
      /* not JSON: ignore */
    }
  },
  { urls: [`${UTAS}sbs/challenge/*`] },
  ['requestBody'],
);

// 2) ...then submits it: PUT sbs/challenge/{id}?skipUserSquadValidation=...
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.method !== 'PUT' || details.statusCode !== 200) return;
    const m = details.url.match(/\/sbs\/challenge\/(\d+)(?:\?|$)/);
    if (!m) return;
    const key = `sbc-${m[1]}`;
    const saved = await chrome.storage.session.get(key);
    const itemIds = saved[key];
    if (!itemIds?.length) return;
    await chrome.storage.session.remove(key);
    const { server, accessKey } = await state();
    if (!accessKey) return;
    try {
      await fetch(`${server}/api/sbc-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Key': accessKey },
        body: JSON.stringify({ challengeId: Number(m[1]), itemIds }),
      });
      await chrome.storage.local.set({ lastStatus: `SBC submitted: ${itemIds.length} players removed from cached club`, lastAt: Date.now() });
    } catch {
      /* server offline: the next club sync catches up */
    }
  },
  { urls: [`${UTAS}sbs/challenge/*`] },
);

// 3) Packs opened / items moved in the web app (relayed by hook.js + bridge.js).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'webapp-event') return;
  (async () => {
    const { server, accessKey } = await state();
    if (!accessKey) return;
    try {
      const res = await fetch(`${server}/api/webapp-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Key': accessKey },
        body: JSON.stringify(msg.event),
      });
      const body = await res.json().catch(() => ({}));
      if (body.summary) await chrome.storage.local.set({ lastStatus: body.summary, lastAt: Date.now() });
    } catch {
      /* server offline: the next club sync catches up */
    }
  })();
});
