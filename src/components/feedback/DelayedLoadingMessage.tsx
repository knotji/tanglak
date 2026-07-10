"use client";

import { useEffect, useState } from "react";

type DelayedLoadingMessageProps = {
  message: string;
  slowMessage?: string;
  retryLabel?: string;
  delayMs?: number;
  slowMs?: number;
  retryMs?: number;
  onRetry?: () => void;
};

export function DelayedLoadingMessage({
  message,
  slowMessage = "ใช้เวลานานกว่าปกติ",
  retryLabel = "ลองใหม่",
  delayMs = 600,
  slowMs = 1500,
  retryMs = 5000,
  onRetry,
}: DelayedLoadingMessageProps) {
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  const [retryVisible, setRetryVisible] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setVisible(true), delayMs);
    const slowTimer = window.setTimeout(() => setSlow(true), slowMs);
    const retryTimer = window.setTimeout(() => setRetryVisible(true), retryMs);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(retryTimer);
    };
  }, [delayMs, retryMs, slowMs]);

  if (!visible) return null;

  return (
    <div aria-live="polite" className="text-xs font-semibold text-text-secondary">
      <span>{retryVisible ? slowMessage : slow ? message : message}</span>
      {retryVisible ? (
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="ml-3 rounded-full border border-border bg-white px-3 py-1 font-bold text-primary shadow-sm"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
