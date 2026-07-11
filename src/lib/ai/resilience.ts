import { DocumentExtractionError } from "@/lib/ai/extraction-errors";

export const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;
export const DOCUMENT_PROCESSING_TIMEOUT_MS = 45_000;
export const PROVIDER_MAX_ATTEMPTS = 3;
export const PROVIDER_BASE_BACKOFF_MS = 400;
export const PROVIDER_MAX_BACKOFF_MS = 2_000;

export function abortError(signal?: AbortSignal): DocumentExtractionError | undefined {
  if (!signal?.aborted) return undefined;
  if (signal.reason instanceof DocumentExtractionError) return signal.reason;
  return new DocumentExtractionError("timeout");
}

export function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DocumentExtractionError("timeout")), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

export function mergeAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason ?? new DocumentExtractionError("timeout"));
    }
  };

  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener("abort", () => abort(signal), { once: true });
  }

  return controller.signal;
}

export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<T> {
  const timeout = createTimeoutSignal(timeoutMs);
  const signal = mergeAbortSignals([outerSignal, timeout.signal]);
  try {
    return await Promise.race([
      promiseFactory(signal),
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(abortError(signal) ?? new DocumentExtractionError("timeout")),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    throw abortError(signal) ?? error;
  } finally {
    timeout.cancel();
  }
}

export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, PROVIDER_MAX_BACKOFF_MS);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.min(Math.max(dateMs - Date.now(), 0), PROVIDER_MAX_BACKOFF_MS);
  return undefined;
}

export function retryDelayMs(attempt: number, retryAfterMs?: number, jitter = Math.random()): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  const exponential = Math.min(PROVIDER_BASE_BACKOFF_MS * 2 ** Math.max(attempt - 1, 0), PROVIDER_MAX_BACKOFF_MS);
  return Math.min(Math.round(exponential + exponential * 0.2 * jitter), PROVIDER_MAX_BACKOFF_MS);
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const signalError = abortError(signal);
  if (signalError) return Promise.reject(signalError);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortError(signal) ?? new DocumentExtractionError("timeout"));
      },
      { once: true },
    );
  });
}
