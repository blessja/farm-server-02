import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedWithTimestamp, setCache, clearCache } from "../storage/cacheStorage";

const DEFAULT_STALE_TIME = 30 * 60 * 1000;

export function useAsyncData(loader, deps = [], { cacheKey, staleTime } = {}) {
  const ttl = staleTime ?? DEFAULT_STALE_TIME;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const didMount = useRef(false);
  const bgRefreshTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      if (cacheKey) {
        const cached = await getCachedWithTimestamp(cacheKey);
        if (cancelled) return;

        if (cached) {
          const age = Date.now() - cached.ts;
          setData(cached.data);

          if (age < ttl) {
            setLoading(false);
            didMount.current = true;
            scheduleBackgroundRefresh(cached.ts);
            return;
          }

          setLoading(false);
          didMount.current = true;

          try {
            const fresh = await loader();
            if (!cancelled) {
              setData(fresh);
              setCache(cacheKey, fresh);
            }
          } catch {
            // background refresh failed, keep cached data
          }
          return;
        }
      }

      didMount.current = true;

      try {
        const result = await loader();
        if (!cancelled) {
          setData(result);
          if (cacheKey) setCache(cacheKey, result);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function scheduleBackgroundRefresh(writtenAt) {
      if (bgRefreshTimer.current) clearTimeout(bgRefreshTimer.current);
      const elapsed = Date.now() - writtenAt;
      const remaining = Math.max(ttl - elapsed, 5000);

      bgRefreshTimer.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          const fresh = await loader();
          if (!cancelled) {
            setData(fresh);
            setCache(cacheKey, fresh);
          }
        } catch {
          // silent — stale data stays on screen
        }
      }, remaining);
    }

    load();

    return () => {
      cancelled = true;
      if (bgRefreshTimer.current) clearTimeout(bgRefreshTimer.current);
    };
  }, deps);

  const refresh = useCallback(async () => {
    if (cacheKey) await clearCache(cacheKey);
    setLoading(true);
    setError("");
    try {
      const result = await loader();
      setData(result);
      if (cacheKey) setCache(cacheKey, result);
    } catch (err) {
      setError(err.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  }, deps);

  return { data, loading, error, refresh, setData };
}
