// Bridges the FC27 web app and FC Solver:
//  1. tells FC Solver who is logged in (the SID only once, to prove a new account);
//  2. hands sync jobs to the web app tab (hook.js runs them, so EA only ever sees the web app);
//  3. reports which club items you used in a submitted SBC and what the web app loaded.
// This service worker never sends anything to EA itself.
const DEFAULT_SERVER = 'http://localhost:5178';
const UTAS = 'https://utas.mob.v1.prd.futc-ext.gcp.ea.com/ut/game/fc27/';

const VERSION = chrome.runtime.getManifest().version;

const state = () => chrome.storage.local.get({ server: DEFAULT_SERVER, contentGuid: null, accessKey: null, keys: [] });

/** -1 / 0 / 1 for dotted numeric versions. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Asks the server for the latest extension; flags the icon when this copy is older. */
async function checkForUpdate(force = false) {
  const { server, updateCheckedAt = 0 } = await chrome.storage.local.get(['server', 'updateCheckedAt']);
  if (!force && Date.now() - updateCheckedAt < 30 * 60 * 1000) return;
  try {
    const res = await fetch(`${server ?? DEFAULT_SERVER}/api/extension/version`);
    const latest = await res.json();
    const update = latest.version && compareVersions(latest.version, VERSION) > 0 ? latest : null;
    await chrome.storage.local.set({ update, updateCheckedAt: Date.now() });
    await refreshBadge();
  } catch {
    /* server unreachable: try again later */
  }
}

/** Tells FC Solver which version is installed, so its update banner clears right away. */
async function reportVersion() {
  const { server, keys = [] } = await chrome.storage.local.get(['server', 'keys']);
  for (const key of keys) {
    try {
      await fetch(`${server ?? DEFAULT_SERVER}/api/extension/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Key': key },
        body: JSON.stringify({ version: VERSION }),
      });
    } catch {
      /* server offline: the next session push reports it too */
    }
  }
}

// ---- connection state ------------------------------------------------------------------
// Connected = a web app tab polled FC Solver successfully in the last 30 s. The toolbar badge
// shows it: green dot connected, red dot not connected, NEW when an update is waiting.
const LIVE_MS = 30 * 1000;

// Yellow while working: connecting (hello) or running a sync job. Stale markers expire.
const BUSY_MAX_MS = 3 * 60 * 1000;

async function setBusy(busy) {
  await chrome.storage.session.set({ busy: busy ? { ...busy, since: Date.now() } : null });
  await refreshBadge();
}

async function refreshBadge() {
  const { accessKey, update } = await chrome.storage.local.get(['accessKey', 'update']);
  const { lastPollOkAt = 0, busy } = await chrome.storage.session.get(['lastPollOkAt', 'busy']);
  const live = !!accessKey && Date.now() - lastPollOkAt < LIVE_MS;
  const working = !!busy && Date.now() - busy.since < BUSY_MAX_MS;
  await chrome.storage.session.set({ live });
  await chrome.action.setBadgeText({ text: update ? 'NEW' : ' ' });
  await chrome.action.setBadgeBackgroundColor({ color: update ? '#c8f53c' : working ? '#f5c542' : live ? '#3ecf6e' : '#e5484d' });
  if (update) await chrome.action.setBadgeTextColor?.({ color: '#0d1411' });
  const state = working ? busy.label : live ? 'connected' : 'not connected, open the FC27 web app';
  await chrome.action.setTitle({ title: `FC Solver: ${state}` });
}

const JOB_LABEL = { club: 'Syncing club', sbc: 'Syncing SBC list', challenges: 'Syncing SBC challenges', challengeSquad: 'Reading SBC squad' };

// the service worker sleeps; alarms turn the dot red when polls stop (a crashed tab, a lost message)
chrome.alarms.onAlarm.addListener((a) => (a.name === 'badge' || a.name === 'badge-expire') && refreshBadge());
const startAlarm = () => chrome.alarms.create('badge', { periodInMinutes: 0.5 });

// Web app tabs that are polling. When the last one closes or leaves the web app the dot turns
// red right away, instead of when the 30 s live window and the next alarm have both run out.
async function webAppGone(tabId) {
  const { webAppTabs = [] } = await chrome.storage.session.get('webAppTabs');
  const left = webAppTabs.filter((id) => id !== tabId);
  if (left.length === webAppTabs.length) return;
  await chrome.storage.session.set({ webAppTabs: left });
  if (!left.length) await chrome.storage.session.remove('lastPollOkAt');
  await refreshBadge();
}
chrome.tabs.onRemoved.addListener((tabId) => void webAppGone(tabId));

chrome.runtime.onStartup.addListener(() => {
  reportVersion();
  checkForUpdate(true);
  startAlarm();
  refreshBadge();
});
chrome.runtime.onInstalled.addListener(() => {
  reportVersion();
  checkForUpdate(true);
  startAlarm();
  refreshBadge();
  injectSiteScript();
});

/** Content scripts only reach pages loaded after install: give FC Solver tabs already open site.js now, so they link without a reload. */
async function injectSiteScript() {
  const entry = chrome.runtime.getManifest().content_scripts?.find((c) => c.js?.includes('site.js'));
  if (!entry) return;
  for (const tab of await chrome.tabs.query({ url: entry.matches })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site.js'] }).catch(() => {});
  }
}

// ---- identity -----------------------------------------------------------------------------
// The SID stays in this browser: kept in session storage (memory only) and sent to FC Solver
// once, only to prove a new account. Known accounts are recognised by the key we already hold.
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const h = details.requestHeaders?.find((x) => x.name.toLowerCase() === 'x-ut-sid');
    if (h?.value) chrome.storage.session.set({ sid: h.value });
  },
  { urls: [`${UTAS}*`] },
  ['requestHeaders'],
);

async function hello(identity) {
  const { server, contentGuid, keys, personaKeys = {} } = { ...(await state()), ...(await chrome.storage.local.get('personaKeys')) };
  const { sid, helloFor } = await chrome.storage.session.get(['sid', 'helloFor']);
  const { linkToken, linkTab } = await chrome.storage.session.get(['linkToken', 'linkTab']);
  await chrome.storage.session.set({ lastIdentity: identity });
  const marker = `${identity.personaId}:${sid ?? ''}`;
  const { accessKey } = await state();
  if (helloFor === marker && accessKey && !linkToken) return; // already introduced this session
  const send = (extra, key) =>
    fetch(`${server}/api/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Account-Key': key } : {}) },
      body: JSON.stringify({ personaId: identity.personaId, contentGuid, extVersion: VERSION, ...(linkToken ? { linkToken } : {}), ...extra }),
    });
  await setBusy({ label: 'Connecting' });
  try {
    let res = await send({}, personaKeys[identity.personaId]);
    if (res.status === 401 && sid) {
      // new account or new browser: prove it once. Never more than once a minute, since it costs an EA call
      const { lastProofAt = 0 } = await chrome.storage.session.get('lastProofAt');
      if (Date.now() - lastProofAt < 60 * 1000) return;
      await chrome.storage.session.set({ lastProofAt: Date.now() });
      res = await send({ sid });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.accessKey) {
      await chrome.storage.local.set({ lastStatus: `Server error: ${body.error ?? res.status}`, lastAt: Date.now() });
      return;
    }
    await chrome.storage.local.set({
      accessKey: body.accessKey,
      personaKeys: { ...personaKeys, [identity.personaId]: body.accessKey },
      keys: [...new Set([body.accessKey, ...keys])],
      lastStatus: `Connected: ${body.account.personaName} (${body.account.clubName})`,
      connectedAs: `${body.account.personaName} · ${body.account.clubName}`,
      lastAt: Date.now(),
    });
    if (body.linked || body.linkRejected) {
      await chrome.storage.session.remove(['linkToken', 'linkTab']);
      if (body.linked && linkTab) chrome.tabs.sendMessage(linkTab, { type: 'linked', personaId: body.linked }).catch(() => {});
    }
    await chrome.storage.session.set({ helloFor: marker });
    await pollJobs(); // connected right away, without waiting for the tab's next poll
  } catch {
    await chrome.storage.local.set({ lastStatus: `Server not reachable at ${server}`, lastAt: Date.now() });
  } finally {
    const { busy } = await chrome.storage.session.get('busy');
    if (busy?.label === 'Connecting') await setBusy(null);
  }
}

// ---- sync jobs: run by hook.js in the web app tab ---------------------------------------
const LOCAL_DAILY_LIMIT = 200; // second guard next to the server's own budget

async function callsToday() {
  const day = new Date().toDateString();
  const { callDay, callCount = 0 } = await chrome.storage.local.get(['callDay', 'callCount']);
  return { day, count: callDay === day ? callCount : 0 };
}

async function api(path, init = {}) {
  const { server, accessKey } = await state();
  if (!accessKey) return null;
  const res = await fetch(`${server}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Account-Key': accessKey, ...(init.headers ?? {}) },
  });
  return res.ok ? res.json() : null;
}

/** A web app tab asked for work and FC Solver answered: we are connected. */
async function pollJobs(tabId, visible) {
  const res = await api(`/api/jobs/next${typeof visible === 'boolean' ? `?visible=${visible ? 1 : 0}` : ''}`).catch(() => null);
  if (res) {
    await chrome.storage.session.set({ lastPollOkAt: Date.now() });
    // red exactly when the live window runs out if no poll follows
    chrome.alarms.create('badge-expire', { when: Date.now() + LIVE_MS + 1000 });
    if (Number.isInteger(tabId)) {
      const { webAppTabs = [] } = await chrome.storage.session.get('webAppTabs');
      if (!webAppTabs.includes(tabId)) await chrome.storage.session.set({ webAppTabs: [...webAppTabs, tabId] });
    }
  }
  if (res?.job) await setBusy({ label: JOB_LABEL[res.job.kind] ?? 'Syncing', jobId: res.job.id });
  else await refreshBadge();
  return res;
}

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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 4) The web app page asks whether to show the update notice.
  if (msg?.type === 'update-status') {
    checkForUpdate().then(async () => {
      const { update, dismissedUpdate, server } = await chrome.storage.local.get(['update', 'dismissedUpdate', 'server']);
      sendResponse(update && dismissedUpdate !== update.version ? { update, current: VERSION, server: server ?? DEFAULT_SERVER } : null);
    });
    return true; // async response
  }
  if (msg?.type === 'dismiss-update') {
    chrome.storage.local.set({ dismissedUpdate: msg.version });
    return;
  }
  if (msg?.type === 'link-token' && typeof msg.token === 'string') {
    (async () => {
      await chrome.storage.session.set({ linkToken: msg.token, linkTab: _sender.tab?.id ?? null });
      await chrome.storage.session.remove('helloFor');
      const { lastIdentity } = await chrome.storage.session.get('lastIdentity');
      if (lastIdentity) await hello(lastIdentity); // web app already open: link now, not on its next load
    })();
    return;
  }
  if (msg?.type === 'unlink') {
    chrome.storage.session.remove(['linkToken', 'linkTab']);
    return;
  }
  if (msg?.type === 'webapp-closed') {
    if (Number.isInteger(_sender.tab?.id)) webAppGone(_sender.tab.id);
    return;
  }
  if (msg?.type === 'refresh-badge') {
    refreshBadge();
    return;
  }
  if (msg?.type === 'identity' && Number.isInteger(msg.identity?.personaId)) {
    hello(msg.identity);
    return;
  }
  if (msg?.type === 'poll') {
    (async () => {
      const { count } = await callsToday();
      if (count >= LOCAL_DAILY_LIMIT) return sendResponse(null);
      // no key yet (first run, server changed, a failed hello): ask the tab to introduce itself again
      if (!(await state()).accessKey) {
        await refreshBadge();
        return sendResponse({ needIdentity: true });
      }
      sendResponse(await pollJobs(_sender.tab?.id, msg.visible));
    })();
    return true; // async response
  }
  if (msg?.type === 'job-call') {
    (async () => {
      const { day, count } = await callsToday();
      await chrome.storage.local.set({ callDay: day, callCount: count + 1 });
      if (!msg.jobId) return; // identifying the account, before we have a job
      await api(`/api/jobs/${encodeURIComponent(msg.jobId)}/call`, {
        method: 'POST',
        body: JSON.stringify({ method: msg.method, path: msg.path, status: msg.status }),
      }).catch(() => {});
    })();
    return;
  }
  if (msg?.type === 'job-done') {
    setBusy(null);
    // the server's verdict goes back to the tab, which shows it as a notice in the web app
    api(`/api/jobs/${encodeURIComponent(msg.jobId)}/done`, { method: 'POST', body: JSON.stringify({ ok: msg.ok, error: msg.error, pagesTagged: true }) })
      .then(async (res) => {
        const ok = res ? res.status === 'done' : msg.ok;
        const error = res?.error ?? msg.error;
        await chrome.storage.local.set({ lastStatus: ok ? 'Synced from the web app' : `Sync failed: ${error}`, lastAt: Date.now() });
        sendResponse(res);
      })
      .catch(() => sendResponse(null));
    return true; // async response
  }
  if (msg?.type !== 'webapp-event') return;
  (async () => {
    const { server, accessKey } = await state();
    if (!accessKey) return;
    try {
      const res = await fetch(`${server}/api/webapp-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Key': accessKey },
        // a sync job's pages carry its id, so the server can tell when the whole club came in
        body: JSON.stringify(typeof msg.jobId === 'string' ? { ...msg.event, jobId: msg.jobId } : msg.event),
      });
      const body = await res.json().catch(() => ({}));
      if (body.summary) await chrome.storage.local.set({ lastStatus: body.summary, lastAt: Date.now() });
    } catch {
      /* server offline: the next club sync catches up */
    }
  })();
});
