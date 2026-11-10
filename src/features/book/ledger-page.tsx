"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { bookCategories, categoryName } from "./categories";
import { TransactionIcon } from "./icons";
import { money, summarizeBook, type Book, type Transaction } from "./ledger";
import { filterTransactions, type LedgerFilter, type TimeScope } from "./ledger-view";

import { useWorkspace } from "./book-context";
import { Amount, transactionTitle } from "./book-presentation";
import { useLedgerLocation } from "./use-ledger-location";

export function LedgerPage() {
  const { book, today, setModal, startEntry } = useWorkspace();
  const { month, scope, filter, query, account: accountFilter, category: categoryFilter, update: updateFilters } = useLedgerLocation(today);
  const setFilter = (filter: LedgerFilter) => updateFilters({ filter });
  const setQuery = (query: string) => updateFilters({ query }, true);
  const setAccountFilter = (account: string) => updateFilters({ account });
  const [showFilters, setShowFilters] = useState(!!accountFilter);
  const summary = useMemo(() => summarizeBook(book), [book]);
  const monthly = useMemo(() => book.transactions.filter((t) => t.date.startsWith(month)), [book.transactions, month]);
  const expense = monthly.filter((t) => t.kind === "expense" && !t.reimbursable).reduce((sum, t) => sum + t.amount, 0);
  const income = monthly.filter((t) => t.kind === "income").reduce((sum, t) => sum + t.amount, 0);
  const pending = book.transactions.filter((t) => t.reimbursable && (summary.remaining.get(t.id) ?? 0) > 0);
  const accountNames = useMemo(() => new Map(book.accounts.map(a => [a.id, a.name])), [book.accounts]);
  const accountName = (id: string) => accountNames.get(id) ?? "";

  const filtered = filterTransactions(book, { month, scope, filter, account: accountFilter, query, category: categoryFilter });
  const allTime = scope === "all" || filter === "pending";
  function clearFilters() { updateFilters({ query: "", filter: "all", account: "", category: "" }); }
  const byDate = new Map<string, Transaction[]>();
  for (const t of filtered) {
    const day = byDate.get(t.date) ?? [];
    day.push(t);
    byDate.set(t.date, day);
  }
  const groups = Array.from(byDate, ([date, transactions]) => ({ date, transactions }));

  function selectMonth(month: string) {
    updateFilters({ month, scope: "month", filter: filter === "pending" ? "all" : filter });
  }

  function changeMonth(offset: number) {
    const d = new Date(`${month}-01T12:00:00`);
    d.setMonth(d.getMonth() + offset);
    selectMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return <>
          <div className="month-toolbar"><div className="month-switch"><Button variant="ghost" size="icon" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft /></Button><label className="month-label"><span>{month.slice(0, 4)} 年 <strong>{Number(month.slice(5))} 月</strong></span><input type="month" aria-label="选择月份" value={month} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { selectMonth(e.target.value); } }} /></label><Button variant="ghost" size="icon" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight /></Button></div><Button variant="outline" size="sm" onClick={() => { updateFilters({ month: today.slice(0, 7), scope: "month", filter: "all" }); }}>回到本月</Button><span className="month-count">{month.replace("-", " 年 ")} 月，共记录 {monthly.length} 笔</span></div>

          <section className="summary-grid" aria-label="本月收支概览">
            <div className="summary-item expense-summary"><div className="summary-label"><span>本月支出</span><span className="summary-symbol"><ArrowUpRight /></span></div><Amount value={expense} currency /><div className="summary-foot"><span>每日支出趋势</span><MiniBars transactions={monthly} month={month} /></div></div>
            <div className="summary-item"><div className="summary-label"><span>本月收入</span><span className="summary-symbol income-symbol"><ArrowDownLeft /></span></div><Amount value={income} currency /><div className="summary-foot">{monthly.filter((t) => t.kind === "income").length} 笔收入</div></div>
            <div className="summary-item"><div className="summary-label"><span>本月结余</span><span className="summary-symbol"><Wallet /></span></div><Amount value={income - expense} currency /><div className="summary-foot">收入 − 支出，不含转账与垫付</div></div>
          </section>

          <div className="ledger-layout">
            <section className="transactions-section" aria-label="账目明细">
              <div className="section-heading"><div><h2>账目明细 <span>{filtered.length}</span></h2></div><div className="list-tools"><div className="search-box"><Search aria-hidden="true" /><Input aria-label="搜索账目" placeholder="搜备注、分类、金额…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Button variant={showFilters ? "secondary" : "outline"} size="icon" aria-label="筛选账户" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal /></Button></div></div>
              <div className="ledger-scope"><ToggleGroup aria-label="账目时间范围" value={[allTime ? "all" : "month"]} onValueChange={v => { if (v[0]) { updateFilters({ scope: v[0] as TimeScope, filter: v[0] === "month" && filter === "pending" ? "all" : filter }); } }}><ToggleGroupItem value="month">所选月份</ToggleGroupItem><ToggleGroupItem value="all">全部时间</ToggleGroupItem></ToggleGroup><span>{allTime ? "正在查看全部时间的账目" : `正在查看 ${month} 的账目`} · 上方概览按所选月份统计</span></div><div className="filter-strip"><ToggleGroup aria-label="筛选账目类型" value={[filter]} onValueChange={(v) => { if (v[0]) setFilter(v[0] as LedgerFilter); }} spacing={1}>{([["all", "全部"], ["expense", "支出"], ["income", "收入"], ["transfer", "转账"], ["pending", "待报销"]] as const).map(([value, name]) => <ToggleGroupItem key={value} value={value}>{name}{value === "pending" && pending.length > 0 && <span className="filter-count">{pending.length}</span>}</ToggleGroupItem>)}</ToggleGroup><span className="unit-label">人民币 · CNY</span></div>
              {(query || accountFilter || categoryFilter || filter !== "all") && <div className="active-filters"><span>{accountFilter ? `账户：${accountName(accountFilter)} · ` : ""}{categoryFilter ? `分类：${categoryName(book, "expense", categoryFilter)} · ` : ""}{query ? `搜索：${query} · ` : ""}{filter === "pending" ? "全部时间待报销" : "已应用筛选"}</span><Button variant="ghost" size="sm" onClick={clearFilters}><X data-icon="inline-start" />清除筛选</Button></div>}{showFilters && <div className="extra-filters"><NativeSelect aria-label="按账户筛选" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><NativeSelectOption value="">所有账户</NativeSelectOption>{book.accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}</NativeSelect>{accountFilter && <Button variant="ghost" size="sm" onClick={() => setAccountFilter("")}><X data-icon="inline-start" />清除</Button>}</div>}
              <div className="transaction-list">
                {groups.length ? groups.map(({ date, transactions }) => {
                  const spent = transactions.filter((t) => t.kind === "expense" && !t.reimbursable).reduce((sum, t) => sum + t.amount, 0);
                  return <section className="day-group" key={date}><div className="day-heading"><h3>{dateLabel(date, today)}<span>{date.slice(5).replace("-", "/")}</span></h3><span>支出 ¥{money(spent)}</span></div>{transactions.map((t) => <button key={t.id} className="transaction-row" onClick={() => setModal({ type: "detail", id: t.id })} aria-label={`查看${t.note || transactionTitle(t, book)}，${money(t.amount)}元`}>
                    <TransactionIcon transaction={t} options={bookCategories(book)} /><div className="transaction-main"><div className="transaction-name"><strong>{t.note || transactionTitle(t, book)}</strong>{t.reimbursable && <Badge variant={summary.remaining.get(t.id) ? "secondary" : "outline"}>{summary.remaining.get(t.id) ? "待报销" : "已报销"}</Badge>}</div><p>{transactionTitle(t, book)}<span>·</span>{t.from && accountName(t.from)}{t.from && t.to && <ArrowRight />}{t.to && accountName(t.to)}</p></div><div className={cn("transaction-amount", t.kind === "income" && "positive")}><span>{t.kind === "income" || t.kind === "reimbursement" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount)}</span>{t.reimbursable && <small>不计入支出</small>}{(t.kind === "transfer" || t.kind === "repayment") && <small>账户间流转</small>}</div><ChevronRight className="row-chevron" />
                  </button>)}</section>;
                }) : <Empty className="empty-ledger"><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{query || filter !== "all" || accountFilter || categoryFilter ? "没有找到这类账目" : allTime ? "还没有账目" : "这个月还是一张白纸"}</EmptyTitle><EmptyDescription>{query || filter !== "all" || accountFilter || categoryFilter ? "换个关键词，或清除筛选再看看。" : "从今天的一顿饭、一杯咖啡开始吧。"}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => { if (query || filter !== "all" || accountFilter || categoryFilter) { clearFilters(); } else startEntry(); }}>{query || filter !== "all" || accountFilter || categoryFilter ? "清除筛选" : "记下第一笔"}</Button></EmptyContent></Empty>}
              </div>
            </section>

            <aside className="insights-sidebar">
              <SpendingCard book={book} transactions={monthly} total={expense} onCategory={(id) => { updateFilters({ filter: "expense", category: id, scope: "month", query: "" }); }} />
              <Card className="asset-glance"><CardHeader><CardTitle>净资产</CardTitle><CardDescription>含投资估值与待报销</CardDescription><CardAction><Wallet className="size-4" /></CardAction></CardHeader><CardContent><div className="glance-number"><Amount value={summary.net} currency /></div><div className="glance-breakdown"><span>总资产<strong>¥{money(summary.assets)}</strong></span><span>总负债<strong>¥{money(summary.debts)}</strong></span></div><Separator /><Link data-slot="button" href="/accounts" className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-between")}>查看账户<ArrowRight data-icon="inline-end" /></Link></CardContent></Card>
              {pending.length > 0 && <Card className="pending-card"><CardHeader><CardTitle>还有钱要收回来</CardTitle><CardDescription>{pending.length} 笔待报销，共 ¥{money(summary.receivable)}</CardDescription><CardAction><RotateCcw className="size-4" /></CardAction></CardHeader><CardContent><div className="pending-list">{pending.map((t) => <button key={t.id} onClick={() => setModal({ type: "reimburse", id: t.id })}><span>{t.note || "垫付款"}</span><strong>¥{money(summary.remaining.get(t.id) ?? 0)}</strong><ChevronRight /></button>)}</div></CardContent></Card>}
            </aside>
          </div>
  </>;
}

function dateLabel(date: string, today: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = parsed.toLocaleDateString("zh-CN", { weekday: "long" });
  if (date === today) return `今天 · ${week}`;
  if (parsed.toDateString() === yesterday.toDateString()) return `昨天 · ${week}`;
  return `${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日 · ${week}`;
}

function MiniBars({ transactions, month }: { transactions: Transaction[]; month: string }) {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const values = Array<number>(days).fill(0);
  for (const t of transactions) {
    if (t.kind === "expense" && !t.reimbursable) values[Number(t.date.slice(8)) - 1] += t.amount;
  }
  const max = Math.max(...values, 1);
  return <div className="mini-bars" aria-hidden="true">{values.map((n, i) => <span key={i} className={cn(n > 0 && "has-spend")} style={{ height: `${n ? 20 + n / max * 80 : 12}%` }} />)}</div>;
}

function SpendingCard({ book, transactions, total, onCategory }: { book: Book; transactions: Transaction[]; total: number; onCategory: (name: string) => void }) {
  const amounts = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind === "expense" && !t.reimbursable) amounts.set(t.category, (amounts.get(t.category) ?? 0) + t.amount);
  }
  const groups = bookCategories(book).filter(c => c.kind === "expense").map(c => ({ ...c, amount: amounts.get(c.id) ?? 0 })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
  let cursor = 0;
  const gradient = groups.map((c) => {
    const start = cursor;
    cursor += c.amount / total * 100;
    return `var(--tone-${c.tone}) ${start}% ${cursor}%`;
  }).join(", ");
  return <Card className="spending-card"><CardHeader><CardTitle>支出分布</CardTitle><CardDescription>按分类查看所选月份的个人支出</CardDescription><CardAction><span className="tiny-dot" /></CardAction></CardHeader><CardContent>
    <div className="spending-chart" role="img" aria-label={groups.length ? groups.map((c) => `${c.name} ${money(c.amount)}元`).join("，") : "本月暂无支出"}><div className="donut" style={{ background: groups.length ? `conic-gradient(${gradient})` : "var(--muted)" }}><div><span>{groups.length ? "本月支出" : "慢慢开始"}</span><strong>{groups.length}<small> 个分类</small></strong></div></div></div>
    <div className="category-breakdown">{groups.map((c) => <button key={c.id} onClick={() => onCategory(c.id)}><span className={cn("legend-dot", `tone-${c.tone}`)} /><span>{c.name}</span><strong>¥{money(c.amount)}</strong><small>{Math.round(c.amount / total * 100)}%</small></button>)}</div>
    {!groups.length && <p className="chart-empty">记下一笔消费，看看生活的模样。</p>}
  </CardContent></Card>;
}
