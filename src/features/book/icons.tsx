import {
  Utensils, ShoppingBag, TrainFront, House, Coffee, HeartPulse,
  Package, Ellipsis, ArrowLeftRight, CreditCard,
  Banknote, Landmark, Wallet, TrendingUp, Undo2, SlidersHorizontal, Briefcase, Gift, GraduationCap, PawPrint, Plane,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type AccountType, type Transaction } from "./ledger";
import { defaultCategories, bookCategories, type Category } from "./categories";

export const categoryIcons = { Utensils, ShoppingBag, TrainFront, House, Coffee, HeartPulse, Package, Ellipsis, Briefcase, Gift, TrendingUp, GraduationCap, PawPrint, Plane };
export const accountIcons = { bank: Landmark, balance: Wallet, cash: Banknote, credit: CreditCard, investment: TrendingUp };

export function CategoryIcon({ category, className, options }: { category: string | Category; className?: string; options?: Category[] }) {
  const c = typeof category === "string" ? (options ?? defaultCategories()).find((c) => c.id === category) ?? defaultCategories()[7] : category;
  const Icon = categoryIcons[c.icon];
  return <span className={cn("category-icon", `tone-${c.tone}`, className)}><Icon aria-hidden="true" /></span>;
}

export function TransactionIcon({ transaction, options }: { transaction: Transaction; options?: Category[] }) {
  if (transaction.kind === "expense" || transaction.kind === "income") return <CategoryIcon category={transaction.category} options={options ?? bookCategories({})} />;
  const Icon = { transfer: ArrowLeftRight, repayment: CreditCard, reimbursement: Undo2, adjustment: SlidersHorizontal }[transaction.kind];
  return <span className={cn("category-icon", "tone-neutral")}><Icon aria-hidden="true" /></span>;
}

export function AccountIcon({ type }: { type: AccountType }) {
  const Icon = accountIcons[type];
  return <span className={cn("account-icon", `account-${type}`)}><Icon aria-hidden="true" /></span>;
}
