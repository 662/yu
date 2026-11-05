import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCommand, commandSchema } from "./commands";
import { activeCategories, bookCategories, categoryName, defaultCategories } from "./categories";
import { saveTransaction, type Book, type TransactionInput } from "./ledger";

const empty = (): Book => ({ version: 1, categories: defaultCategories(), accounts: [{ id: "bank", name: "银行卡", type: "bank", openingBalance: 100000, note: "" }], transactions: [] });
const custom = { id: "custom-pets", name: "宠物", kind: "expense" as const, icon: "PawPrint" as const, tone: "pink" as const };
const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({ kind: "expense", amount: 1000, date: "2026-11-03", category: custom.id, from: "bank", to: "", note: "猫粮", reimbursable: false, ...overrides });

test("旧账本和新账本均保留 8 个支出与 3 个收入预设，默认配置不共享可变引用", () => {
  assert.equal(activeCategories({}, "expense").length, 8);
  assert.equal(activeCategories({}, "income").length, 3);
  const defaults = defaultCategories(); defaults[0].name = "修改";
  assert.equal(defaultCategories()[0].name, "餐饮");
  assert.equal(defaultCategories().find((c) => c.id === "工资")?.name, "工资");
});

test("自定义分类可用于记账，并沿用稳定的复式科目标识", () => {
  let book = applyCommand(empty(), { type: "category.save", category: custom });
  book = applyCommand(book, { type: "transaction.save", id: "cat-food", input: input() });
  assert.equal(book.transactions[0].entries[1].accountId, "expense:custom-pets");
  assert.equal(book.transactions[0].entries.reduce((sum, e) => sum + e.amount, 0), 0);
  const before = structuredClone(book.transactions);
  book = applyCommand(book, { type: "category.save", category: { ...custom, name: "毛孩子", icon: "HeartPulse", tone: "green" } });
  assert.deepEqual(book.transactions, before);
  assert.equal(categoryName(book, "expense", custom.id), "毛孩子");
});

test("停用阻止新交易，但原分类的历史交易仍能修改和统计", () => {
  let book = applyCommand(empty(), { type: "category.save", category: custom });
  book = saveTransaction(book, input(), "existing");
  book = applyCommand(book, { type: "category.archive", id: custom.id, archived: true });
  assert.equal(activeCategories(book, "expense").some((c) => c.id === custom.id), false);
  assert.throws(() => saveTransaction(book, input(), "new"), /停用/);
  book = saveTransaction(book, input({ amount: 1500, note: "修正金额" }), "existing");
  assert.equal(book.transactions[0].category, custom.id);
  assert.equal(book.transactions[0].amount, 1500);
  book = applyCommand(book, { type: "category.archive", id: custom.id, archived: false });
  assert.doesNotThrow(() => saveTransaction(book, input(), "restored"));
});

test("预设不可删除，已被使用的自定义分类也不能删除", () => {
  assert.throws(() => applyCommand(empty(), { type: "category.delete", id: "food" }), /预设/);
  let book = applyCommand(empty(), { type: "category.save", category: custom });
  const without = applyCommand(book, { type: "category.delete", id: custom.id });
  assert.equal(bookCategories(without).some((c) => c.id === custom.id), false);
  book = saveTransaction(book, input(), "used");
  assert.throws(() => applyCommand(book, { type: "category.delete", id: custom.id }), /历史/);
});

test("每个类型至少保留一个启用分类，并拒绝同类型同名或更改收支类型", () => {
  let book = empty();
  const expense = activeCategories(book, "expense");
  for (const category of expense.slice(0, -1)) book = applyCommand(book, { type: "category.archive", id: category.id, archived: true });
  assert.throws(() => applyCommand(book, { type: "category.archive", id: expense.at(-1)!.id, archived: true }), /至少/);
  assert.throws(() => applyCommand(book, { type: "category.save", category: { ...custom, name: "餐饮" } }), /同名/);
  assert.throws(() => applyCommand(book, { type: "category.save", category: { ...custom, id: "food", kind: "income" } }), /类型/);
  assert.throws(() => applyCommand(book, { type: "category.save", category: { ...custom, name: " " } }), /名称/);
});

test("排序仅改变显示顺序，必须包括当前类型的全部分类且不重复", () => {
  const book = saveTransaction(empty(), input({ category: "food" }), "transaction-1");
  const ids = bookCategories(book).filter((c) => c.kind === "expense").map((c) => c.id).reverse();
  const next = applyCommand(book, { type: "category.reorder", kind: "expense", ids });
  assert.deepEqual(bookCategories(next).filter((c) => c.kind === "expense").map((c) => c.id), ids);
  assert.deepEqual(next.transactions, book.transactions);
  assert.throws(() => applyCommand(book, { type: "category.reorder", kind: "expense", ids: ids.slice(1) }));
  assert.throws(() => applyCommand(book, { type: "category.reorder", kind: "expense", ids: ids.map(() => ids[0]) }));
});

test("自定义收入与重命名收入保留科目编号，未知分类和非法图标被拒绝", () => {
  let book = applyCommand(empty(), { type: "category.save", category: { ...custom, id: "income-rent", kind: "income", name: "租金" } });
  book = saveTransaction(book, input({ kind: "income", category: "income-rent", from: "", to: "bank" }), "rent");
  assert.equal(book.transactions[0].entries[1].accountId, "income:income-rent");
  const salary = bookCategories(book).find((c) => c.id === "工资")!;
  book = applyCommand(book, { type: "category.save", category: { ...salary, name: "薪水" } });
  assert.equal(categoryName(book, "income", "工资"), "薪水");
  assert.throws(() => saveTransaction(book, input({ category: "not-in-this-book" }), "bad"));
  assert.equal(commandSchema.safeParse({ type: "category.save", category: { ...custom, icon: "script" } }).success, false);
});
