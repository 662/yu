import assert from "node:assert/strict";
import { test } from "node:test";
import { createBookStore } from "./book-store";
import { type Book } from "./ledger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const initial = (): Book => ({ version: 1,
  accounts: [{ id: "bank", name: "private test account", type: "bank", openingBalance: 1000, note: "" }],
  transactions: [{ id: "transaction-1", kind: "expense", amount: 100, date: "2026-01-01", category: "food", from: "bank", to: "", note: "private test transaction", reimbursable: false, entries: [{ accountId: "bank", amount: -100 }, { accountId: "expense:food", amount: 100 }] }], revision: 0, ownerId: "alice", imports: [{ id: "batch", source: "wechat", filename: "private.csv", createdAt: "2026-11-04T00:00:00Z", rolledBack: false, items: [{ key: "order", transactionId: "transaction-1", signature: "private details" }] }] });
const command = { type: "transaction.delete", id: "transaction-1" } as const;
const json = (value: unknown, status = 200) => Response.json(value, { status });

test("较早刷新请求的正文不能覆盖之后成功保存的账目", async () => {
  const body = deferred<Book>(), reading = deferred<void>();
  const book = initial(), saved = { ...book, revision: 1, transactions: [] };
  const request: typeof fetch = async (_url, options) => options?.method === "POST" ? json(saved) : { ok: true, status: 200, json: () => { reading.resolve(); return body.promise; } } as Response;
  const store = createBookStore(book, request);
  const refresh = store.refresh();
  await reading.promise;
  await store.mutate(command);
  body.resolve(book);
  await refresh;
  assert.equal(store.snapshot().book.revision, 1);
  assert.deepEqual(store.snapshot().book.transactions, []);
});

test("刷新请求晚到的网络错误不会覆盖保存后的状态", async () => {
  const pending = deferred<Response>();
  const store = createBookStore(initial(), async (_url, options) => options?.method === "POST" ? json({ ...initial(), revision: 1 }) : pending.promise);
  const refresh = store.refresh();
  await store.mutate(command);
  pending.reject(new Error("offline"));
  await refresh;
  assert.equal(store.snapshot().error, "");
  assert.equal(store.snapshot().book.revision, 1);
});

test("失败的保存也使较早的刷新失效，以保留保存结果不确定的提示", async () => {
  const body = deferred<Book>(), reading = deferred<void>();
  const store = createBookStore(initial(), async (_url, options) => {
    if (options?.method === "POST") throw new TypeError("offline");
    return { ok: true, json: () => { reading.resolve(); return body.promise; } } as Response;
  });
  const refresh = store.refresh();
  await reading.promise;
  await assert.rejects(store.mutate(command), /保存结果尚未确认/);
  body.resolve({ ...initial(), revision: 100 });
  await refresh;
  assert.equal(store.snapshot().book.revision, 0);
});

test("相同版本使用账号绑定的 ETag，304 不读取正文，重复刷新合并", async () => {
  const pending = deferred<Response>();
  let count = 0;
  const store = createBookStore(initial(), async (_url, options) => {
    count++;
    assert.equal(new Headers(options?.headers).get("If-None-Match"), '"alice:0"');
    return pending.promise;
  });
  const refresh = store.refresh();
  await store.refresh();
  assert.equal(count, 1);
  pending.resolve(new Response(null, { status: 304 }));
  await refresh;
  assert.equal(store.snapshot().book.ownerId, "alice");
  assert.equal(store.snapshot().error, "");
});

for (const via of ["refresh", "mutation"] as const) {
  test(`通过 ${via} 检测账号切换后清空全部私有数据，并永久阻止旧工作区请求`, async () => {
    let count = 0;
    const store = createBookStore(initial(), async () => {
      count++;
      return via === "refresh" ? json({ ...initial(), ownerId: "bob" }) : json({ code: "account_changed", error: "changed" }, 409);
    });
    if (via === "refresh") await store.refresh();
    else await assert.rejects(store.mutate(command));
    assert.equal(store.snapshot().accountChanged, true);
    assert.deepEqual(store.snapshot().book, { version: 1, accounts: [], transactions: [], categories: [], imports: [] });
    assert.equal(JSON.stringify(store.snapshot()).includes("private"), false);
    await assert.rejects(store.mutate(command), /登录账号已变更/);
    await store.refresh();
    assert.equal(count, 1);
  });
}

test("异常的成功响应属于其他账号时清理数据并拒绝报告保存成功", async () => {
  const store = createBookStore(initial(), async () => json({ ...initial(), ownerId: "bob" }));
  await assert.rejects(store.mutate(command), /登录账号已变更/);
  assert.equal(store.snapshot().accountChanged, true);
});

test("同账号的较低版本响应不会让账本回退；冲突响应可以载入较新账本", async () => {
  const book = { ...initial(), revision: 5 };
  const store = createBookStore(book, async (_url, options) => options?.method === "POST" ? json({ error: "conflict", book: { ...book, revision: 6 } }, 409) : json({ ...book, revision: 4 }));
  await store.refresh();
  assert.equal(store.snapshot().book.revision, 5);
  await assert.rejects(store.mutate(command), /conflict/);
  assert.equal(store.snapshot().book.revision, 6);
});
