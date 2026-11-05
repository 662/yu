import assert from "node:assert/strict";
import { test } from "node:test";
import { accountBalance, saveTransaction, outstanding, summarizeBook, type Book, type Transaction } from "./ledger";

test("单次聚合与逐笔推导的余额、报销及净资产一致", () => {
  const book = saveTransaction({ version: 1, accounts: [
    { id: "bank", name: "测试账户", type: "bank", openingBalance: 20000, note: "" },
    { id: "credit", name: "测试负债", type: "credit", openingBalance: -1000, note: "" },
  ], transactions: [] }, { kind: "expense", amount: 10000, date: "2026-11-04", category: "food", from: "bank", to: "", note: "", reimbursable: true }, "expense");
  const original = book.transactions.find(t => t.reimbursable)!;
  book.transactions.push({ id: "repaid", kind: "reimbursement", amount: 5000, date: "2026-11-04", category: "报销", from: "", to: "bank", note: "", reimbursable: false, reimbursementFor: original.id, entries: [{ accountId: "bank", amount: 5000 }, { accountId: "receivable", amount: -5000 }] });
  const summary = summarizeBook(book);
  for (const account of book.accounts) assert.equal(summary.balances.get(account.id), accountBalance(book, account.id));
  for (const t of book.transactions.filter(t => t.reimbursable)) assert.equal(summary.remaining.get(t.id), outstanding(book, t.id));
  assert.equal(summary.receivable, original.amount - 5000);
  assert.equal(summary.net, summary.assets - summary.debts);
});

test("多笔垫付与部分报销聚合后余额及净资产一致", () => {
  const transactions: Transaction[] = [];
  for (let i = 0; i < 50; i++) {
    transactions.push({ id: `expense-${i}`, kind: "expense", amount: 100, date: "2026-11-04", category: "food", from: "bank", to: "", note: "", reimbursable: true, entries: [{ accountId: "bank", amount: -100 }, { accountId: "receivable", amount: 100 }] });
    transactions.push({ id: `repayment-${i}`, kind: "reimbursement", amount: 40, date: "2026-11-04", category: "报销", from: "", to: "bank", note: "", reimbursable: false, reimbursementFor: `expense-${i}`, entries: [{ accountId: "bank", amount: 40 }, { accountId: "receivable", amount: -40 }] });
  }
  const book: Book = { version: 1, accounts: [{ id: "bank", name: "测试", type: "bank", openingBalance: 10000000, note: "" }], transactions };
  const summary = summarizeBook(book);
  assert.equal(summary.balances.get("bank"), 9997000);
  assert.equal(summary.receivable, 3000);
  assert.equal(summary.remaining.size, 50);
  assert.equal(summary.net, 10000000);
});
