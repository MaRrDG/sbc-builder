// Loads admin data, keeps the last good result while reloading, refreshes while the tab is visible.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { errorText } from '../../messages';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], refreshMs = 0) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await run();
      if (my === seq.current) (setData(d), setError(null));
    } catch (e) {
      if (my === seq.current) setError(errorText(e, t));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [run, t]);
  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const id = setInterval(() => !document.hidden && void reload(), refreshMs);
    return () => clearInterval(id);
  }, [reload, refreshMs]);
  return { data, error, loading, reload };
}
