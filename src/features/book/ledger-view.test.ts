import assert from "node:assert/strict";
import { test } from "node:test";
import { filterTransactions } from "./ledger-view";
import { saveTransaction, type Book } from "./ledger";

const account = { id: "cash", name: "测试现金", type: "cash" as const, openingBalance: 100000, note: "" };
let book: Book = { version: 1, accounts: [account], transactions: [] };
for (const [id, date, reimbursable, note] of [
  ["old", "2026-09-10", false, "旧月份消费"],
  ["pending", "2026-09-12", true, "跨月垫付"],
  ["current", "2026-11-05", false, "当月消费"],
] as const) book = saveTransaction(book, { kind: "expense", amount: 1200, date, category: "food", from: "cash", to: "", note, reimbursable }, id);
const options = { month: "2026-11", scope: "month" as const, filter: "all" as const, account: "", query: "" };

test("月份明细与跨月搜索使用明确的时间范围", () => {
  assert.deepEqual(filterTransactions(book, options).map(t => t.id), ["current"]);
  assert.equal(filterTransactions(book, { ...options, query: "旧月份" }).length, 0);
  assert.deepEqual(filterTransactions(book, { ...options, scope: "all", query: "旧月份" }).map(t => t.id), ["old"]);
});

test("待报销跨月展示，已全部报销后移出列表", () => {
  assert.deepEqual(filterTransactions(book, { ...options, filter: "pending" }).map(t => t.id), ["pending"]);
  const reimbursed = saveTransaction(book, { kind: "reimbursement", amount: 1200, date: "2026-11-05", category: "报销", from: "", to: "cash", note: "", reimbursable: false, reimbursementFor: "pending" }, "paid");
  assert.equal(filterTransactions(reimbursed, { ...options, filter: "pending" }).length, 0);
});

test("账户全部时间明细包含历史账目，分类按 ID 精确筛选", () => {
  assert.equal(filterTransactions(book, { ...options, scope: "all", account: "cash" }).length, 3);
  assert.equal(filterTransactions(book, { ...options, scope: "all", account: "missing" }).length, 0);
  assert.deepEqual(filterTransactions(book, { ...options, category: "food" }).map(t => t.id), ["current"]);
  assert.equal(filterTransactions(book, { ...options, category: "shopping", query: "消费" }).length, 0);
});
