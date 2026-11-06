"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { protectHistory } from "@/lib/history-protection";

type Guard = { isDirty: () => boolean; confirm: (proceed: () => void) => void; onNavigate: () => void };
const HistoryContext = createContext<((guard: Guard) => () => void) | null>(null);

/** Track entries outside the book too, so Back to Wiki can still protect a book draft. */
export function HistoryProtection({ children }: { children: ReactNode }) {
  const guard = useRef<Guard | null>(null);
  const register = useCallback((next: Guard) => {
    guard.current = next;
    return () => { if (guard.current === next) guard.current = null; };
  }, []);
  useEffect(() => protectHistory(window,
    () => guard.current?.isDirty() ?? false,
    proceed => guard.current ? guard.current.confirm(proceed) : proceed(),
    () => guard.current?.onNavigate(),
  ), []);
  return <HistoryContext.Provider value={register}>{children}</HistoryContext.Provider>;
}

export function useHistoryProtection(guard: Guard) {
  const register = useContext(HistoryContext);
  if (!register) throw new Error("HistoryProtection is required");
  const { isDirty, confirm, onNavigate } = guard;
  useEffect(() => register({ isDirty, confirm, onNavigate }), [register, isDirty, confirm, onNavigate]);
}
