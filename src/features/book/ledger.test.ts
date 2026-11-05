import assert from "node:assert/strict";
import { test } from "node:test";
import { accountBalance, outstanding, parseMoney, removeTransaction, saveTransaction, totals, type Book, type TransactionInput } from "./ledger";

const blank = (): Book => ({ version: 1, accounts: [
  { id: "bank", name: "银行卡", type: "bank", openingBalance: 100000, note: "" },
  { id: "balance", name: "零钱", type: "balance", openingBalance: 0, note: "" },
  { id: "credit", name: "信用卡", type: "credit", openingBalance: -20000, note: "" },
], transactions: [] });

const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({ kind: "expense", amount: 3500, from: "bank", to: "", category: "food", date: "2026-11-03", note: "午餐", reimbursable: false, ...overrides });

test("金额以整数分保存，拒绝额外小数、指数及无效字符", () => {
  assert.equal(parseMoney("0.10"), 10);
  assert.equal(parseMoney("35.5"), 3550);
  assert.equal(parseMoney("0.29"), 29);
  for (const value of ["1.001", "NaN", "1e3", "-5", "", "1,000", "0x12"]) assert.throws(() => parseMoney(value));
});

test("消费减少资产，借贷分录始终平衡", () => {
  const book = saveTransaction(blank(), input(), "expense");
  assert.equal(accountBalance(book, "bank"), 96500);
  assert.equal(totals(book).net, 76500);
  assert.equal(book.transactions[0].entries.reduce((s, e) => s + e.amount, 0), 0);
});

test("转账与还信用卡不改变净资产", () => {
  const before = totals(blank()).net;
  let book = saveTransaction(blank(), input({ kind: "transfer", amount: 10000, to: "balance" }), "transfer");
  assert.equal(accountBalance(book, "balance"), 10000);
  book = saveTransaction(book, input({ kind: "repayment", amount: 20000, to: "credit" }), "repayment");
  assert.equal(accountBalance(book, "credit"), 0);
  assert.equal(totals(book).net, before);
});

test("垫付及分次报销不改变净资产，禁止超额报销", () => {
  let book = saveTransaction(blank(), input({ amount: 12600, reimbursable: true }), "advance");
  assert.equal(totals(book).net, 80000);
  assert.equal(outstanding(book, "advance"), 12600);
  book = saveTransaction(book, input({ kind: "reimbursement", from: "", to: "balance", amount: 6000, reimbursementFor: "advance" }), "partial");
  assert.equal(outstanding(book, "advance"), 6600);
  assert.equal(totals(book).net, 80000);
  assert.throws(() => saveTransaction(book, input({ kind: "reimbursement", to: "balance", amount: 7000, reimbursementFor: "advance" }), "too-much"));
  book = saveTransaction(book, input({ kind: "reimbursement", to: "bank", amount: 6600, reimbursementFor: "advance" }), "rest");
  assert.equal(outstanding(book, "advance"), 0);
  assert.equal(totals(book).net, 80000);
});

test("修改和删除交易时重新推导余额，不累加旧的资金变动", () => {
  let book = saveTransaction(blank(), input(), "one");
  book = saveTransaction(book, input({ amount: 5000, from: "balance" }), "one");
  assert.equal(book.transactions.length, 1);
  assert.equal(accountBalance(book, "bank"), 100000);
  assert.equal(accountBalance(book, "balance"), -5000);
  book = removeTransaction(book, "one");
  assert.equal(accountBalance(book, "balance"), 0);
});

test("删除垫付时关联回款一并移除，并恢复所有余额", () => {
  let book = saveTransaction(blank(), input({ reimbursable: true }), "advance");
  book = saveTransaction(book, input({ kind: "reimbursement", to: "balance", amount: 3500, reimbursementFor: "advance" }), "return");
  book = removeTransaction(book, "advance");
  assert.deepEqual(book, blank());
});

test("已有回款时不能把垫付改为普通消费或降低至回款以下", () => {
  let book = saveTransaction(blank(), input({ reimbursable: true }), "advance");
  book = saveTransaction(book, input({ kind: "reimbursement", to: "balance", amount: 2000, reimbursementFor: "advance" }), "return");
  assert.throws(() => saveTransaction(book, input({ amount: 1000, reimbursable: true }), "advance"));
  assert.throws(() => saveTransaction(book, input(), "advance"));
  assert.throws(() => saveTransaction(book, input({ kind: "income", to: "bank" }), "advance"));
  assert.throws(() => saveTransaction(book, input({ date: "2026-11-04", reimbursable: true }), "advance"));
});

test("拒绝相同账户转账、错误还款账户、无效日期和零金额", () => {
  assert.throws(() => saveTransaction(blank(), input({ kind: "transfer", to: "bank" }), "bad"));
  assert.throws(() => saveTransaction(blank(), input({ kind: "repayment", to: "balance" }), "bad"));
  assert.throws(() => saveTransaction(blank(), input({ from: "missing" }), "bad"));
  assert.throws(() => saveTransaction(blank(), input({ date: "2026-02-30" }), "bad"));
  assert.throws(() => saveTransaction(blank(), input({ amount: 0 }), "bad"));
});

test("收入及余额调整生成平衡分录", () => {
  let book = saveTransaction(blank(), input({ kind: "income", to: "bank", category: "工资", amount: 10000 }), "salary");
  book = saveTransaction(book, input({ kind: "adjustment", to: "bank", from: "decrease", amount: 100 }), "adjustment");
  assert.equal(accountBalance(book, "bank"), 109900);
  for (const t of book.transactions) {
    assert.equal(t.entries.reduce((s, e) => s + e.amount, 0), 0);
    assert.equal(t.entries.length, 2);
  }
});
