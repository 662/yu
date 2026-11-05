import { applyImport, commitSchema, rollbackSchema } from "../import/commands";
import { z } from "zod";
import { accountBalance, saveTransaction, removeTransaction, type Book, type TransactionInput } from "./ledger";
import { bookCategories, categoryIconNames, categoryTones } from "./categories";

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).refine((v) => v !== "receivable", "账户编号无效");
const cents = z.number().int().min(0).max(99999999999);
const transactionInput = z.object({
  kind: z.enum(["expense", "income", "transfer", "repayment", "reimbursement", "adjustment"]),
  amount: cents.positive(), date: z.iso.date(), category: z.string().min(1).max(80),
  from: z.string().max(80), to: z.string().max(80), note: z.string().max(200),
  reimbursable: z.boolean(), reimbursementFor: id.optional(),
});

export const commandSchema = z.discriminatedUnion("type", [
  commitSchema, rollbackSchema,
  z.object({ type: z.literal("category.save"), category: z.object({
    id: z.string().min(1).max(80).regex(/^[\p{L}\p{N}_-]+$/u), name: z.string().trim().min(1).max(20),
    kind: z.enum(["expense", "income"]), icon: z.enum(categoryIconNames), tone: z.enum(categoryTones),
  }) }),
  z.object({ type: z.literal("category.archive"), id: z.string().min(1).max(80), archived: z.boolean() }),
  z.object({ type: z.literal("category.delete"), id: z.string().min(1).max(80) }),
  z.object({ type: z.literal("category.reorder"), kind: z.enum(["expense", "income"]), ids: z.array(z.string().min(1).max(80)).max(100) }),
  z.object({ type: z.literal("transaction.save"), id, input: transactionInput }),
  z.object({ type: z.literal("transaction.delete"), id }),
  z.object({ type: z.literal("account.save"), account: z.object({
    id, name: z.string().trim().min(1).max(30), type: z.enum(["bank", "balance", "cash", "credit", "investment"]),
    note: z.string().trim().max(100),
  }), balance: z.number().int().min(-99999999999).max(99999999999), date: z.iso.date() }),
]);
export const requestSchema = z.object({ ownerId: z.uuid(), revision: z.number().int().nonnegative(), command: commandSchema });
export type Command = z.infer<typeof commandSchema>;

export function applyCommand(book: Book, command: Command): Book {
  if (command.type === "import.commit" || command.type === "import.rollback") return applyImport(book, command);
  const categories = bookCategories(book);
  if (command.type === "category.save") {
    const c = { ...command.category, name: command.category.name.trim() };
    if (!c.name || c.name.length > 20) throw new Error("分类名称需为 1 至 20 个字符");
    const old = categories.find((existing) => existing.id === c.id);
    if (old && old.kind !== c.kind) throw new Error("不能更换分类的收支类型");
    if (categories.some((existing) => existing.id !== c.id && existing.kind === c.kind && existing.name.normalize("NFKC").toLowerCase() === c.name.normalize("NFKC").toLowerCase())) throw new Error("该类型已有同名分类，请修改名称或恢复已停用的分类");
    if (!old && categories.filter((existing) => existing.kind === c.kind).length >= 100) throw new Error("每种收支类型最多支持 100 个分类");
    const next = { ...c, archived: old?.archived ?? false, preset: old?.preset ?? false, order: old?.order ?? Math.max(-1, ...categories.filter((existing) => existing.kind === c.kind).map((existing) => existing.order)) + 1 };
    return { ...book, categories: old ? categories.map((existing) => existing.id === c.id ? next : existing) : [...categories, next] };
  }
  if (command.type === "category.reorder") {
    const group = categories.filter((c) => c.kind === command.kind);
    if (new Set(command.ids).size !== group.length || command.ids.length !== group.length || !group.every((c) => command.ids.includes(c.id))) throw new Error("分类顺序已发生变化，请刷新后再试");
    return { ...book, categories: categories.map((c) => c.kind === command.kind ? { ...c, order: command.ids.indexOf(c.id) } : c) };
  }
  if (command.type === "category.archive" || command.type === "category.delete") {
    const old = categories.find((c) => c.id === command.id);
    if (!old) throw new Error("这个分类不存在，可能已在其他设备修改");
    if (command.type === "category.delete") {
      if (old.preset) throw new Error("预设分类会保留，不使用时可以停用");
      if (book.transactions.some((t) => t.kind === old.kind && t.category === old.id)) throw new Error("这个分类已被账目使用，请改为停用以保留历史");
    }
    if ((command.type === "category.delete" || command.archived) && !old.archived && categories.filter((c) => c.kind === old.kind && !c.archived).length <= 1) throw new Error("每种收支类型至少保留一个启用的分类");
    return { ...book, categories: command.type === "category.delete" ? categories.filter((c) => c.id !== old.id) : categories.map((c) => c.id === old.id ? { ...c, archived: command.archived } : c) };
  }
  if (command.type === "transaction.save") {
    const old = book.transactions.find((t) => t.id === command.id);
    if (old && (old.kind === "reimbursement" || old.kind === "adjustment")) throw new Error("到账和余额调整记录仅支持删除后重新记录");
    if (command.input.kind === "adjustment") throw new Error("请通过核对账户余额进行调整");
    return saveTransaction(book, command.input, command.id);
  }
  if (command.type === "transaction.delete") {
    if (!book.transactions.some((t) => t.id === command.id)) throw new Error("这笔账不存在，可能已在其他设备删除");
    return removeTransaction(book, command.id);
  }
  const { account, balance, date } = command;
  const old = book.accounts.find((a) => a.id === account.id);
  if (book.accounts.some((a) => a.id !== account.id && a.name === account.name)) throw new Error("已有同名账户，请换个名称");
  if (old && old.type !== account.type) throw new Error("已创建的账户不能变更类型");
  if (account.type === "investment" && balance < 0) throw new Error("投资估值不能小于零");
  const nextAccount = { ...account, openingBalance: old?.openingBalance ?? balance };
  const next = { ...book, accounts: old ? book.accounts.map((a) => a.id === account.id ? nextAccount : a) : [...book.accounts, nextAccount] };
  if (!old) return next;
  const delta = balance - accountBalance(book, account.id);
  if (!delta) return next;
  const input: TransactionInput = {
    kind: "adjustment", amount: Math.abs(delta), date, category: account.type === "investment" ? "估值调整" : "余额调整",
    from: delta < 0 ? "decrease" : "increase", to: account.id, note: account.type === "investment" ? "更新投资估值" : "核对账户余额", reimbursable: false,
  };
  return saveTransaction(next, input, crypto.randomUUID());
}
