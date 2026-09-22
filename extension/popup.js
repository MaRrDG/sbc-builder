const $ = (id) => document.getElementById(id);
$('version').textContent = `v${chrome.runtime.getManifest().version}`;

function openUrl(server, keys) {
  // Keys travel in the URL fragment, which browsers never send to the server.
  return keys.length ? `${server}/#keys=${keys.join(',')}` : server;
}

chrome.storage.local.get({ server: 'http://localhost:5178', lastStatus: null, lastAt: null, keys: [], update: null }).then((s) => {
  $('server').value = s.server;
  $('open').href = openUrl(s.server, s.keys);
  if (s.lastStatus) $('status').textContent = `${s.lastStatus} · ${new Date(s.lastAt).toLocaleTimeString()}`;
  if (s.update) {
    $('update').hidden = false;
    $('update').textContent = `Update ${s.update.version} available. Open FC Solver to install it.`;
    $('open').href = `${s.server}/?update=1${s.keys.length ? `#keys=${s.keys.join(',')}` : ''}`;
  }
});

$('save').onclick = async () => {
  const server = $('server').value.replace(/\/$/, '');
  await chrome.storage.local.set({ server, keys: [], accessKey: null, personaKeys: {} });
  await chrome.storage.session.remove('helloFor');
  $('open').href = server;
  $('status').textContent = 'Saved. Reload the FC web app to reconnect.';
};
