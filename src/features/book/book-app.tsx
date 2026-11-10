"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronLeft, ChevronRight, Fish, Plus, Settings, Sparkles, Sprout, Tags, Upload, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { type CategoryKind } from "./categories";
import { DraftProtection, useDiscardDrafts } from "./draft-protection";
import { AccountDialog, EntryDialog, ReimburseDialog } from "./forms";
import { type Account, type Book, type TransactionInput } from "./ledger";
import { useBook } from "./store";
import { ledgerHref, readLedgerLocation } from "./routes";

import { WorkspaceContext, type Modal } from "./book-context";
import { AboutDialog, TransactionDetail } from "./book-dialogs";

const bookPages = [
  { id: "ledger", title: "账目", mobileTitle: "账目", subtitle: "查看收支明细，按月份、账户或类型筛选。", icon: BookOpen },
  { id: "accounts", title: "账户", mobileTitle: "账户", subtitle: "查看余额、投资估值和信用卡欠款。", icon: Wallet },
  { id: "imports", title: "账单导入", mobileTitle: "导入", subtitle: "支持微信、支付宝和招商银行账单，核对后再入账。", icon: Upload },
  { id: "categories", title: "分类管理", mobileTitle: "分类", subtitle: "管理记账时可选的收支分类和显示顺序。", icon: Tags },
] as const;

function BookNavLink({ item, page, mobile }: { item: typeof bookPages[number]; page: string; mobile?: boolean }) {
  const active = item.id === page;
  return <Link href={`/${item.id}`} className={cn(!mobile && "nav-item", active && "active")} aria-current={active ? "page" : undefined}>
    <item.icon aria-hidden="true" /><span>{mobile ? item.mobileTitle : item.title}</span>
  </Link>;
}

function notify(title: string) { toast.add({ title, type: "success" }); }

type BookAppProps = { initial: Book; today: string; user?: { name: string; email: string | null }; children: ReactNode };

export function BookApp(props: BookAppProps) {
  const state = useBook(props.initial);
  const [modal, setModal] = useState<Modal>(null);
  if (state.accountChanged) {
    // Unmount the entire workspace, including drafts, details, imports and profile.
    return <main className="error-page"><h1>登录账号已变更</h1><p role="alert">请重新打开账本，查看当前账号的记录。</p><Button size="lg" onClick={() => window.location.replace("/ledger")}>重新打开账本</Button></main>;
  }
  return <DraftProtection onNavigate={() => setModal(null)}><BookWorkspace {...props} state={state} modal={modal} setModal={setModal} /></DraftProtection>;
}

function BookWorkspace({ today, user, state, children, modal, setModal }: BookAppProps & { state: ReturnType<typeof useBook>; modal: Modal; setModal: Dispatch<SetStateAction<Modal>> }) {
  const { book, mutate, saving, error: syncError, refresh } = state;
  const discardDrafts = useDiscardDrafts();
  const router = useRouter();
  const page = usePathname().split("/")[1];
  const currentPage = bookPages.find(item => item.id === page) ?? bookPages[0];
  function returnToEntry() {
    discardDrafts(() => router.push("/ledger"), ["category", "import"]);
  }
  function manageCategories(kind: CategoryKind) {
    discardDrafts(() => {
      const preserveEntry = modal?.type === "entry";
      if (!preserveEntry) setModal(null);
      router.push(`/categories?kind=${kind}`);
    }, ["category", "import"]);
  }
  async function save(input: TransactionInput, id?: string) {
    const editing = book.transactions.some(t => t.id === id);
    await mutate({ type: "transaction.save", id: id ?? crypto.randomUUID(), input });
    if (page === "ledger") {
      const location = readLedgerLocation(new URLSearchParams(window.location.search), today);
      const month = input.date.slice(0, 7);
      if (location.month !== month) window.history.pushState(null, "", ledgerHref({ ...location, month }));
    }
    notify(editing ? "这笔账已经更新" : input.kind === "reimbursement" ? "报销到账，余额已更新" : "记好了，生活又清楚了一点");
  }
  async function saveAccount(account: Account, balance: number) {
    const { id, name, type, note } = account;
    await mutate({ type: "account.save", account: { id, name, type, note }, balance, date: today });
    notify("账户已保存");
  }
  function startEntry() {
    const open = () => {
      if (page === "categories") router.push("/ledger");
      setModal(book.accounts.length ? { type: "entry" } : { type: "account", continueEntry: true });
    };
    discardDrafts(open, page === "categories" ? undefined : ["entry", "account", "reimburse"]);
  }
  const activeTransaction = modal && "id" in modal ? book.transactions.find(t => t.id === modal.id) : undefined;
  return <WorkspaceContext.Provider value={{ book, today, saving, mutate, setModal, startEntry }}><div className="book-app">
    <aside className="sidebar">
      <Link href="/ledger" className="brand" aria-label="年年有鱼首页"><span className="brand-mark"><Fish /></span><span>年年有鱼<small>把日子过得心中有数</small></span></Link>
      <div className="book-switch"><span className="book-avatar"><Sprout /></span><div><strong>{`${user?.name ?? "我"}的账本`}</strong><span>一个人的小日子</span></div><Badge variant="outline">个人</Badge></div>
      <p className="nav-caption">我的账本</p>
      <nav aria-label="主导航" className="desktop-nav">
        {bookPages.map(item => <BookNavLink key={item.id} item={item} page={page} />)}
      </nav>
      <div className="sidebar-bottom">慢慢积累，岁岁有余</div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>{`${user?.name ?? "我"}的账本`}</span><ChevronRight aria-hidden="true" /><strong>{currentPage.title}</strong></div>
        <Link href="/ledger" className="mobile-brand"><Fish aria-hidden="true" />年年有鱼</Link>
        <nav className="topbar-end" aria-label="账本辅助导航">
          <Link href="/wiki" className={buttonVariants({ variant: "ghost", size: "sm" })}>项目 Wiki</Link>
          <Button variant="ghost" size="sm" aria-label="账本与设置" onClick={() => setModal({ type: "about" })}><Settings data-icon="inline-start" /><span>设置</span></Button>
        </nav>
      </header>

      <main className="main-content">
        {!book.accounts.length && <div className="welcome-note"><Sparkles aria-hidden="true" /><p>先添加一个账户并填写当前余额，就可以开始记账。</p></div>}
        {syncError && <Alert className="sync-warning"><AlertDescription>{syncError}</AlertDescription>{syncError.includes("登录") ? <Link href="/login" target="_blank" rel="noopener noreferrer">重新登录</Link> : <Button variant="outline" size="sm" onClick={() => void refresh()}>重新同步</Button>}</Alert>}
        <div className="page-heading" data-page={page}><div><h1>{currentPage.title}</h1><p className="page-subtitle">{currentPage.subtitle}</p></div>
          {(page === "ledger" || page === "accounts") && <Button size="lg" onClick={() => page === "ledger" ? startEntry() : setModal({ type: "account" })}><Plus data-icon="inline-start" />{page === "ledger" ? "记一笔" : "添加账户"}</Button>}{page === "categories" && modal?.type === "entry" && <Button variant="outline" onClick={returnToEntry}><ChevronLeft data-icon="inline-start" />返回记账</Button>}
        </div>

        {children}
        <footer className="page-footer"><Fish /><span>年年有鱼，岁岁有余。</span><span className="footer-private">一份只属于自己的生活记录</span></footer>
      </main>
    </div>

    <nav className="mobile-nav" aria-label="移动端导航">
      {bookPages.slice(0, 2).map(item => <BookNavLink key={item.id} item={item} page={page} mobile />)}
      <Button onClick={startEntry}><Plus data-icon="inline-start" />记一笔</Button>
      {bookPages.slice(2).map(item => <BookNavLink key={item.id} item={item} page={page} mobile />)}
    </nav>

    {modal?.type === "entry" && <EntryDialog book={book} today={today} transaction={modal.transaction} onClose={() => setModal(null)} onSave={save} saving={saving} onManageCategories={manageCategories} open={page !== "categories"} />}
    {modal?.type === "account" && <AccountDialog book={book} today={today} account={modal.account} onClose={() => setModal(current => current?.type === "entry" ? current : null)} onSave={async (account, balance) => { await saveAccount(account, balance); if (modal.continueEntry) setModal({ type: "entry" }); }} saving={saving} />}
    {modal?.type === "reimburse" && activeTransaction && <ReimburseDialog book={book} today={today} original={activeTransaction} onClose={() => setModal(null)} onSave={save} saving={saving} />}
    {modal?.type === "detail" && activeTransaction && <TransactionDetail book={book} transaction={activeTransaction} onClose={() => setModal(null)} onEdit={() => setModal({ type: "entry", transaction: activeTransaction })} onReimburse={() => setModal({ type: "reimburse", id: activeTransaction.id })} saving={saving} onDelete={async () => { await mutate({ type: "transaction.delete", id: activeTransaction.id }); setModal(null); notify("账目已删除，账户余额已同步恢复"); }} />}
    {modal?.type === "about" && <AboutDialog onClose={() => setModal(null)} book={book} user={user} />}
  </div></WorkspaceContext.Provider>;
}
