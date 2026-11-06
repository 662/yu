"use client";

import { useSearchParams } from "next/navigation";
import { ledgerHref, readLedgerLocation, type LedgerLocation } from "./routes";

export function useLedgerLocation(today: string) {
  const params = useSearchParams();
  const location = readLedgerLocation(new URLSearchParams(params), today);
  function update(patch: Partial<LedgerLocation>, replace = false) {
    // Read the live URL so several updates in one event compose without stale React state.
    const current = readLedgerLocation(new URLSearchParams(window.location.search), today);
    const href = ledgerHref({ ...current, ...patch });
    if (href === window.location.pathname + window.location.search) return;
    // Next integrates native history for client-only filters; no server book reload is needed.
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }
  return { ...location, update };
}
