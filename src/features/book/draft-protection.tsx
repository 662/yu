"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmAction } from "@/components/confirm-action";

type Protection = {
  register: (key: string, dirty: boolean) => () => void;
  discard: (action: () => void, keys?: string[]) => void;
};
const DraftContext = createContext<Protection | null>(null);

export function DraftProtection({ children }: { children: ReactNode }) {
  const drafts = useRef(new Set<string>());
  const leaving = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const register = useCallback((key: string, dirty: boolean) => {
    if (dirty) drafts.current.add(key);
    else drafts.current.delete(key);
    return () => { drafts.current.delete(key); };
  }, []);
  const discard = useCallback((action: () => void, keys?: string[]) => {
    if ([...drafts.current].some(key => !keys || keys.includes(key))) setPending(() => action);
    else action();
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (drafts.current.size && !leaving.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank" || !drafts.current.size) return;
      const url = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(url.protocol) || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      event.preventDefault(); event.stopPropagation();
      discard(() => { leaving.current = true; window.location.assign(url.href); });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [discard]);
  return <DraftContext.Provider value={{ register, discard }}>
    {children}
    <ConfirmAction open={!!pending} title="放弃尚未保存的内容？" description="当前填写或核对的内容尚未保存。继续操作会放弃这些内容，已保存的账目不受影响。" confirmLabel="放弃并继续" cancelLabel="继续处理" onCancel={() => setPending(null)} onConfirm={() => { const action = pending; setPending(null); action?.(); }} />
  </DraftContext.Provider>;
}

export function useDraftProtection(key: string, dirty: boolean) {
  const context = useContext(DraftContext);
  if (!context) throw new Error("DraftProtection is required");
  const { register, discard } = context;
  useEffect(() => register(key, dirty), [register, key, dirty]);
  return useCallback((action: () => void) => discard(action, [key]), [discard, key]);
}

export function useDiscardDrafts() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("DraftProtection is required");
  return context.discard;
}
