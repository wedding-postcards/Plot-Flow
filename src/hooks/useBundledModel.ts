import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands } from "@/bindings";
import type { ModelStateEvent } from "@/lib/types/events";
import {
  getBundledModelStatus,
  withTimeout,
  type BundledModelStatus,
} from "@/lib/bundledModel";

export function useBundledModel() {
  const [status, setStatus] = useState<BundledModelStatus>("checking");
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const statusRef = useRef<BundledModelStatus>("checking");
  const revision = useRef(0);
  const mounted = useRef(false);
  const loadFailed = useRef(false);
  const needsRescan = useRef(false);
  const rescanning = useRef(false);

  const updateStatus = useCallback((next: BundledModelStatus) => {
    statusRef.current = next;
    if (mounted.current) setStatus(next);
  }, []);

  const refresh = useCallback(async () => {
    // Registry events during offline repair must not overwrite its outcome.
    if (rescanning.current) return;
    const request = ++revision.current;
    const previous = statusRef.current;
    // Keep active loading and failures visible until recovery is confirmed.
    if (
      previous !== "loading" &&
      previous !== "failed" &&
      previous !== "timeout"
    ) {
      updateStatus("checking");
    }
    try {
      const selected = await withTimeout(commands.getCurrentModel());
      if (selected.status === "error") throw new Error(selected.error);
      const [info, loaded] = await withTimeout(
        Promise.all([
          commands.getModelInfo(selected.data),
          commands.getModelLoadStatus(),
        ]),
      );
      if (info.status === "error") throw new Error(info.error);
      if (loaded.status === "error") throw new Error(loaded.error);
      if (!mounted.current || request !== revision.current) return;
      const next = getBundledModelStatus(selected.data, info.data, loaded.data);
      needsRescan.current = next === "missing";
      if (
        next === "available" &&
        (previous === "loading" || loadFailed.current)
      )
        return;
      if (next === "ready") loadFailed.current = false;
      updateStatus(next);
    } catch (error) {
      if (mounted.current && request === revision.current) {
        console.warn("Bundled model status check failed:", error);
        updateStatus("failed");
      }
    }
  }, [updateStatus]);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const subscribe = async () => {
      try {
        // Subscribe before querying to catch completion/failure during the query.
        for (const name of ["model-state-changed", "models-updated"]) {
          const subscription = listen<ModelStateEvent>(name, (event) => {
            if (disposed) return;
            const kind = event.payload?.event_type;
            ++revision.current; // An event is newer than any pending snapshot.
            if (kind === "loading_started") {
              loadFailed.current = false;
              updateStatus("loading");
            } else if (kind === "loading_failed") {
              loadFailed.current = true;
              updateStatus("failed");
            } else void refresh();
          });
          // A subscription that resolves after timeout/unmount must not leak.
          void subscription
            .then((unlisten) => {
              if (disposed) unlisten();
            })
            .catch(() => {});
          const unlisten = await withTimeout(subscription);
          if (disposed) {
            unlisten();
            return;
          }
          unlisteners.push(unlisten);
        }
        if (!disposed) void refresh();
      } catch (error) {
        const active = !disposed;
        disposed = true;
        unlisteners.splice(0).forEach((unlisten) => unlisten());
        if (active && mounted.current) {
          console.warn("Bundled model event subscription failed:", error);
          updateStatus("failed");
        }
      }
    };
    void subscribe();
    return () => {
      disposed = true;
      mounted.current = false;
      ++revision.current;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [refresh, updateStatus, subscriptionAttempt]);

  useEffect(() => {
    if (status !== "loading") return;
    const deadline = setTimeout(() => {
      ++revision.current;
      loadFailed.current = true;
      updateStatus("timeout");
    }, 60000);
    // Recover even if the backend completion event was missed.
    const poll = setInterval(() => void refresh(), 2000);
    return () => {
      clearTimeout(deadline);
      clearInterval(poll);
    };
  }, [status, refresh, updateStatus]);

  const retry = useCallback(async () => {
    if (!mounted.current || rescanning.current) return;
    if (needsRescan.current) {
      rescanning.current = true;
      ++revision.current;
      updateStatus("checking");
      try {
        const result = await withTimeout(commands.rescanLocalModels());
        if (result.status === "error") throw new Error(result.error);
      } catch (error) {
        if (mounted.current) {
          console.warn("Bundled model offline repair failed:", error);
          updateStatus("failed");
        }
        // Keep needsRescan set so another Retry attempts repair again.
        return;
      } finally {
        rescanning.current = false;
      }
    }
    // Also restores event IPC after a failed initial subscription. A failed
    // engine load stays terminal until the backend retries on dictation.
    if (mounted.current) {
      setSubscriptionAttempt((attempt) => attempt + 1);
    }
  }, [updateStatus]);
  return { status, refresh: retry };
}
