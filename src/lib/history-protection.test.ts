import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { protectHistory } from "./history-protection";

// Model the browser's asynchronous traversal; a second listener represents the router.
function browser() {
  const events = new EventTarget();
  const entries = [{ url: "/wiki", state: { __NA: true } as Record<string, unknown> }];
  let at = 0;
  const history = {
    get state() { return entries[at].state; },
    pushState(state: Record<string, unknown>, _title: string, url?: string | URL | null) {
      entries.splice(at + 1, entries.length, { state, url: String(url) }); at++;
    },
    replaceState(state: Record<string, unknown>, _title: string, url?: string | URL | null) {
      entries[at] = { state, url: url == null ? entries[at].url : String(url) };
    },
    go(delta: number) {
      queueMicrotask(() => {
        const next = at + delta;
        if (next < 0 || next >= entries.length) return;
        at = next;
        events.dispatchEvent(Object.assign(new Event("popstate"), { state: history.state }));
      });
    },
  };
  return { target: Object.assign(events, { history }) as unknown as Window, history, url: () => entries[at].url };
}

test("后退取消保留 URL 和路由，确认后才卸载草稿页，也能回到工作区外", async () => {
  const { target, history, url } = browser();
  let dirty = false;
  let pending: (() => void) | undefined;
  let navigated = 0;
  const cleanup = protectHistory(target, () => dirty, action => { pending = action; }, () => { navigated++; });
  const rendered: string[] = [];
  target.addEventListener("popstate", () => rendered.push(url()));
  history.pushState({ __NA: true, tree: "router-owned" }, "", "/imports");
  assert.equal(history.state.tree, "router-owned");
  dirty = true;
  history.go(-1);
  await setImmediate();
  assert.equal(url(), "/imports");
  assert.deepEqual(rendered, []);
  assert.equal(navigated, 0);
  assert.ok(pending);
  // Cancel: never invoke the pending action. A later Back must ask again.
  pending = undefined;
  history.go(-1);
  await setImmediate();
  assert.equal(url(), "/imports");
  assert.ok(pending);
  (pending as () => void)();
  await setImmediate();
  assert.equal(url(), "/wiki");
  assert.deepEqual(rendered, ["/wiki"]);
  assert.equal(navigated, 1);
  cleanup();
});

test("筛选历史可前进后退，多步跳转只在确认后交给路由，替换不增加历史", async () => {
  const { target, history, url } = browser();
  let dirty = false;
  let pending: (() => void) | undefined;
  const originalPush = history.pushState;
  const cleanup = protectHistory(target, () => dirty, action => { pending = action; }, () => {});
  history.pushState(null as unknown as Record<string, unknown>, "", "/ledger?month=2026-10");
  history.pushState(null as unknown as Record<string, unknown>, "", "/ledger?month=2026-11");
  history.replaceState({ __NA: true }, "", "/ledger?month=2026-11&q=coffee");
  history.go(-1); await setImmediate();
  assert.equal(url(), "/ledger?month=2026-10");
  history.go(1); await setImmediate();
  assert.equal(url(), "/ledger?month=2026-11&q=coffee");
  dirty = true;
  history.go(-2); await setImmediate();
  assert.equal(url(), "/ledger?month=2026-11&q=coffee");
  assert.ok(pending);
  pending(); await setImmediate();
  assert.equal(url(), "/wiki");
  cleanup();
  assert.equal(history.pushState, originalPush);
});
