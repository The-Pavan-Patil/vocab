"use client";

import { useEffect } from "react";

// Registers public/sw.js (offline fallback + asset cache) in production. Not in
// dev, where a cached build asset would fight hot reload.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Not fatal: the app works the same without it, just not offline.
      });
  }, []);
  return null;
}
