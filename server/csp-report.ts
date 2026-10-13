// CSP reports, pure. Browsers send either the legacy `{"csp-report": {...}}` body
// (report-uri) or a Reporting API array of `{type: "csp-violation", body: {...}}`.
// The log line keeps only what is needed to fix the policy: where it happened, which
// directive, which origin was blocked and from which script. Never the original policy
// (long, and it pushed the useful fields past the old 500-char cut), never full URLs
// (query strings can carry tokens).

export type CspLine = {
  page: string | null;
  directive: string | null;
  blocked: string | null;
  source: string | null;
  line: number | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Origin of a URL, or the keyword the browser sent (`inline`, `eval`, `data`, ...). */
export function originOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'wss:' || u.protocol === 'ws:') return u.origin;
    return u.protocol.replace(/:$/, ''); // data:, blob:, chrome-extension:
  } catch {
    return s.slice(0, 40); // 'inline', 'eval', 'self'
  }
}

function pathOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    return new URL(s).pathname.slice(0, 120);
  } catch {
    return null;
  }
}

/** One compact entry per violation found in the body (at most 5). */
export function compactCspReport(body: unknown): CspLine[] {
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const r of body) {
      const b = (r as { body?: unknown } | null)?.body;
      if (b && typeof b === 'object') items.push(b as Record<string, unknown>);
    }
  } else if (body && typeof body === 'object') {
    const legacy = (body as { 'csp-report'?: unknown })['csp-report'];
    items.push((legacy && typeof legacy === 'object' ? legacy : body) as Record<string, unknown>);
  }
  return items.slice(0, 5).map((r) => {
    const line = r['line-number'] ?? r.lineNumber;
    return {
      page: pathOnly(r['document-uri'] ?? r.documentURL),
      directive: str(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'])?.slice(0, 40) ?? null,
      blocked: originOnly(r['blocked-uri'] ?? r.blockedURL),
      source: originOnly(r['source-file'] ?? r.sourceFile),
      line: typeof line === 'number' && Number.isFinite(line) ? line : null,
    };
  });
}

/** CSP_ENFORCE=1 enforces the policy; anything else keeps it report-only. */
export function cspHeaderName(env: string | undefined): string {
  return env === '1' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}
