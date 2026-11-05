import type { Command } from "./commands";
import type { Book } from "./ledger";
import { bookEtag } from "./version";

export function createBookStore(initial: Book, request: typeof fetch = fetch) {
  let snapshot = { book: initial, saving: false, error: "", accountChanged: false };
  const serverSnapshot = snapshot;
  let generation = 0;
  let refreshing = false;
  const accountChangedMessage = "登录账号已变更，请刷新页面重新打开账本。";
  const clearPrivateData = () => {
    generation++;
    publish({ book: { version: 1, accounts: [], transactions: [], categories: [], imports: [] }, accountChanged: true, error: accountChangedMessage });
  };
  const checkOwner = (book: Book) => {
    if (book.ownerId === initial.ownerId) return true;
    clearPrivateData();
    return false;
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot: () => snapshot,
    serverSnapshot: () => serverSnapshot,
    async mutate(command: Command) {
      if (snapshot.accountChanged) throw new Error(accountChangedMessage);
      if (snapshot.saving) throw new Error("正在保存上一笔，请稍候");
      generation++; // Invalidate refreshes even when this mutation fails.
      publish({ saving: true, error: "" });
      try {
        const response = await request("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: initial.ownerId, revision: snapshot.book.revision ?? 0, command }) });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 409 && data.code === "account_changed") {
            clearPrivateData();
          }
          if (response.status === 409 && data.book && checkOwner(data.book)) publish({ book: data.book });
          if (response.status === 401) publish({ error: "登录已过期，请先在另一标签页重新登录。当前填写内容仍保留。" });
          throw new Error(data.error || "保存失败，请稍后重试");
        }
        if (!checkOwner(data)) throw new Error(accountChangedMessage);
        publish({ book: data });
      } catch (error) {
        if (error instanceof TypeError) throw new Error("网络连接中断，保存结果尚未确认。请保留填写内容，刷新账本核对后再提交。");
        throw error;
      } finally { publish({ saving: false }); }
    },
    async refresh() {
      if (snapshot.saving || snapshot.accountChanged || refreshing) return;
      const started = generation;
      const isCurrent = () => started === generation && !snapshot.saving && !snapshot.accountChanged;
      refreshing = true;
      try {
        const etag = bookEtag(snapshot.book);
        const response = await request("/api/book", { cache: "no-store", headers: etag ? { "If-None-Match": etag } : {} });
        if (!isCurrent()) return;
        if (response.status === 304) { publish({ error: "" }); return; }
        if (!response.ok) { publish({ error: response.status === 401 ? "登录已过期，请重新登录后继续。" : "暂时无法同步，正在显示上次载入的账目。" }); return; }
        const book = await response.json() as Book;
        // Headers may arrive before a mutation starts, and the body after it ends.
        if (!isCurrent()) return;
        if (checkOwner(book) && (book.revision ?? 0) >= (snapshot.book.revision ?? 0)) publish({ book, error: "" });
      } catch { if (isCurrent()) publish({ error: "暂时无法同步，请检查网络连接。" }); }
      finally { refreshing = false; }
    },
  };
}
