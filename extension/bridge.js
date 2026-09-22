// Isolated-world relay: page hook -> extension background.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'sbc-builder-hook') return;
  const { method, path, query, request, response } = event.data;
  chrome.runtime.sendMessage({ type: 'webapp-event', event: { method, path, query, request, response } });
});
