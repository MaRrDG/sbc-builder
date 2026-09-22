// Isolated-world relay: page hook -> extension background.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'sbc-builder-hook') return;
  const { method, path, query, request, response } = event.data;
  chrome.runtime.sendMessage({ type: 'webapp-event', event: { method, path, query, request, response } });
});

// Update notice inside the web app. Shadow DOM keeps EA's styles and ours apart.
function showUpdateNotice({ update, current, server }) {
  if (document.getElementById('sbc-builder-update')) return;
  const host = document.createElement('div');
  host.id = 'sbc-builder-update';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
        display: flex; align-items: center; gap: 14px; max-width: min(640px, calc(100vw - 24px));
        padding: 10px 10px 10px 16px; border-radius: 12px; background: #0d1411; color: #f3f1ea;
        border: 1px solid #2fd99a66; box-shadow: 0 12px 32px #0009; font: 13px/1.4 system-ui, sans-serif; }
      b { color: #c8f53c; }
      .notes { color: #a9bcc1; margin-top: 2px; }
      a, button { font: inherit; font-weight: 600; border-radius: 8px; cursor: pointer; white-space: nowrap; }
      a { padding: 7px 12px; background: #c8f53c; color: #0d1411; text-decoration: none; }
      button { padding: 7px 10px; border: 0; background: transparent; color: #a9bcc1; }
      button:hover { color: #fff; }
    </style>
    <div class="bar" role="status">
      <div>
        <div><b>FC Solver ${update.version}</b> is out (you have ${current}).</div>
        ${update.notes?.length ? `<div class="notes">${update.notes.map((n) => n.replace(/[<>&]/g, '')).join(' · ')}</div>` : ''}
      </div>
      <a href="${server}/?update=1" target="_blank" rel="noreferrer">How to update</a>
      <button type="button" aria-label="Dismiss">Later</button>
    </div>`;
  root.querySelector('button').onclick = () => {
    chrome.runtime.sendMessage({ type: 'dismiss-update', version: update.version });
    host.remove();
  };
  document.documentElement.appendChild(host);
}

chrome.runtime.sendMessage({ type: 'update-status' }, (res) => {
  if (chrome.runtime.lastError || !res) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => showUpdateNotice(res));
  else showUpdateNotice(res);
});
