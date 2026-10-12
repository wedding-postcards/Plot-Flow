export type BundledModelStatus =
  | "checking"
  | "loading"
  | "available"
  | "ready"
  | "missing"
  | "failed"
  | "timeout";

export interface BundledModelSnapshot {
  id: string;
  name: string;
  is_downloaded: boolean;
}

export function getBundledModelStatus(
  selected: string,
  model: BundledModelSnapshot | null,
  loaded: { is_loaded: boolean; current_model: string | null },
): BundledModelStatus {
  const identity = model ? `${model.id} ${model.name}` : "";
  if (
    !selected ||
    !model ||
    model.id !== selected ||
    !/gigaam/i.test(identity) ||
    !/e2e[-_ ]?ctc/i.test(identity) ||
    !model.is_downloaded
  ) {
    return "missing";
  }
  if (loaded.is_loaded && loaded.current_model !== selected) return "missing";
  // A bundled file can be available while intentionally unloaded by the idle
  // timer. The backend loads it on dictation; this is not an active load.
  return loaded.is_loaded ? "ready" : "available";
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Request timed out")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
