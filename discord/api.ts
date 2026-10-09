// The bot's only way to FC Solver data: /api/bot/* with the shared token. Errors keep the server's code + params.
export class BotApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null,
    public params: Record<string, string | number> = {},
  ) {
    super(message);
  }
}

export async function botApi<T>(
  cfg: { apiUrl: string; apiToken: string },
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(cfg.apiUrl + path, {
    method: init.method ?? 'GET',
    headers: { 'X-Bot-Token': cfg.apiToken, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; params?: Record<string, string | number> };
  if (!res.ok) throw new BotApiError(data.error ?? `HTTP ${res.status}`, res.status, data.code ?? null, data.params ?? {});
  return data as T;
}
