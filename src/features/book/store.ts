"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createBookStore } from "./book-store";
import type { Book } from "./ledger";

export function useBook(initial: Book) {
  const [store] = useState(() => createBookStore(initial));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.serverSnapshot);
  useEffect(() => {
    const sync = () => { if (document.visibilityState === "visible") void store.refresh(); };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const interval = window.setInterval(sync, 30000);
    return () => { window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync); clearInterval(interval); };
  }, [store]);
  return { ...state, mutate: store.mutate, refresh: store.refresh };
}
