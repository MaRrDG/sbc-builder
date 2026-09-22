const $ = (id) => document.getElementById(id);

function openUrl(server, keys) {
  // Keys travel in the URL fragment, which browsers never send to the server.
  return keys.length ? `${server}/#keys=${keys.join(',')}` : server;
}

chrome.storage.local.get({ server: 'http://localhost:5178', lastStatus: null, lastAt: null, keys: [] }).then((s) => {
  $('server').value = s.server;
  $('open').href = openUrl(s.server, s.keys);
  if (s.lastStatus) $('status').textContent = `${s.lastStatus} · ${new Date(s.lastAt).toLocaleTimeString()}`;
});

$('save').onclick = async () => {
  const server = $('server').value.replace(/\/$/, '');
  await chrome.storage.local.set({ server, lastSid: null, keys: [], accessKey: null });
  $('open').href = server;
  $('status').textContent = 'Saved. Reload the FC web app to reconnect.';
};
