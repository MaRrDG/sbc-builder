// Runs inside the FC27 web app page (MAIN world). Watches only the web app's own
// responses for opened packs and item moves, and hands a copy to the extension.
// It never sends requests to EA and ignores every other endpoint.
(() => {
  const UTAS = /^https:\/\/utas\.[^/]+\/ut\/game\/fc27(\/[^?]*)/;
  const WATCH = /^\/(purchased\/items|item)(\/\d+)?$/;

  function report(method, url, reqBody, status, resText) {
    const m = String(url).match(UTAS);
    if (!m || !WATCH.test(m[1]) || status < 200 || status >= 300) return;
    const parse = (t) => {
      if (!t || typeof t !== 'string') return t ?? null;
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    };
    const query = String(url).split('?')[1] ?? '';
    window.postMessage(
      { source: 'sbc-builder-hook', method: method.toUpperCase(), path: m[1], query, request: parse(reqBody), response: parse(resText) },
      window.location.origin,
    );
  }

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__sbc = { method, url };
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__sbc;
    if (info) {
      this.addEventListener('loadend', () => {
        try {
          const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : JSON.stringify(this.response);
          report(info.method, info.url, body, this.status, text);
        } catch {
          /* never break the web app */
        }
      });
    }
    return send.call(this, body);
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const res = await origFetch.call(this, input, init);
    try {
      const url = typeof input === 'string' ? input : input.url;
      if (UTAS.test(url)) {
        const method = init.method ?? (typeof input === 'string' ? 'GET' : input.method) ?? 'GET';
        res.clone().text().then((t) => report(method, url, init.body, res.status, t)).catch(() => {});
      }
    } catch {
      /* never break the web app */
    }
    return res;
  };
})();
