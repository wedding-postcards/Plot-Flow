import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { withTimeout } from "@/lib/bundledModel";
import type { UsageStatistics } from "./usageStatistics";

export function useUsageStatistics() {
  const [data, setData] = useState<UsageStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let request = 0;
    let unlisten: UnlistenFn | undefined;
    setLoading(true);
    setError(false);

    const refresh = async () => {
      const current = ++request;
      setLoading(true);
      try {
        const result = await withTimeout(
          invoke<UsageStatistics>("get_usage_statistics"),
        );
        if (!disposed && current === request) {
          setData(result);
          setError(false);
        }
      } catch (cause) {
        if (!disposed && current === request) {
          console.warn("Usage statistics query failed:", cause);
          setError(true);
        }
      } finally {
        if (!disposed && current === request) setLoading(false);
      }
    };

    const subscribe = async () => {
      try {
        const registration = listen("statistics-updated", () => {
          if (!disposed) void refresh();
        }).then((cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        });
        // Subscribe first so updates during the initial request are not lost.
        await withTimeout(registration);
        if (!disposed) await refresh();
      } catch (cause) {
        if (!disposed) {
          console.warn("Usage statistics subscription failed:", cause);
          setError(true);
          setLoading(false);
          disposed = true;
          unlisten?.();
        }
      }
    };
    void subscribe();
    return () => {
      disposed = true;
      ++request;
      unlisten?.();
    };
  }, [attempt]);

  return {
    data,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
