import { useCallback, useEffect, useRef, useState } from "react";
import { getCached, setCache, clearCache } from "../storage/cacheStorage";

export function useAsyncData(loader, deps = [], { cacheKey } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const didMount = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      if (cacheKey && !didMount.current) {
        const cached = await getCached(cacheKey);
        if (cancelled) return;

        if (cached) {
          setData(cached);
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

    load();
    return () => {
      cancelled = true;
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
