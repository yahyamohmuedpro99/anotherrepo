'use client';
import { useCallback, useEffect, useState } from 'react';

/** Load-once-and-reload hook for client pages. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: unknown; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  const run = useCallback(load, deps);
  useEffect(() => {
    let live = true;
    setLoading(true);
    run()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [run, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}
