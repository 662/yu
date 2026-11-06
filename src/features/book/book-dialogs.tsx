"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BookOpen, Check, Download, Pencil, Tags, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { bookCategories } from "./categories";
import { useDiscardDrafts } from "./draft-protection";
import { kindNames } from "./forms";
import { TransactionIcon } from "./icons";
import { money, outstanding, type Book, type Transaction } from "./ledger";

import { transactionTitle } from "./book-presentation";

export function TransactionDetail({ book, transaction: t, onClose, onEdit, onReimburse, onDelete, saving }: {
  book: Book; transaction: Transaction; onClose: () => void; onEdit: () => void; onReimburse: () => void; onDelete: () => Promise<void>; saving: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const account = (id: string) => book.accounts.find((a) => a.id === id)?.name;
  const remaining = outstanding(book, t.id);
  const repayments = book.transactions.filter((r) => r.reimbursementFor === t.id);
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose(); }}><DialogContent className="compact-dialog detail-dialog"><DialogHeader><DialogTitle>账目详情</DialogTitle><DialogDescription>{t.date} · {transactionTitle(t, book)}</DialogDescription></DialogHeader>
    <div className="detail-hero"><TransactionIcon transaction={t} options={bookCategories(book)} /><div className={cn("detail-amount", t.kind === "income" && "positive")}>{t.kind === "income" || t.kind === "reimbursement" ? "+" : t.kind === "expense" ? "−" : ""}¥{money(t.amount)}</div><p>{t.note || transactionTitle(t, book)}</p></div>
    <dl className="detail-rows"><div><dt>类型</dt><dd>{kindNames[t.kind]}{t.reimbursable ? " · 垫付" : ""}</dd></div>{account(t.from) && <div><dt>{t.kind === "expense" ? "付款账户" : "转出账户"}</dt><dd>{account(t.from)}</dd></div>}{account(t.to) && <div><dt>{t.kind === "income" || t.kind === "reimbursement" ? "收款账户" : "转入账户"}</dt><dd>{account(t.to)}</dd></div>}<div><dt>收支统计</dt><dd>{t.kind === "expense" && !t.reimbursable ? "计入个人支出" : t.kind === "income" ? "计入个人收入" : "不计入个人收支"}</dd></div>{t.reimbursable && <><div><dt>已报销</dt><dd>¥{money(t.amount - remaining)}</dd></div><div><dt>待报销</dt><dd>¥{money(remaining)}</dd></div></>}</dl>
    {repayments.length > 0 && <div className="reimbursement-history"><strong>到账记录</strong>{repayments.map((r) => <div key={r.id}><span>{r.date} · {account(r.to)}</span><span>¥{money(r.amount)}</span></div>)}</div>}
    {t.reimbursable && remaining > 0 && <Button size="lg" onClick={onReimburse}><Check data-icon="inline-start" />记录报销到账</Button>}
    <div className="detail-actions"><Button variant="ghost" disabled={saving} onClick={() => setConfirmDelete(true)}><Trash2 data-icon="inline-start" />删除</Button>{t.kind !== "adjustment" && t.kind !== "reimbursement" && <Button variant="outline" disabled={saving} onClick={onEdit}><Pencil data-icon="inline-start" />编辑</Button>}</div>
    <ConfirmAction open={confirmDelete} title="删除这笔账？" description={`将删除 ¥${money(t.amount)} 的${kindNames[t.kind]}记录。${repayments.length ? `关联的 ${repayments.length} 笔报销到账也会删除。` : ""}相关账户余额会重新计算，此操作无法恢复。`} confirmLabel="删除这笔账" onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />
  </DialogContent></Dialog>;
}

export function AboutDialog({ onClose, book, user }: { onClose: () => void; book: Book; user?: { name: string; email: string | null } }) {
  const [error, setError] = useState("");
  const discardDrafts = useDiscardDrafts();
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
  return <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}><DialogContent className="compact-dialog"><DialogHeader><DialogTitle>账本与设置</DialogTitle><DialogDescription>年年有鱼 · 我的个人账本</DialogDescription></DialogHeader>
    <div className="about-copy"><p>账目和账户已保存到你的个人账本。使用同一账号，在手机和电脑上接着记。</p><p>导出账本可留存 JSON 记录，当前不支持从该文件恢复。使用说明与维护文档见项目 Wiki。</p></div>
    <Link data-slot="button" className={buttonVariants({ variant: "outline" })} href="/imports"><Upload data-icon="inline-start" />账单导入</Link>
    <Link data-slot="button" className={buttonVariants({ variant: "outline" })} href="/categories"><Tags data-icon="inline-start" />分类管理</Link>
    <Link data-slot="button" className={buttonVariants({ variant: "outline" })} href="/wiki"><BookOpen data-icon="inline-start" />项目 Wiki</Link>
    <Button variant="outline" onClick={download}><Download data-icon="inline-start" />导出账本记录</Button>
    <p className="signed-in-user">当前登录：{user?.name ?? "记账人"}{user?.email ? ` · ${user.email}` : ""}</p><p className="account-center-note">账号与登录方式在账号中心统一管理。其他用户看不到你的账本。</p><Button variant="ghost" onClick={() => discardDrafts(() => void logout())}>退出登录</Button>
    {error && <p role="alert" className="delete-warning">{error}</p>}
  </DialogContent></Dialog>;
}
