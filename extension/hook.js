// Runs inside the FC27 web app page (MAIN world). Two jobs:
//  1. Watch the web app's own responses (opened packs, item moves, and the club / squad / SBC
//     data it loads) and hand a copy to the extension.
//  2. Run FC Solver's sync jobs from here, so every request to EA leaves from this tab with the
//     web app's own origin, headers and IP. Only the fixed, read-only recipes below exist; the
//     server picks a recipe by name and can never make this page call anything else.
(() => {
  const SRC = 'sbc-builder-hook';
  const UTAS = /^(https:\/\/utas\.[^/]+\/ut\/game\/fc27)(\/[^?]*)/;
  const WATCH = /^\/(purchased\/items|item(\/\d+)?|club|squad\/(list|active|\d+)|sbs\/sets|sbs\/setId\/\d+\/challenges|chemistry\/profiles)$/;
  const GAP_MS = 1500; // between our own requests, like the server used to
  const PAGE = 91;
  const THROTTLE = [429, 458, 495, 512, 521];

  const post = (msg) => window.postMessage({ source: SRC, ...msg }, window.location.origin);
  const parse = (t) => {
    if (!t || typeof t !== 'string') return t ?? null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };

  // What the web app itself sends to EA; sync jobs reuse it as is.
  let base = null;
  let headers = null;
  let credentials = 'same-origin';
  let identity = null;
  let identifyTimer = null;

  function setIdentity(info) {
    if (!info || !Number.isInteger(info.personaId)) return;
    identity = { personaId: info.personaId, personaName: info.personaName, clubName: info.clubName };
    post({ kind: 'identity', identity });
  }

  function learnRequest(url, sent, withCredentials) {
    const m = String(url).match(UTAS);
    if (!m || !sent) return;
    const sid = Object.entries(sent).find(([k]) => k.toLowerCase() === 'x-ut-sid')?.[1];
    if (!sid) return;
    const prevSid = headers && Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-ut-sid')?.[1];
    base = m[1];
    headers = { ...sent };
    credentials = withCredentials ? 'include' : 'same-origin';
    if (prevSid && prevSid !== sid) identity = null; // new session, maybe another account
    // the web app normally asks /usermassinfo itself right after login; if not, we ask once
    if (!identity && !identifyTimer)
      identifyTimer = setTimeout(async () => {
        identifyTimer = null;
        if (identity || !headers) return;
        try {
          setIdentity((await call(null, 'GET', '/usermassinfo'))?.userInfo);
        } catch {
          /* no identity yet: the next web app request retries */
        }
      }, 5000);
  }

  function report(method, url, reqBody, status, resText) {
    const m = String(url).match(UTAS);
    if (!m || status < 200 || status >= 300) return;
    if (m[2] === '/usermassinfo') setIdentity(parse(resText)?.userInfo);
    if (!WATCH.test(m[2])) return;
    const query = String(url).split('?')[1] ?? '';
    post({ kind: 'event', event: { method: method.toUpperCase(), path: m[2], query, request: parse(reqBody), response: parse(resText) } });
  }

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__sbc = { method, url, headers: {} };
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__sbc) this.__sbc.headers[name] = value;
    return setHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__sbc;
    if (info) {
      try {
        learnRequest(info.url, info.headers, this.withCredentials);
      } catch {
        /* never break the web app */
      }
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
    try {
      const url = typeof input === 'string' ? input : input.url;
      if (UTAS.test(url)) {
        const h = new Headers(init.headers ?? (typeof input === 'string' ? undefined : input.headers));
        learnRequest(url, Object.fromEntries(h.entries()), (init.credentials ?? input.credentials) === 'include');
      }
    } catch {
      /* never break the web app */
    }
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

  // ---- sync jobs -----------------------------------------------------------------------
  let lastCallAt = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** One read request to EA exactly as the web app would make it; reported for FC Solver's daily count. */
  async function call(jobId, method, path, body) {
    const wait = lastCallAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    let status = null;
    let data = null;
    try {
      const res = await origFetch(base + path, {
        method,
        headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials,
      });
      status = res.status;
      data = parse(await res.text());
    } finally {
      lastCallAt = Date.now();
      post({ kind: 'call', jobId, method, path, status });
    }
    if (status < 200 || status >= 300) throw Object.assign(new Error(`EA answered ${status} to ${method} ${path}`), { status });
    if (jobId) post({ kind: 'event', jobId, event: { method, path, query: '', request: body ?? null, response: data } });
    return data;
  }

  const RECIPES = {
    async club(c) {
      for (let start = 0; start < 5000; start += PAGE) {
        const page = await c('POST', '/club', { count: PAGE, searchAltPositions: true, sort: 'desc', sortBy: 'ovr', start, type: 'player' });
        if (!Array.isArray(page?.itemData) || page.itemData.length < PAGE) break;
      }
      const list = await c('GET', '/squad/list');
      if (Number.isInteger(list?.activeSquadId)) await c('GET', `/squad/${list.activeSquadId}`);
      await c('GET', '/chemistry/profiles');
    },
    async sbc(c) {
      await c('GET', '/sbs/sets');
    },
    async challenges(c, job) {
      for (const id of (job.setIds ?? []).slice(0, 40)) if (Number.isInteger(id)) await c('GET', `/sbs/setId/${id}/challenges`);
    },
  };

  let busy = false;
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'fcs-bridge' || event.data.kind !== 'job') return;
    const job = event.data.job;
    const recipe = job && typeof job.id === 'string' && Object.hasOwn(RECIPES, job.kind) ? RECIPES[job.kind] : null;
    if (!recipe) return;
    if (busy || !headers || !base) {
      post({ kind: 'job-done', jobId: job.id, ok: false, error: busy ? 'Another sync is running in this tab.' : 'The web app has not talked to EA yet.' });
      return;
    }
    busy = true;
    try {
      await recipe((method, path, body) => call(job.id, method, path, body), job);
      post({ kind: 'job-done', jobId: job.id, ok: true });
    } catch (e) {
      const throttled = THROTTLE.includes(e?.status);
      post({ kind: 'job-done', jobId: job.id, ok: false, error: throttled ? `EA asked to slow down (${e.status}).` : String(e?.message ?? e) });
    } finally {
      busy = false;
    }
  });
})();
