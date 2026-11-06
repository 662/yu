"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, Fish, Leaf, Plus, Settings, Sparkles, Sprout, Tags, Upload, Wallet, X } from "lucide-react";
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

const pageTitles: Record<string, string> = { ledger: "账目", accounts: "账户", imports: "账单导入", categories: "分类管理" };
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
  const [showWelcomeNote, setShowWelcomeNote] = useState(true);
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
        <Link href="/ledger" className={cn("nav-item", page === "ledger" && "active")} aria-current={page === "ledger" ? "page" : undefined}><BookOpen /><span>账目</span><span className="nav-dot" /></Link>
        <Link href="/accounts" className={cn("nav-item", page === "accounts" && "active")} aria-current={page === "accounts" ? "page" : undefined}><Wallet /><span>账户</span></Link>
        <Link href="/imports" className={cn("nav-item", page === "imports" && "active")} aria-current={page === "imports" ? "page" : undefined}><Upload /><span>账单导入</span></Link>
        <Link href="/categories" className={cn("nav-item", page === "categories" && "active")} aria-current={page === "categories" ? "page" : undefined}><Tags /><span>分类管理</span></Link>
      </nav>
      <div className="sidebar-note"><Leaf /><p>每一笔小小的记录，<br />都在靠近想要的生活。</p><div className="note-line" /></div>
      <div className="sidebar-bottom"><Button variant="ghost" onClick={() => setModal({ type: "about" })}><CircleHelp data-icon="inline-start" />账本与设置</Button><span>年年有鱼 · 慢慢积累，岁岁有余</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>{`${user?.name ?? "我"}的账本`}</span><ChevronRight /><strong>{pageTitles[page]}</strong></div>
        <span className="mobile-brand"><Fish />年年有鱼</span>
        <div className="topbar-end"><Button variant="ghost" size="sm" aria-label="账本与设置" onClick={() => setModal({ type: "about" })}><Settings data-icon="inline-start" /><span>账本与设置</span></Button><span className="profile-avatar" title={user?.name}>{user?.name?.slice(0, 1) ?? "我"}</span></div>
      </header>

      <main className="main-content">
        {showWelcomeNote && <div className="welcome-note"><Sparkles /><p>{book.accounts.length ? "记录已保存到你的个人账本，手机和电脑登录后可以接着记。" : "从一个账户开始：记下现在的余额，再慢慢记录之后的每一笔。"}</p><Button variant="ghost" size="icon-sm" aria-label="收起提示" onClick={() => setShowWelcomeNote(false)}><X /></Button></div>}
        {syncError && <Alert className="sync-warning"><AlertDescription>{syncError}</AlertDescription>{syncError.includes("登录") ? <Link href="/login" target="_blank" rel="noopener noreferrer">重新登录</Link> : <Button variant="outline" size="sm" onClick={() => void refresh()}>重新同步</Button>}</Alert>}
        <div className="page-heading" data-page={page}><div><p className="eyebrow">{page === "ledger" ? "LITTLE MOMENTS, EVERY DAY" : page === "accounts" ? "A LITTLE MORE PEACE OF MIND" : page === "imports" ? "BRING YOUR MOMENTS TOGETHER" : "A PLACE FOR EVERY LITTLE THING"}</p><h1>{pageTitles[page]}</h1><p className="page-subtitle">{page === "ledger" ? "日子，一笔一笔。记下生活的点滴。" : page === "accounts" ? "家底，一目了然。钱在哪里，还有多少，都在这里。" : page === "imports" ? "微信、支付宝和招商银行 · 先核对，再入账。" : "把生活分得刚刚好。只会改变你自己的账本。"}</p></div>
          {(page === "ledger" || page === "accounts") && <Button size="lg" onClick={() => page === "ledger" ? startEntry() : setModal({ type: "account" })}><Plus data-icon="inline-start" />{page === "ledger" ? "记一笔" : "添加账户"}</Button>}{page === "categories" && modal?.type === "entry" && <Button variant="outline" onClick={returnToEntry}><ChevronLeft data-icon="inline-start" />返回记账</Button>}
        </div>

        {children}
        <footer className="page-footer"><Fish /><span>年年有鱼，岁岁有余。</span><span className="footer-private">一份只属于自己的生活记录</span></footer>
      </main>
    </div>

    <nav className="mobile-nav" aria-label="移动端导航"><Link href="/ledger" className={cn(page === "ledger" && "active")} aria-current={page === "ledger" ? "page" : undefined}><BookOpen /><span>账目</span></Link><Button size="lg" onClick={startEntry}><Plus data-icon="inline-start" />记一笔</Button><Link href="/accounts" className={cn(page === "accounts" && "active")} aria-current={page === "accounts" ? "page" : undefined}><Wallet /><span>账户</span></Link><button onClick={() => setModal({ type: "about" })} aria-label="账本与设置"><Settings /><span>设置</span></button></nav>

    {modal?.type === "entry" && <EntryDialog book={book} today={today} transaction={modal.transaction} onClose={() => setModal(null)} onSave={save} saving={saving} onManageCategories={manageCategories} open={page !== "categories"} />}
    {modal?.type === "account" && <AccountDialog book={book} today={today} account={modal.account} onClose={() => setModal(current => current?.type === "entry" ? current : null)} onSave={async (account, balance) => { await saveAccount(account, balance); if (modal.continueEntry) setModal({ type: "entry" }); }} saving={saving} />}
    {modal?.type === "reimburse" && activeTransaction && <ReimburseDialog book={book} today={today} original={activeTransaction} onClose={() => setModal(null)} onSave={save} saving={saving} />}
    {modal?.type === "detail" && activeTransaction && <TransactionDetail book={book} transaction={activeTransaction} onClose={() => setModal(null)} onEdit={() => setModal({ type: "entry", transaction: activeTransaction })} onReimburse={() => setModal({ type: "reimburse", id: activeTransaction.id })} saving={saving} onDelete={async () => { await mutate({ type: "transaction.delete", id: activeTransaction.id }); setModal(null); notify("账目已删除，账户余额已同步恢复"); }} />}
    {modal?.type === "about" && <AboutDialog onClose={() => setModal(null)} book={book} user={user} />}
  </div></WorkspaceContext.Provider>;
}
