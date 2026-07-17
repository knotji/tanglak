"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures (unsupported browser, blocked by a privacy
      // setting, etc.) shouldn't be surfaced to the user -- the app already
      // works fully online without a service worker; this is a progressive
      // enhancement for installability/offline-shell support only.
    });
  }, []);

  return null;
}
