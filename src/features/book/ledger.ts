import type { ImportBatch } from "../import/types";
import { bookCategories, type Category } from "./categories";

export type AccountType = "bank" | "balance" | "cash" | "credit" | "investment";
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  note: string;
};

export type Kind = "expense" | "income" | "transfer" | "repayment" | "reimbursement" | "adjustment";
export type Entry = { accountId: string; amount: number };
export type Transaction = {
  id: string;
  kind: Kind;
  amount: number;
  date: string;
  category: string;
  from: string;
  to: string;
  note: string;
  reimbursable: boolean;
  reimbursementFor?: string;
  entries: Entry[];
};
export type Book = { version: 1; revision?: number; ownerId?: string; categories?: Category[]; imports?: ImportBatch[]; accounts: Account[]; transactions: Transaction[] };
export type TransactionInput = Omit<Transaction, "id" | "entries">;

export function money(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseMoney(value: string): number {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim())) throw new Error("请输入有效金额，最多保留两位小数");
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function accountBalance(book: Book, id: string): number {
  const account = book.accounts.find((a) => a.id === id);
  return (account?.openingBalance ?? 0) + book.transactions.reduce((sum, t) =>
    sum + t.entries.filter((e) => e.accountId === id).reduce((n, e) => n + e.amount, 0), 0);
}

export function outstanding(book: Book, id: string): number {
  const t = book.transactions.find((t) => t.id === id);
  if (!t?.reimbursable) return 0;
  return t.amount - book.transactions.filter((r) => r.reimbursementFor === id).reduce((sum, r) => sum + r.amount, 0);
}

export function summarizeBook(book: Book) {
  const balances = new Map(book.accounts.map(a => [a.id, a.openingBalance]));
  const repayments = new Map<string, number>();
  for (const t of book.transactions) {
    for (const entry of t.entries) {
      if (balances.has(entry.accountId)) balances.set(entry.accountId, balances.get(entry.accountId)! + entry.amount);
    }
    if (t.reimbursementFor) repayments.set(t.reimbursementFor, (repayments.get(t.reimbursementFor) ?? 0) + t.amount);
  }
  const remaining = new Map<string, number>();
  let receivable = 0;
  for (const t of book.transactions) {
    if (t.reimbursable) {
      const amount = t.amount - (repayments.get(t.id) ?? 0);
      remaining.set(t.id, amount);
      receivable += amount;
    }
  }
  let assets = receivable, debts = 0;
  for (const balance of balances.values()) {
    assets += Math.max(0, balance);
    debts -= Math.min(0, balance);
  }
  return { balances, remaining, assets, debts, receivable, net: assets - debts };
}

export function totals(book: Book) {
  const { assets, debts, receivable, net } = summarizeBook(book);
  return { assets, debts, receivable, net };
}

export function createTransaction(book: Book, input: TransactionInput, id: string): Transaction {
  const { amount, kind, from, to } = input;
  if (!["expense", "income", "transfer", "repayment", "reimbursement", "adjustment"].includes(kind)) throw new Error("无效的交易类型");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 99999999999) throw new Error("金额需大于 0，且小于十亿元");
  const parsedDate = new Date(`${input.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) throw new Error("请选择有效日期");
  if (input.note.length > 200) throw new Error("备注最多 200 字");
  const requireAccount = (accountId: string) => {
    const account = book.accounts.find((a) => a.id === accountId);
    if (!account) throw new Error("请选择有效账户");
    return account;
  };
  const entries: Entry[] = [];
  if (kind === "expense" || kind === "income") {
    const category = bookCategories(book).find((c) => c.id === input.category && c.kind === kind);
    if (!category) throw new Error("请选择有效分类");
    const old = book.transactions.find((t) => t.id === id);
    if (category.archived && !(old?.kind === kind && old.category === category.id)) throw new Error("这个分类已停用，请选择其他分类");
  }
  if (kind === "expense") {
    requireAccount(from);
    const reimbursed = book.transactions.filter((r) => r.reimbursementFor === id).reduce((sum, r) => sum + r.amount, 0);
    if (reimbursed && (!input.reimbursable || amount < reimbursed)) throw new Error("已有报销回款，金额不可小于已收款金额");
    if (book.transactions.some((r) => r.reimbursementFor === id && r.date < input.date)) throw new Error("垫付日期不能晚于已有的报销到账日期");
    entries.push({ accountId: from, amount: -amount }, { accountId: input.reimbursable ? "receivable" : `expense:${input.category}`, amount });
  } else if (kind === "income") {
    requireAccount(to);
    entries.push({ accountId: to, amount }, { accountId: `income:${input.category}`, amount: -amount });
  } else if (kind === "transfer" || kind === "repayment") {
    const source = requireAccount(from);
    const target = requireAccount(to);
    if (from === to) throw new Error("转出和转入账户不能相同");
    if (kind === "repayment" && (target.type !== "credit" || source.type === "credit")) throw new Error("请选择付款账户和待还款的信用卡");
    entries.push({ accountId: from, amount: -amount }, { accountId: to, amount });
  } else if (kind === "reimbursement") {
    requireAccount(to);
    const original = book.transactions.find((t) => t.id === input.reimbursementFor && t.reimbursable);
    if (!original || outstanding(book, original.id) < amount) throw new Error("报销金额不能超过待报销金额");
    if (input.date < original.date) throw new Error("到账日期不能早于垫付日期");
    entries.push({ accountId: to, amount }, { accountId: "receivable", amount: -amount });
  } else {
    requireAccount(to);
    if (from !== "decrease" && from !== "increase") throw new Error("无效的余额调整方向");
    entries.push({ accountId: to, amount: from === "decrease" ? -amount : amount }, { accountId: "equity:adjustment", amount: from === "decrease" ? amount : -amount });
  }
  return {
    ...input,
    from: kind === "income" || kind === "reimbursement" ? "" : input.from,
    to: kind === "expense" ? "" : input.to,
    reimbursable: kind === "expense" && input.reimbursable,
    reimbursementFor: kind === "reimbursement" ? input.reimbursementFor : undefined,
    id,
    entries,
  };
}

export function saveTransaction(book: Book, input: TransactionInput, id: string): Book {
  const existing = book.transactions.find((t) => t.id === id);
  if (existing?.reimbursable && existing.kind !== input.kind && outstanding(book, id) !== existing.amount) throw new Error("已有报销回款，不能修改交易类型");
  const transaction = createTransaction(book, input, id);
  return { ...book, transactions: [transaction, ...book.transactions.filter((t) => t.id !== id)] };
}

export function removeTransaction(book: Book, id: string): Book {
  return { ...book, transactions: book.transactions.filter((t) => t.id !== id && t.reimbursementFor !== id) };
}

export const accountTypeNames: Record<AccountType, string> = {
  bank: "银行卡", balance: "平台余额", cash: "现金", credit: "信用卡", investment: "投资账户",
};
