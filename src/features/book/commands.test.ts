import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCommand, commandSchema } from "./commands";
import { accountBalance, type Book } from "./ledger";

const empty = (): Book => ({ version: 1, accounts: [], transactions: [] });
const account = { id: "my-bank", name: "工资卡", type: "bank" as const, note: "" };

test("新账户期初值不生成消费，修改余额由当前值计算调整分录", () => {
  let book = applyCommand(empty(), { type: "account.save", account, balance: 100000, date: "2026-11-03" });
  assert.equal(book.transactions.length, 0);
  book = applyCommand(book, { type: "account.save", account, balance: 120000, date: "2026-11-03" });
  assert.equal(book.accounts[0].openingBalance, 100000);
  assert.equal(accountBalance(book, account.id), 120000);
  assert.equal(book.transactions[0].kind, "adjustment");
  assert.equal(book.transactions[0].entries.reduce((s, e) => s + e.amount, 0), 0);
});

test("不能更换已有账户类型或创建同名账户", () => {
  const book = applyCommand(empty(), { type: "account.save", account, balance: 0, date: "2026-11-03" });
  assert.throws(() => applyCommand(book, { type: "account.save", account: { ...account, type: "credit" }, balance: 0, date: "2026-11-03" }));
  assert.throws(() => applyCommand(book, { type: "account.save", account: { ...account, id: "another-bank" }, balance: 0, date: "2026-11-03" }));
});

test("交易请求的外来分录被丢弃，服务端重新生成", () => {
  const book = applyCommand(empty(), { type: "account.save", account, balance: 100000, date: "2026-11-03" });
  const command = commandSchema.parse({ type: "transaction.save", id: "lunch", input: {
    kind: "expense", amount: 3500, date: "2026-11-03", category: "food", from: account.id, to: "", note: "", reimbursable: false,
    entries: [{ accountId: account.id, amount: 99999 }],
  } });
  const next = applyCommand(book, command);
  assert.equal(accountBalance(next, account.id), 96500);
  assert.equal(next.transactions[0].entries[0].amount, -3500);
});

test("编号不能伪装成内部账户，输入金额、日期和类型需要合法", () => {
  assert.equal(commandSchema.safeParse({ type: "transaction.delete", id: "opening:my-bank" }).success, false);
  for (const invalid of ["receivable", "equity:opening"]) {
    assert.equal(commandSchema.safeParse({ type: "account.save", account: { ...account, id: invalid }, balance: 0, date: "2026-11-03" }).success, false);
  }
  assert.equal(commandSchema.safeParse({ type: "account.save", account, balance: 1.1, date: "2026-11-03" }).success, false);
  assert.equal(commandSchema.safeParse({ type: "account.save", account, balance: 0, date: "2026-02-30" }).success, false);
});

test("无效估值、删除不存在的交易、从记账表单伪造调整都被拒绝", () => {
  assert.throws(() => applyCommand(empty(), { type: "account.save", account: { ...account, type: "investment" }, balance: -1, date: "2026-11-03" }));
  assert.throws(() => applyCommand(empty(), { type: "transaction.delete", id: "missing" }));
  assert.throws(() => applyCommand(empty(), { type: "transaction.save", id: "fake", input: { kind: "adjustment", from: "increase", to: "my-bank", amount: 100, date: "2026-11-03", category: "余额调整", note: "", reimbursable: false } }));
});
