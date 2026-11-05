import { categoryName } from "./categories";
import { summarizeBook, type Book, type Transaction } from "./ledger";

export type LedgerFilter = "all" | "expense" | "income" | "transfer" | "pending";
export type TimeScope = "month" | "all";

export function filterTransactions(book: Book, options: { month: string; scope: TimeScope; filter: LedgerFilter; account: string; query: string; category?: string }) {
  const { remaining } = summarizeBook(book);
  const names = new Map(book.accounts.map(a => [a.id, a.name]));
  const query = options.query.trim().toLowerCase();
  return book.transactions.filter(t => {
    if (options.scope === "month" && options.filter !== "pending" && !t.date.startsWith(options.month)) return false;
    if (options.filter === "expense" && (t.kind !== "expense" || t.reimbursable)) return false;
    if (options.filter === "income" && t.kind !== "income") return false;
    if (options.filter === "transfer" && t.kind !== "transfer" && t.kind !== "repayment") return false;
    if (options.filter === "pending" && (!t.reimbursable || (remaining.get(t.id) ?? 0) <= 0)) return false;
    if (options.account && !t.entries.some(e => e.accountId === options.account)) return false;
    if (options.category && t.category !== options.category) return false;
    const category = t.kind === "expense" || t.kind === "income" ? categoryName(book, t.kind, t.category) : t.category;
    return `${t.note} ${category} ${names.get(t.from) ?? ""} ${names.get(t.to) ?? ""} ${t.amount / 100}`.toLowerCase().includes(query);
  }).sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date));
}
