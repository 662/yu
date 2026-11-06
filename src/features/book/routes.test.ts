import assert from "node:assert/strict";
import { test } from "node:test";
import { ledgerHref, readLedgerLocation } from "./routes";
import { filterTransactions } from "./ledger-view";
import { saveTransaction, type Book } from "./ledger";

const today = "2026-11-06";
test("账目 URL 校验月份和枚举，缺省时查看本月", () => {
  for (const month of ["", "2026-00", "2026-13", "0000-01", "2026-1", "bad"]) {
    const location = readLedgerLocation(new URLSearchParams({ month, scope: "invalid", type: "invalid" }), today);
    assert.equal(location.month, "2026-11");
    assert.equal(location.scope, "month");
    assert.equal(location.filter, "all");
  }
});

test("复制 URL 后还原全部筛选，编码特殊字符且忽略非筛选参数", () => {
  const location = { month: "2026-09", scope: "all" as const, filter: "expense" as const, query: "午饭 & 咖啡?", account: "bank/a+b", category: "food" };
  const href = ledgerHref(location);
  assert.equal(new URL(href, "https://example.com").pathname, "/ledger");
  assert.deepEqual(readLedgerLocation(new URL(href, "https://example.com").searchParams, today), location);
  assert.equal(ledgerHref({ filter: "all", scope: "month", query: "" }), "/ledger");
  assert.equal(ledgerHref(readLedgerLocation(new URLSearchParams("page=accounts&unknown=value"), today)), "/ledger?month=2026-11");
});

test("账户深链接查看所有月份，待报销深链接包含跨月垫付", () => {
  let book: Book = { version: 1, accounts: [{ id: "cash", name: "现金", type: "cash", openingBalance: 10000, note: "" }], transactions: [] };
  book = saveTransaction(book, { kind: "expense", amount: 100, date: "2026-09-01", category: "food", from: "cash", to: "", note: "", reimbursable: true }, "pending");
  for (const href of [ledgerHref({ scope: "all", account: "cash" }), ledgerHref({ filter: "pending" })]) {
    const location = readLedgerLocation(new URL(href, "https://example.com").searchParams, today);
    assert.deepEqual(filterTransactions(book, location).map(t => t.id), ["pending"]);
  }
});
