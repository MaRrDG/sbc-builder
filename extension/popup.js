const $ = (id) => document.getElementById(id);
$('version').textContent = `v${chrome.runtime.getManifest().version}`;

/** FC Solver's own sign-in now identifies you; access keys stay inside the extension. */
const openUrl = (server) => server;

const LIVE_MS = 30 * 1000;

/** Green when a web app tab talked to FC Solver in the last 30 s, red otherwise. */
async function renderStatus() {
  const { connectedAs, accessKey, lastStatus } = await chrome.storage.local.get(['connectedAs', 'accessKey', 'lastStatus']);
  const { lastPollOkAt = 0, busy } = await chrome.storage.session.get(['lastPollOkAt', 'busy']);
  const live = !!accessKey && Date.now() - lastPollOkAt < LIVE_MS;
  const working = !!busy && Date.now() - busy.since < 3 * 60 * 1000;
  const el = $('status');
  el.className = working ? 'busy' : live ? 'live' : 'off';
  el.replaceChildren();
  const title = document.createElement('b');
  title.textContent = working ? `${busy.label}…` : live ? 'Connected' : 'Not connected';
  const detail = document.createElement('small');
  const problem = /error|not reachable|failed/i.test(lastStatus ?? '') ? ` Last: ${lastStatus}` : '';
  detail.textContent = working
    ? connectedAs ?? 'Talking to EA from your web app tab'
    : live
    ? connectedAs ?? 'Web app open'
    : (accessKey ? 'Open the FC27 web app in this browser.' : 'Open the FC27 web app and log in to link your account.') + problem;
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
    $('open').href = `${s.server}/?update=1`;
  }
});

$('save').onclick = async () => {
  const server = $('server').value.replace(/\/$/, '');
  await chrome.storage.local.set({ server, keys: [], accessKey: null, personaKeys: {}, connectedAs: null });
  await chrome.storage.session.remove('helloFor');
  $('open').href = server;
  await chrome.storage.session.remove('lastPollOkAt');
  await chrome.storage.local.set({ lastStatus: 'Saved. Reload the FC web app to reconnect.', lastAt: Date.now() });
};
