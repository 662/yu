"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Fish, Plus, RotateCcw, SlidersHorizontal, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AccountIcon } from "./icons";
import { accountTypeNames, money, summarizeBook, type Account, type AccountType, type Book } from "./ledger";

import { useWorkspace } from "./book-context";
import { Amount } from "./book-presentation";
import { ledgerHref } from "./routes";

export function AccountsPage() {
  const { book, setModal } = useWorkspace();
  return <AccountsView book={book} onManage={account => setModal({ type: "account", account })} onReimburse={id => setModal({ type: "reimburse", id })} onAdd={() => setModal({ type: "account" })} />;
}

function AccountsView({ book, onManage, onReimburse, onAdd }: { book: Book; onManage: (a: Account) => void; onReimburse: (id: string) => void; onAdd: () => void }) {
  const summary = useMemo(() => summarizeBook(book), [book]);
  const groups: { title: string; subtitle: string; types: AccountType[] }[] = [
    { title: "日常账户", subtitle: "银行卡、平台余额和现金", types: ["bank", "balance", "cash"] },
    { title: "信用卡", subtitle: "消费时记支出，还款时不重复记", types: ["credit"] },
    { title: "慢慢积累", subtitle: "投资仅记录总估值，无需每天更新", types: ["investment"] },
  ];
  return <div className="accounts-view">
    <section className="net-worth-hero" aria-label="净资产概览"><div><span className="hero-label">净资产</span><Amount value={summary.net} currency /><p>含投资估值与待报销</p></div><div className="hero-breakdown"><div><span>总资产</span><strong>¥{money(summary.assets)}</strong></div><div><span>总负债</span><strong>¥{money(summary.debts)}</strong></div></div><Fish className="hero-fish" aria-hidden="true" /></section>
    {!book.accounts.length && <Empty className="empty-ledger"><EmptyHeader><EmptyMedia variant="icon"><Wallet /></EmptyMedia><EmptyTitle>先记下钱在哪里</EmptyTitle><EmptyDescription>添加一张银行卡、零钱或信用卡，填上现在的余额，就可以开始记账了。</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onAdd}><Plus data-icon="inline-start" />添加第一个账户</Button></EmptyContent></Empty>}
    {groups.map((group) => {
      const accounts = book.accounts.filter((a) => group.types.includes(a.type));
      if (!accounts.length) return null;
      return <section key={group.title} className="account-group"><div className="section-heading"><div className="account-section-title"><h2>{group.title}<span>{accounts.length}</span></h2><p>{group.subtitle}</p></div></div><div className="account-grid">{accounts.map((a) => {
        const balance = summary.balances.get(a.id) ?? 0;
        return <Card key={a.id} className="account-card"><CardHeader><div className="account-card-name"><AccountIcon type={a.type} /><div><CardTitle>{a.name}</CardTitle><CardDescription>{accountTypeNames[a.type]}</CardDescription></div></div><CardAction><Button variant="ghost" size="icon" aria-label={`管理${a.name}`} onClick={() => onManage(a)}><SlidersHorizontal /></Button></CardAction></CardHeader><CardContent><p className="account-balance-label">{a.type === "credit" ? balance <= 0 ? "待还金额" : "溢缴款" : a.type === "investment" ? "当前估值" : "账户余额"}</p><div className="account-balance"><Amount value={a.type === "credit" ? Math.abs(balance) : balance} currency /></div><p className="account-note">{a.note}</p><Separator /><div className="account-actions"><Link data-slot="button" className={buttonVariants({ variant: "ghost", size: "sm" })} href={ledgerHref({ scope: "all", account: a.id })}>查看账目<ArrowRight data-icon="inline-end" /></Link><Button variant="ghost" size="sm" onClick={() => onManage(a)}>{a.type === "investment" ? "更新估值" : "核对余额"}</Button></div></CardContent></Card>;
      })}</div></section>;
    })}
    {summary.receivable > 0 && <section className="receivable-section"><div><span className="category-icon tone-olive"><RotateCcw /></span><div><h2>待报销，也是你的钱</h2><p>共 ¥{money(summary.receivable)}，已计入总资产。</p></div></div><div className="receivable-items">{book.transactions.filter((t) => t.reimbursable && (summary.remaining.get(t.id) ?? 0) > 0).map((t) => <Button key={t.id} variant="outline" onClick={() => onReimburse(t.id)}>{t.note || "垫付款"}<ArrowRight data-icon="inline-end" /></Button>)}</div></section>}
  </div>;
}
