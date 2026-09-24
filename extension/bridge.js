// Isolated-world relay: page hook <-> extension background.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'sbc-builder-hook') return;
  const d = event.data;
  if (d.kind === 'identity') chrome.runtime.sendMessage({ type: 'identity', identity: d.identity });
  else if (d.kind === 'call') chrome.runtime.sendMessage({ type: 'job-call', jobId: d.jobId, method: d.method, path: d.path, status: d.status });
  else if (d.kind === 'job-done')
    chrome.runtime.sendMessage({ type: 'job-done', jobId: d.jobId, ok: d.ok, error: d.error }, (res) => {
      if (chrome.runtime.lastError) return;
      syncFinished(res ?? { kind: null, status: d.ok ? 'done' : 'failed', error: d.error ?? null });
    });
  else if (d.kind === 'event') chrome.runtime.sendMessage({ type: 'webapp-event', event: d.event, jobId: d.jobId });
});

// While this tab is open, ask for sync jobs. Polling is also how FC Solver knows the web app is
// open ("Live"); a hidden tab asks less often. Whether the tab is in front goes along, so coming
// back to the web app (after playing on a console or the companion app) refreshes the SBCs.
function askForJob() {
  chrome.runtime.sendMessage({ type: 'poll', visible: !document.hidden }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    if (res.needIdentity) window.postMessage({ source: 'fcs-bridge', kind: 'identify' }, window.location.origin);
    else if (res.job) {
      window.postMessage({ source: 'fcs-bridge', kind: 'job', job: res.job }, window.location.origin);
      syncStarted(res.job.kind);
    }
  });
}
function poll() {
  try {
    askForJob();
  } catch {
    return; // the extension was reloaded or removed: this old copy stops until the page reloads
  }
  setTimeout(poll, document.hidden ? 15000 : 5000);
}
setTimeout(poll, 3000);

// back in front: tell FC Solver now, not on the next (slow, hidden-tab) poll
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  try {
    askForJob();
  } catch {
    /* the extension was reloaded or removed */
  }
});

// closed, reloaded or navigated away: the toolbar dot turns red now, not up to a minute later
window.addEventListener('pagehide', () => {
  try {
    chrome.runtime.sendMessage({ type: 'webapp-closed' }).catch(() => {});
  } catch {
    /* the extension was reloaded or removed */
  }
});

// Sync notices inside the web app: FC Solver started / finished a sync from this tab. Only club
// and SBC list syncs are announced; the follow-up challenge reads stay quiet.
const STARTED = { club: 'Syncing your club…', sbc: 'Checking your SBCs…' };
let noticeKind = null; // the job the notice on screen is about

function syncStarted(kind) {
  if (!STARTED[kind]) return;
  noticeKind = kind;
  showSyncNotice(STARTED[kind], 'busy', 3 * 60 * 1000);
}

function syncFinished({ kind, status, error, players, changedSets, clubQueued }) {
  kind ??= noticeKind;
  if (!STARTED[kind]) return;
  noticeKind = null;
  if (status !== 'done') return showSyncNotice(`Sync failed: ${error ?? 'unknown error'}`, 'error', 12000);
  const text =
    kind === 'club'
      ? `Club synced${Number.isInteger(players) ? ` · ${players} players` : ''}`
      : `${changedSets ? `SBCs updated · ${changedSets} set${changedSets === 1 ? '' : 's'} changed` : 'SBCs up to date'}${
          clubQueued ? ' · SBCs done outside the web app, syncing your club too' : ''
        }`;
  showSyncNotice(text, 'ok', 6000);
}

function showSyncNotice(text, state, ms) {
  let host = document.getElementById('fc-solver-sync');
  if (!host) {
    host = document.createElement('div');
    host.id = 'fc-solver-sync';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; align-items: center;
          gap: 10px; max-width: min(420px, calc(100vw - 32px)); padding: 10px 8px 10px 14px; border-radius: 12px;
          background: #0d1411; color: #f3f1ea; border: 1px solid #2fd99a66; box-shadow: 0 12px 32px #0009;
          font: 13px/1.4 system-ui, sans-serif; }
        .toast.error { border-color: #ff6b6b99; }
        .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #2fd99a; }
        .busy .dot { background: #f5c542; }
        .error .dot { background: #ff6b6b; }
        b { color: #c8f53c; margin-right: 4px; }
        button { flex: none; font: inherit; font-weight: 600; padding: 4px 8px; border: 0; border-radius: 8px;
          background: transparent; color: #a9bcc1; cursor: pointer; }
        button:hover { color: #fff; }
        @media (prefers-reduced-motion: no-preference) {
          .toast { animation: in 180ms ease-out; }
          .busy .dot { animation: pulse 1.2s ease-in-out infinite; }
        }
        @keyframes in { from { opacity: 0; transform: translateY(8px); } }
        @keyframes pulse { 50% { opacity: 0.35; } }
      </style>
      <div class="toast" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <div><b>FC Solver</b><span class="text"></span></div>
        <button type="button" aria-label="Dismiss">✕</button>
      </div>`;
    root.querySelector('button').onclick = () => host.remove();
    document.documentElement.appendChild(host);
  }
  const root = host.shadowRoot;
  root.querySelector('.toast').className = `toast ${state}`;
  root.querySelector('.text').textContent = text; // text only: error messages come from outside
  clearTimeout(host._timer);
  host._timer = setTimeout(() => host.remove(), ms);
}

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
      <a href="${server}/dashboard?update=1" target="_blank" rel="noreferrer">How to update</a>
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
