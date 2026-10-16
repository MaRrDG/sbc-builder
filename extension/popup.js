const $ = (id) => document.getElementById(id);
$('version').textContent = `v${chrome.runtime.getManifest().version}`;

/** FC Solver's own sign-in now identifies you; access keys stay inside the extension.
 *  The app lives under /dashboard now (/ is the public landing page). */
const openUrl = (server) => `${server}/dashboard`;

const LIVE_MS = 30 * 1000;

/** Green when a web app tab talked to FC Solver in the last 30 s, red otherwise. */
async function renderStatus() {
  const { connectedAs, accessKey, lastStatus, syncPaused, ownedBy = {}, currentPersona, server = 'http://localhost:5178' } = await chrome.storage.local.get(['connectedAs', 'accessKey', 'lastStatus', 'syncPaused', 'ownedBy', 'currentPersona', 'server']);
  $('pause').textContent = syncPaused ? 'Resume sync' : 'Pause sync';
  $('pause').setAttribute('aria-pressed', syncPaused ? 'true' : 'false');
  const { lastPollOkAt = 0, busy } = await chrome.storage.session.get(['lastPollOkAt', 'busy']);
  const live = !!accessKey && Date.now() - lastPollOkAt < LIVE_MS;
  const working = !!busy && Date.now() - busy.since < 3 * 60 * 1000;
  const el = $('status');
  const paused = !!syncPaused && live && !working;
  const almost = live && !working && !paused && ownedBy[currentPersona] === false;
  $('signin').hidden = !almost;
  $('signin').onclick = () => /^https?:\/\//i.test(server) && chrome.tabs.create({ url: `${server}/signin?next=%2Fdashboard` });
  el.className = working ? 'busy' : paused ? 'paused' : almost ? 'almost' : live ? 'live' : 'off';
  el.replaceChildren();
  const title = document.createElement('b');
  title.textContent = working ? `${busy.label}…` : paused ? 'Sync paused' : almost ? 'Almost done' : live ? 'Connected' : 'Not connected';
  const detail = document.createElement('small');
  const problem = /error|not reachable|failed/i.test(lastStatus ?? '') ? ` Last: ${lastStatus}` : '';
  detail.textContent = working
    ? connectedAs ?? 'Talking to EA from your web app tab'
    : paused
    ? 'FC Solver asks EA for nothing until you resume. Syncs you start wait until then.'
    : almost
    ? `Connected to EA as ${connectedAs ?? 'your account'}, but not to an FC Solver account yet. Sign in on FC Solver with this web app open.`
    : live
    ? connectedAs ?? 'Web app open'
    : 'Open the FC27 web app in this browser and log in to EA.' + problem;
  el.append(title, detail);
}
renderStatus();
setInterval(renderStatus, 2000);
chrome.runtime.sendMessage({ type: 'refresh-badge' }).catch(() => {}); // the dot matches what the popup says
chrome.storage.onChanged.addListener(renderStatus);

chrome.storage.local.get({ server: 'http://localhost:5178', keys: [], update: null }).then((s) => {
  $('server').value = s.server;
  $('open').href = openUrl(s.server);
  if (s.update) {
    $('update').hidden = false;
    $('update').textContent = `Update ${s.update.version} available. Open FC Solver to install it.`;
    $('open').href = `${s.server}/dashboard?update=1`;
  }
});

$('pause').onclick = async () => {
  const { syncPaused } = await chrome.storage.local.get('syncPaused');
  // the background owns the badge; it also stores the choice (kept across browser restarts)
  await chrome.runtime.sendMessage({ type: 'sync-paused', paused: !syncPaused }).catch(() => chrome.storage.local.set({ syncPaused: !syncPaused }));
};

$('save').onclick = async () => {
  const server = $('server').value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(server)) {
    await chrome.storage.local.set({ lastStatus: 'Server error: the address must start with http:// or https://', lastAt: Date.now() });
    return;
  }
  await chrome.storage.local.set({ server, keys: [], accessKey: null, personaKeys: {}, connectedAs: null, ownedBy: {}, currentPersona: null });
  await chrome.storage.session.remove('helloFor');
  $('open').href = openUrl(server);
  await chrome.storage.session.remove('lastPollOkAt');
  await chrome.storage.local.set({ lastStatus: 'Saved. Reload the FC web app to reconnect.', lastAt: Date.now() });
};
