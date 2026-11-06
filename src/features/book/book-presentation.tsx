import { categoryName } from "./categories";
import { kindNames } from "./forms";
import { money, type Book, type Transaction } from "./ledger";

export function transactionTitle(t: Transaction, book: Book) {
  if (t.kind === "expense" || t.kind === "income") return categoryName(book, t.kind, t.category);
  if (t.kind === "adjustment") return t.category;
  return kindNames[t.kind];
}

export function Amount({ value, currency = false }: { value: number; currency?: boolean }) {
  const [whole, decimal] = money(value).split(".");
  return <span className="money">{currency && <span className="currency">¥</span>}{whole}<span className="money-decimal">.{decimal}</span></span>;
}
