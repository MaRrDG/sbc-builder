// Isolated-world relay on FC Solver pages. The signed-in site hands over a short-lived link token;
// the background sends it with the next hello so this browser's EA persona is linked to that user.
const post = (type, extra = {}) => window.postMessage({ source: 'fcsolver-ext', type, ...extra }, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'fcsolver-site') return;
  const d = event.data;
  try {
    if (d.type === 'fcsolver:hello') post('fcsolver:present');
    else if (d.type === 'fcsolver:link' && typeof d.token === 'string' && /^[\w-]{20,100}$/.test(d.token))
      chrome.runtime.sendMessage({ type: 'link-token', token: d.token });
    else if (d.type === 'fcsolver:unlink') chrome.runtime.sendMessage({ type: 'unlink' });
  } catch {
    /* extension reloaded: this old copy is inert until the page reloads */
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'linked') post('fcsolver:linked', { personaId: msg.personaId });
});

post('fcsolver:present');
