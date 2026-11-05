"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, ArrowRight, BookOpen, Check,
  ChevronLeft, ChevronRight, Fish, Leaf, Plus, Search, SlidersHorizontal,
  Sparkles, Wallet, X, Pencil, Trash2, CircleHelp, RotateCcw, Download, Sprout, Tags, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { AccountDialog, EntryDialog, ReimburseDialog, kindNames } from "./forms";
import { AccountIcon, TransactionIcon } from "./icons";
import { useBook } from "./store";
import { bookCategories, categoryName, type CategoryKind } from "./categories";
import { ImportPage } from "../import/import-page";
import { CategoryManager } from "./category-manager";
import {
  accountTypeNames, money, outstanding,
  summarizeBook, type Account, type AccountType, type Book, type Transaction, type TransactionInput,
} from "./ledger";

type Page = "ledger" | "accounts" | "import" | "categories";
const pageTitles: Record<Page, string> = { ledger: "账目", accounts: "账户", import: "账单导入", categories: "分类管理" };

type Filter = "all" | "expense" | "income" | "transfer" | "pending";
type Modal = { type: "entry"; transaction?: Transaction } | { type: "account"; account?: Account }
  | { type: "detail"; id: string } | { type: "reimburse"; id: string } | { type: "about" } | null;

function transactionTitle(t: Transaction, book: Book) {
  if (t.kind === "expense" || t.kind === "income") return categoryName(book, t.kind, t.category);
  if (t.kind === "adjustment") return t.category;
  return kindNames[t.kind];
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

function Amount({ value, currency = false }: { value: number; currency?: boolean }) {
  const [whole, decimal] = money(value).split(".");
  return <span className="money">{currency && <span className="currency">¥</span>}{whole}<span className="money-decimal">.{decimal}</span></span>;
}

type BookAppProps = { initial: Book; today: string; user?: { name: string; email: string | null } };

export function BookApp(props: BookAppProps) {
  const state = useBook(props.initial);
  if (state.accountChanged) {
    // Unmount the entire workspace, including drafts, details, imports and profile.
    return <main className="error-page"><h1>登录账号已变更</h1><p role="alert">请重新打开账本，查看当前账号的记录。</p><Button size="lg" onClick={() => window.location.replace("/")}>重新打开账本</Button></main>;
  }
  return <BookWorkspace {...props} state={state} />;
}

function BookWorkspace({ today, user, state }: BookAppProps & { state: ReturnType<typeof useBook> }) {
  const { book, mutate, saving, error: syncError, refresh } = state;
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("expense");
  const searchParams = useSearchParams();
  const requestedPage = searchParams.get("page");
  const page: Page = requestedPage === "accounts" || requestedPage === "import" || requestedPage === "categories" ? requestedPage : "ledger";
  function setPage(next: Page, preserveEntry = false) {
    if (!preserveEntry) setModal(null);
    const url = new URL(window.location.href);
    if (next === "ledger") url.searchParams.delete("page");
    else url.searchParams.set("page", next);
    window.history.pushState(null, "", url.pathname + url.search);
    window.scrollTo({ top: 0 });
  }
  function manageCategories(kind: CategoryKind) {
    setCategoryKind(kind);
    setPage("categories", modal?.type === "entry");
  }
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("");
  const [showWelcomeNote, setShowWelcomeNote] = useState(true);
  const summary = useMemo(() => summarizeBook(book), [book]);
  const monthly = useMemo(() => book.transactions.filter((t) => t.date.startsWith(month)), [book.transactions, month]);
  const expense = monthly.filter((t) => t.kind === "expense" && !t.reimbursable).reduce((sum, t) => sum + t.amount, 0);
  const income = monthly.filter((t) => t.kind === "income").reduce((sum, t) => sum + t.amount, 0);
  const pending = book.transactions.filter((t) => t.reimbursable && (summary.remaining.get(t.id) ?? 0) > 0);
  const accountNames = useMemo(() => new Map(book.accounts.map(a => [a.id, a.name])), [book.accounts]);
  const accountName = (id: string) => accountNames.get(id) ?? "";

  const filtered = monthly.filter((t) => {
    if (filter === "expense" && (t.kind !== "expense" || t.reimbursable)) return false;
    if (filter === "income" && t.kind !== "income") return false;
    if (filter === "transfer" && t.kind !== "transfer" && t.kind !== "repayment") return false;
    if (filter === "pending" && (!t.reimbursable || (summary.remaining.get(t.id) ?? 0) <= 0)) return false;
    if (accountFilter && !t.entries.some((e) => e.accountId === accountFilter)) return false;
    const search = `${t.note} ${transactionTitle(t, book)} ${accountName(t.from)} ${accountName(t.to)} ${t.amount / 100}`;
    return search.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => b.date.localeCompare(a.date));
  const byDate = new Map<string, Transaction[]>();
  for (const t of filtered) {
    const day = byDate.get(t.date) ?? [];
    day.push(t);
    byDate.set(t.date, day);
  }
  const groups = Array.from(byDate, ([date, transactions]) => ({ date, transactions }));

  async function save(input: TransactionInput, id?: string) {
    const editing = book.transactions.some((t) => t.id === id);
    await mutate({ type: "transaction.save", id: id ?? crypto.randomUUID(), input });
    if (input.date.slice(0, 7) !== month) setMonth(input.date.slice(0, 7));
    setNotice(editing ? "这笔账已经更新" : input.kind === "reimbursement" ? "报销到账，余额已更新" : "记好了，生活又清楚了一点");
  }

  async function saveAccount(account: Account, balance: number) {
    const { id, name, type, note } = account;
    await mutate({ type: "account.save", account: { id, name, type, note }, balance, date: today });
    setNotice("账户已保存");
  }

  function startEntry() {
    if (page === "categories") setPage("ledger");
    setModal(book.accounts.length ? { type: "entry" } : { type: "account" });
  }

  function changeMonth(offset: number) {
    const d = new Date(`${month}-01T12:00:00`);
    d.setMonth(d.getMonth() + offset);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function viewAccount(id: string) {
    setPage("ledger"); setAccountFilter(id); setShowFilters(true); setFilter("all"); setQuery("");
  }

  const activeTransaction = modal && "id" in modal ? book.transactions.find((t) => t.id === modal.id) : undefined;

  return <div className="book-app">
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="年年有鱼首页"><span className="brand-mark"><Fish /></span><span>年年有鱼<small>把日子过得心中有数</small></span></Link>
      <div className="book-switch"><span className="book-avatar"><Sprout /></span><div><strong>{`${user?.name ?? "我"}的账本`}</strong><span>一个人的小日子</span></div><Badge variant="outline">个人</Badge></div>
      <p className="nav-caption">我的账本</p>
      <nav aria-label="主导航" className="desktop-nav">
        <button className={cn("nav-item", page === "ledger" && "active")} onClick={() => setPage("ledger")} aria-current={page === "ledger" ? "page" : undefined}><BookOpen /><span>账目</span><span className="nav-dot" /></button>
        <button className={cn("nav-item", page === "accounts" && "active")} onClick={() => setPage("accounts")} aria-current={page === "accounts" ? "page" : undefined}><Wallet /><span>账户</span></button>
        <button className={cn("nav-item", page === "import" && "active")} aria-current={page === "import" ? "page" : undefined} onClick={() => setPage("import")}><Upload /><span>账单导入</span></button>
        <button className={cn("nav-item", page === "categories" && "active")} aria-current={page === "categories" ? "page" : undefined} onClick={() => manageCategories("expense")}><Tags /><span>分类管理</span></button>
      </nav>
      <div className="sidebar-note"><Leaf /><p>每一笔小小的记录，<br />都在靠近想要的生活。</p><div className="note-line" /></div>
      <div className="sidebar-bottom"><Button variant="ghost" onClick={() => setModal({ type: "about" })}><CircleHelp data-icon="inline-start" />账本与设置</Button><span>年年有鱼 · 慢慢积累，岁岁有余</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>{`${user?.name ?? "我"}的账本`}</span><ChevronRight /><strong>{pageTitles[page]}</strong></div>
        <span className="mobile-brand"><Fish />年年有鱼</span>
        <div className="topbar-end"><Button variant="ghost" size="sm" aria-label="账本与设置" onClick={() => setModal({ type: "about" })}><Badge variant="outline"><span className="status-dot" />{saving ? "保存中" : "我的账本"}</Badge></Button><span className="profile-avatar" title={user?.name}>{user?.name?.slice(0, 1) ?? "我"}</span></div>
      </header>

      <main className="main-content">
        {showWelcomeNote && <div className="welcome-note"><Sparkles /><p>{book.accounts.length ? "记录已保存到你的个人账本，手机和电脑登录后可以接着记。" : "从一个账户开始：记下现在的余额，再慢慢记录之后的每一笔。"}</p><Button variant="ghost" size="icon-sm" aria-label="收起提示" onClick={() => setShowWelcomeNote(false)}><X /></Button></div>}
        {syncError && <div role="alert" className="sync-warning"><p>{syncError}</p>{syncError.includes("登录") ? <Link href="/login" target="_blank" rel="noopener noreferrer">重新登录</Link> : <Button variant="outline" size="sm" onClick={() => void refresh()}>重新同步</Button>}</div>}
        <div className="page-heading" data-page={page}><div><p className="eyebrow">{page === "ledger" ? "LITTLE MOMENTS, EVERY DAY" : page === "accounts" ? "A LITTLE MORE PEACE OF MIND" : page === "import" ? "BRING YOUR MOMENTS TOGETHER" : "A PLACE FOR EVERY LITTLE THING"}</p><h1>{page === "ledger" ? "日子，一笔一笔。" : page === "accounts" ? "家底，一目了然。" : pageTitles[page]}</h1><p className="page-subtitle">{page === "ledger" ? "记下生活的点滴，也留住心里的踏实。" : page === "accounts" ? "钱在哪里，还有多少，都在这里。" : page === "import" ? "微信、支付宝和招商银行 · 先核对，再入账。" : "把生活分得刚刚好。只会改变你自己的账本。"}</p></div>
          {(page === "ledger" || page === "accounts") && <Button size="lg" onClick={() => page === "ledger" ? startEntry() : setModal({ type: "account" })}><Plus data-icon="inline-start" />{page === "ledger" ? "记一笔" : "添加账户"}</Button>}{page === "categories" && modal?.type === "entry" && <Button variant="outline" onClick={() => setPage("ledger", true)}><ChevronLeft data-icon="inline-start" />返回记账</Button>}
        </div>

        {page === "ledger" ? <>
          <div className="month-toolbar"><div className="month-switch"><Button variant="ghost" size="icon" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft /></Button><label className="month-label"><span>{month.slice(0, 4)} 年 <strong>{Number(month.slice(5))} 月</strong></span><input type="month" aria-label="选择月份" value={month} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }} /></label><Button variant="ghost" size="icon" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight /></Button></div><span className="month-count">这个月，共记录 {monthly.length} 笔</span></div>

          <section className="summary-grid" aria-label="本月收支概览">
            <div className="summary-item expense-summary"><div className="summary-label"><span>本月支出</span><span className="summary-symbol"><ArrowUpRight /></span></div><Amount value={expense} currency /><div className="summary-foot"><span>认真生活的每一笔</span><MiniBars transactions={monthly} month={month} /></div></div>
            <div className="summary-item"><div className="summary-label"><span>本月收入</span><span className="summary-symbol income-symbol"><ArrowDownLeft /></span></div><Amount value={income} currency /><div className="summary-foot">{monthly.filter((t) => t.kind === "income").length} 笔收入，都是生活的底气</div></div>
            <div className="summary-item"><div className="summary-label"><span>本月结余</span><span className="summary-symbol"><Wallet /></span></div><Amount value={income - expense} currency /><div className="summary-foot">收入 − 支出，不含转账与垫付</div></div>
          </section>

          <div className="ledger-layout">
            <section className="transactions-section" aria-label="账目明细">
              <div className="section-heading"><div><h2>账目明细 <span>{filtered.length}</span></h2></div><div className="list-tools"><div className="search-box"><Search aria-hidden="true" /><Input aria-label="搜索账目" placeholder="搜备注、分类、金额…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Button variant={showFilters ? "secondary" : "outline"} size="icon" aria-label="筛选账户" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal /></Button></div></div>
              <div className="filter-strip"><ToggleGroup aria-label="筛选账目类型" value={[filter]} onValueChange={(v) => { if (v[0]) setFilter(v[0] as Filter); }} spacing={1}>{([["all", "全部"], ["expense", "支出"], ["income", "收入"], ["transfer", "转账"], ["pending", "待报销"]] as const).map(([value, name]) => <ToggleGroupItem key={value} value={value}>{name}{value === "pending" && pending.length > 0 && <span className="filter-count">{pending.length}</span>}</ToggleGroupItem>)}</ToggleGroup><span className="unit-label">人民币 · CNY</span></div>
              {showFilters && <div className="extra-filters"><NativeSelect aria-label="按账户筛选" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><NativeSelectOption value="">所有账户</NativeSelectOption>{book.accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}</NativeSelect>{accountFilter && <Button variant="ghost" size="sm" onClick={() => setAccountFilter("")}><X data-icon="inline-start" />清除</Button>}</div>}
              <div className="transaction-list">
                {groups.length ? groups.map(({ date, transactions }) => {
                  const spent = transactions.filter((t) => t.kind === "expense" && !t.reimbursable).reduce((sum, t) => sum + t.amount, 0);
                  return <section className="day-group" key={date}><div className="day-heading"><h3>{dateLabel(date, today)}<span>{date.slice(5).replace("-", "/")}</span></h3><span>支出 ¥{money(spent)}</span></div>{transactions.map((t) => <button key={t.id} className="transaction-row" onClick={() => setModal({ type: "detail", id: t.id })} aria-label={`查看${t.note || transactionTitle(t, book)}，${money(t.amount)}元`}>
                    <TransactionIcon transaction={t} options={bookCategories(book)} /><div className="transaction-main"><div className="transaction-name"><strong>{t.note || transactionTitle(t, book)}</strong>{t.reimbursable && <Badge variant={summary.remaining.get(t.id) ? "secondary" : "outline"}>{summary.remaining.get(t.id) ? "待报销" : "已报销"}</Badge>}</div><p>{transactionTitle(t, book)}<span>·</span>{t.from && accountName(t.from)}{t.from && t.to && <ArrowRight />}{t.to && accountName(t.to)}</p></div><div className={cn("transaction-amount", t.kind === "income" && "positive")}><span>{t.kind === "income" || t.kind === "reimbursement" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount)}</span>{t.reimbursable && <small>不计入支出</small>}{(t.kind === "transfer" || t.kind === "repayment") && <small>账户间流转</small>}</div><ChevronRight className="row-chevron" />
                  </button>)}</section>;
                }) : <Empty className="empty-ledger"><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{query || filter !== "all" || accountFilter ? "没有找到这类账目" : "这个月还是一张白纸"}</EmptyTitle><EmptyDescription>{query || filter !== "all" || accountFilter ? "换个关键词，或清除筛选再看看。" : "从今天的一顿饭、一杯咖啡开始吧。"}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => { if (query || filter !== "all" || accountFilter) { setQuery(""); setFilter("all"); setAccountFilter(""); } else startEntry(); }}>{query || filter !== "all" || accountFilter ? "清除筛选" : "记下第一笔"}</Button></EmptyContent></Empty>}
              </div>
              {groups.length > 0 && <div className="list-end"><span />这些小事，都是生活。<span /></div>}
            </section>

            <aside className="insights-sidebar">
              <SpendingCard book={book} transactions={monthly} total={expense} onCategory={(name) => { setFilter("expense"); setQuery(name); }} />
              <Card className="asset-glance"><CardHeader><CardTitle>我的小金库</CardTitle><CardDescription>净资产 · 含投资估值与待报销</CardDescription><CardAction><Wallet className="size-4" /></CardAction></CardHeader><CardContent><div className="glance-number"><Amount value={summary.net} currency /></div><div className="glance-breakdown"><span>总资产<strong>¥{money(summary.assets)}</strong></span><span>总负债<strong>¥{money(summary.debts)}</strong></span></div><Separator /><Button variant="ghost" className="w-full justify-between" onClick={() => setPage("accounts")}>看看钱在哪里<ArrowRight data-icon="inline-end" /></Button></CardContent></Card>
              {pending.length > 0 && <Card className="pending-card"><CardHeader><CardTitle>还有钱要收回来</CardTitle><CardDescription>{pending.length} 笔待报销，共 ¥{money(summary.receivable)}</CardDescription><CardAction><RotateCcw className="size-4" /></CardAction></CardHeader><CardContent><div className="pending-list">{pending.map((t) => <button key={t.id} onClick={() => setModal({ type: "reimburse", id: t.id })}><span>{t.note || "垫付款"}</span><strong>¥{money(summary.remaining.get(t.id) ?? 0)}</strong><ChevronRight /></button>)}</div></CardContent></Card>}
              <p className="aside-note"><Leaf />不必每一笔都完美，<br />开始记录就很好。</p>
            </aside>
          </div>
        </> : page === "import" ? <ImportPage book={book} saving={saving} onCommand={mutate} /> : page === "categories" ? <CategoryManager key={categoryKind} book={book} initialKind={categoryKind} saving={saving} onCommand={mutate} /> : <AccountsView book={book} onManage={(a) => setModal({ type: "account", account: a })} onView={viewAccount} onReimburse={(id) => setModal({ type: "reimburse", id })} onAdd={() => setModal({ type: "account" })} />}
        <footer className="page-footer"><Fish /><span>年年有鱼，岁岁有余。</span><span className="footer-private">一份只属于自己的生活记录</span></footer>
      </main>
    </div>

    <nav className="mobile-nav" aria-label="移动端导航"><button onClick={() => setPage("ledger")} className={cn(page === "ledger" && "active")} aria-current={page === "ledger" ? "page" : undefined}><BookOpen /><span>账目</span></button><Button size="lg" onClick={startEntry}><Plus data-icon="inline-start" />记一笔</Button><button onClick={() => setPage("accounts")} className={cn(page === "accounts" && "active")} aria-current={page === "accounts" ? "page" : undefined}><Wallet /><span>账户</span></button></nav>

    {notice && <div className="save-notice" role="status"><Check /><span>{notice}</span><Button variant="ghost" size="icon-sm" aria-label="关闭保存提示" onClick={() => setNotice("")}><X /></Button></div>}
    {modal?.type === "entry" && <EntryDialog book={book} today={today} transaction={modal.transaction} onClose={() => setModal(null)} onSave={save} saving={saving} onManageCategories={manageCategories} open={page !== "categories"} />}
    {modal?.type === "account" && <AccountDialog book={book} today={today} account={modal.account} onClose={() => setModal(null)} onSave={saveAccount} saving={saving} />}
    {modal?.type === "reimburse" && activeTransaction && <ReimburseDialog book={book} today={today} original={activeTransaction} onClose={() => setModal(null)} onSave={save} saving={saving} />}
    {modal?.type === "detail" && activeTransaction && <TransactionDetail book={book} transaction={activeTransaction} onClose={() => setModal(null)} onEdit={() => setModal({ type: "entry", transaction: activeTransaction })} onReimburse={() => setModal({ type: "reimburse", id: activeTransaction.id })} saving={saving} onDelete={async () => { await mutate({ type: "transaction.delete", id: activeTransaction.id }); setModal(null); setNotice("账目已删除，账户余额已同步恢复"); }} />}
    {modal?.type === "about" && <AboutDialog onClose={() => setModal(null)} book={book} user={user} onImport={() => setPage("import")} onManageCategories={() => manageCategories("expense")} />}
  </div>;
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
  return <Card className="spending-card"><CardHeader><CardTitle>钱花在哪里</CardTitle><CardDescription>本月个人支出分布</CardDescription><CardAction><span className="tiny-dot" /></CardAction></CardHeader><CardContent>
    <div className="spending-chart" role="img" aria-label={groups.length ? groups.map((c) => `${c.name} ${money(c.amount)}元`).join("，") : "本月暂无支出"}><div className="donut" style={{ background: groups.length ? `conic-gradient(${gradient})` : "var(--muted)" }}><div><span>{groups.length ? "本月支出" : "慢慢开始"}</span><strong>{groups.length}<small> 个分类</small></strong></div></div></div>
    <div className="category-breakdown">{groups.map((c) => <button key={c.id} onClick={() => onCategory(c.name)}><span className={cn("legend-dot", `tone-${c.tone}`)} /><span>{c.name}</span><strong>¥{money(c.amount)}</strong><small>{Math.round(c.amount / total * 100)}%</small></button>)}</div>
    {!groups.length && <p className="chart-empty">记下一笔消费，看看生活的模样。</p>}
  </CardContent></Card>;
}

function AccountsView({ book, onManage, onView, onReimburse, onAdd }: { book: Book; onManage: (a: Account) => void; onView: (id: string) => void; onReimburse: (id: string) => void; onAdd: () => void }) {
  const summary = useMemo(() => summarizeBook(book), [book]);
  const groups: { title: string; subtitle: string; types: AccountType[] }[] = [
    { title: "日常的钱", subtitle: "银行卡、平台余额和现金", types: ["bank", "balance", "cash"] },
    { title: "信用卡", subtitle: "消费时记支出，还款时不重复记", types: ["credit"] },
    { title: "慢慢积累", subtitle: "投资仅记录总估值，无需每天更新", types: ["investment"] },
  ];
  return <div className="accounts-view">
    <section className="net-worth-hero" aria-label="净资产概览"><div><span className="hero-label">我的净资产<Leaf /></span><Amount value={summary.net} currency /><p>一点一滴，都是生活的底气。</p></div><div className="hero-breakdown"><div><span>总资产</span><strong>¥{money(summary.assets)}</strong></div><div><span>总负债</span><strong>¥{money(summary.debts)}</strong></div></div><Fish className="hero-fish" aria-hidden="true" /></section>
    {!book.accounts.length && <Empty className="empty-ledger"><EmptyHeader><EmptyMedia variant="icon"><Wallet /></EmptyMedia><EmptyTitle>先记下钱在哪里</EmptyTitle><EmptyDescription>添加一张银行卡、零钱或信用卡，填上现在的余额，就可以开始记账了。</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onAdd}><Plus data-icon="inline-start" />添加第一个账户</Button></EmptyContent></Empty>}
    {groups.map((group) => {
      const accounts = book.accounts.filter((a) => group.types.includes(a.type));
      if (!accounts.length) return null;
      return <section key={group.title} className="account-group"><div className="section-heading"><div className="account-section-title"><h2>{group.title}<span>{accounts.length}</span></h2><p>{group.subtitle}</p></div></div><div className="account-grid">{accounts.map((a) => {
        const balance = summary.balances.get(a.id) ?? 0;
        return <Card key={a.id} className="account-card"><CardHeader><div className="account-card-name"><AccountIcon type={a.type} /><div><CardTitle>{a.name}</CardTitle><CardDescription>{accountTypeNames[a.type]}</CardDescription></div></div><CardAction><Button variant="ghost" size="icon" aria-label={`管理${a.name}`} onClick={() => onManage(a)}><SlidersHorizontal /></Button></CardAction></CardHeader><CardContent><p className="account-balance-label">{a.type === "credit" ? balance <= 0 ? "待还金额" : "溢缴款" : a.type === "investment" ? "当前估值" : "账户余额"}</p><div className="account-balance"><Amount value={a.type === "credit" ? Math.abs(balance) : balance} currency /></div><p className="account-note">{a.note || "留一点余地，也存一点期待。"}</p><Separator /><div className="account-actions"><Button variant="ghost" size="sm" onClick={() => onView(a.id)}>查看账目<ArrowRight data-icon="inline-end" /></Button><Button variant="ghost" size="sm" onClick={() => onManage(a)}>{a.type === "investment" ? "更新估值" : "核对余额"}</Button></div></CardContent></Card>;
      })}</div></section>;
    })}
    {summary.receivable > 0 && <section className="receivable-section"><div><span className="category-icon tone-olive"><RotateCcw /></span><div><h2>待报销，也是你的钱</h2><p>共 ¥{money(summary.receivable)}，已计入总资产。</p></div></div><div className="receivable-items">{book.transactions.filter((t) => t.reimbursable && (summary.remaining.get(t.id) ?? 0) > 0).map((t) => <Button key={t.id} variant="outline" onClick={() => onReimburse(t.id)}>{t.note || "垫付款"}<ArrowRight data-icon="inline-end" /></Button>)}</div></section>}
  </div>;
}

function TransactionDetail({ book, transaction: t, onClose, onEdit, onReimburse, onDelete, saving }: {
  book: Book; transaction: Transaction; onClose: () => void; onEdit: () => void; onReimburse: () => void; onDelete: () => Promise<void>; saving: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const account = (id: string) => book.accounts.find((a) => a.id === id)?.name;
  const remaining = outstanding(book, t.id);
  const repayments = book.transactions.filter((r) => r.reimbursementFor === t.id);
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose(); }}><DialogContent className="compact-dialog detail-dialog"><DialogHeader><DialogTitle>账目详情</DialogTitle><DialogDescription>{t.date} · {transactionTitle(t, book)}</DialogDescription></DialogHeader>
    <div className="detail-hero"><TransactionIcon transaction={t} options={bookCategories(book)} /><div className={cn("detail-amount", t.kind === "income" && "positive")}>{t.kind === "income" || t.kind === "reimbursement" ? "+" : t.kind === "expense" ? "−" : ""}¥{money(t.amount)}</div><p>{t.note || transactionTitle(t, book)}</p></div>
    <dl className="detail-rows"><div><dt>类型</dt><dd>{kindNames[t.kind]}{t.reimbursable ? " · 垫付" : ""}</dd></div>{account(t.from) && <div><dt>{t.kind === "expense" ? "付款账户" : "转出账户"}</dt><dd>{account(t.from)}</dd></div>}{account(t.to) && <div><dt>转入账户</dt><dd>{account(t.to)}</dd></div>}<div><dt>收支统计</dt><dd>{t.kind === "expense" && !t.reimbursable ? "计入个人支出" : t.kind === "income" ? "计入个人收入" : "不计入个人收支"}</dd></div>{t.reimbursable && <><div><dt>已报销</dt><dd>¥{money(t.amount - remaining)}</dd></div><div><dt>待报销</dt><dd>¥{money(remaining)}</dd></div></>}</dl>
    {repayments.length > 0 && <div className="reimbursement-history"><strong>到账记录</strong>{repayments.map((r) => <div key={r.id}><span>{r.date} · {account(r.to)}</span><span>¥{money(r.amount)}</span></div>)}</div>}
    {t.reimbursable && remaining > 0 && <Button size="lg" onClick={onReimburse}><Check data-icon="inline-start" />记录报销到账</Button>}
    {confirmDelete && <p className="delete-warning" role="alert">确定删除这笔账？{repayments.length > 0 ? "关联的报销到账记录也会删除，" : ""}相关账户余额会恢复。</p>}
    {error && <p role="alert" className="delete-warning">{error}</p>}
    <div className="detail-actions"><Button variant={confirmDelete ? "destructive" : "ghost"} disabled={saving} onClick={async () => { if (!confirmDelete) setConfirmDelete(true); else { try { await onDelete(); } catch (e) { setError(e instanceof Error ? e.message : "删除失败"); } } }}><Trash2 data-icon="inline-start" />{saving ? "正在删除…" : confirmDelete ? "确认删除" : "删除"}</Button>{confirmDelete ? <Button variant="outline" onClick={() => setConfirmDelete(false)}>保留这笔账</Button> : t.kind !== "adjustment" && t.kind !== "reimbursement" && <Button variant="outline" onClick={onEdit}><Pencil data-icon="inline-start" />编辑</Button>}</div>
  </DialogContent></Dialog>;
}

function AboutDialog({ onClose, book, user, onManageCategories, onImport }: { onImport: () => void; onClose: () => void; book: Book; user?: { name: string; email: string | null }; onManageCategories: () => void }) {
  const [error, setError] = useState("");
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(book, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `年年有鱼-账本-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("暂时无法退出，请稍后再试");
      // A full navigation discards cached private screens and their in-memory book data.
      const { url } = await response.json();
      window.location.replace(url || new URL("/login", window.location.origin).href);
    } catch (error) { setError(error instanceof Error ? error.message : "操作失败"); }
  }
  return <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}><DialogContent className="compact-dialog"><DialogHeader><DialogTitle>把日子过得心中有数</DialogTitle><DialogDescription>年年有鱼 · 我的个人账本</DialogDescription></DialogHeader>
    <div className="about-copy"><p>账目和账户已保存到你的个人账本。使用同一账号，在手机和电脑上接着记。</p><p>你可以导出账本留存；恢复数据库时需要使用数据库备份。</p><p>金额以分保存。转账、还款、报销及余额调整不计入日常收支。</p></div>
    <Button variant="outline" onClick={onImport}><Upload data-icon="inline-start" />账单导入</Button>
    <Button variant="outline" onClick={onManageCategories}><Tags data-icon="inline-start" />分类管理</Button>
    <Button variant="outline" onClick={download}><Download data-icon="inline-start" />导出账本记录</Button>
    <p className="signed-in-user">当前登录：{user?.name ?? "记账人"}{user?.email ? ` · ${user.email}` : ""}</p><p className="account-center-note">账号与登录方式在账号中心统一管理。其他用户看不到你的账本。</p><Button variant="ghost" onClick={logout}>退出登录</Button>
    {error && <p role="alert" className="delete-warning">{error}</p>}
  </DialogContent></Dialog>;
}
