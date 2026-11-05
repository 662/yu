"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup, FieldError, FieldDescription } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon } from "./icons";
import { activeCategories, bookCategories, type CategoryKind } from "./categories";
import {
  accountBalance, accountTypeNames, parseMoney, money, outstanding,
  type Account, type AccountType, type Book, type Kind, type Transaction, type TransactionInput,
} from "./ledger";

export const kindNames: Record<Kind, string> = {
  expense: "支出", income: "收入", transfer: "转账", repayment: "还信用卡", reimbursement: "报销到账", adjustment: "余额调整",
};

export function AccountSelect({ accounts, value, onChange, id, label }: {
  accounts: Account[]; value: string; onChange: (id: string) => void; id: string; label: string;
}) {
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full" required>
      <NativeSelectOption value="" disabled>选择账户</NativeSelectOption>
      {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
    </NativeSelect>
  </Field>;
}

export function EntryDialog({ book, today, transaction, onClose, onSave, saving = false, onManageCategories, open = true }: {
  book: Book; today: string; transaction?: Transaction; onClose: () => void;
  onSave: (input: TransactionInput, id?: string) => Promise<void>; saving?: boolean; onManageCategories: (kind: CategoryKind) => void; open?: boolean;
}) {
  const [draftId] = useState(() => transaction?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<Kind>(transaction?.kind ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount / 100) : "");
  const [category, setCategory] = useState(transaction?.category ?? activeCategories(book, "expense")[0]?.id ?? "");
  const [from, setFrom] = useState(transaction?.from || book.transactions.find((t) => t.kind === "expense")?.from || book.accounts[0]?.id || "");
  const [to, setTo] = useState(transaction?.to || book.accounts.find((a) => a.id !== from && a.type !== "credit")?.id || "");
  const [date, setDate] = useState(transaction?.date ?? today);
  const [note, setNote] = useState(transaction?.note ?? "");
  const [reimbursable, setReimbursable] = useState(transaction?.reimbursable ?? false);
  const [more, setMore] = useState(Boolean(transaction?.reimbursable));
  const [error, setError] = useState("");

  function changeKind(next: Kind) {
    setKind(next);
    setError("");
    if (next === "income") { setCategory(activeCategories(book, "income")[0]?.id ?? ""); setTo(book.accounts.find((a) => a.type === "bank")?.id ?? ""); }
    if (next === "expense") setCategory(activeCategories(book, "expense")[0]?.id ?? "");
    if (next === "repayment") {
      setFrom(book.accounts.find((a) => a.type === "bank")?.id ?? "");
      setTo(book.accounts.find((a) => a.type === "credit")?.id ?? "");
    }
  }

  const categoryChoices = bookCategories(book).filter((c) => c.kind === kind && (!c.archived || (transaction?.kind === kind && transaction.category === c.id)));
  const selectedCategory = categoryChoices.some((c) => c.id === category) ? category : categoryChoices[0]?.id ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    try {
      await onSave({ kind, amount: parseMoney(amount), category: selectedCategory, from: kind === "income" ? "" : from, to: kind === "expense" ? "" : to, date, note: note.trim(), reimbursable: kind === "expense" && reimbursable }, draftId);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
  }

  const isTransfer = kind === "transfer" || kind === "repayment";
  return <Dialog open={open} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="entry-dialog">
      <DialogHeader>
        <DialogTitle>{transaction ? "编辑这笔账" : "记一笔"}</DialogTitle>
        <DialogDescription>把生活记下来，每一笔都有着落。</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="entry-form">
        <FieldGroup>
          <ToggleGroup aria-label="记账类型" value={[kind]} onValueChange={(v) => { if (v[0]) changeKind(v[0] as Kind); }} className="entry-kinds" spacing={1}>
            {(["expense", "income", "transfer", "repayment"] as const).map((k) => <ToggleGroupItem key={k} value={k}>{kindNames[k]}</ToggleGroupItem>)}
          </ToggleGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="entry-amount">{kind === "repayment" ? "还款金额" : "金额"}</FieldLabel>
            <div className="amount-field"><span aria-hidden="true">¥</span><Input id="entry-amount" variant="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} aria-invalid={Boolean(error)} required autoFocus /></div>
          </Field>
          {(kind === "expense" || kind === "income") && <Field>
            <div className="category-field-heading"><FieldLabel>选个分类</FieldLabel><Button type="button" variant="ghost" size="sm" onClick={() => onManageCategories(kind)}>管理分类</Button></div>
            <ToggleGroup size="category" aria-label={kind === "expense" ? "支出分类" : "收入分类"} value={[selectedCategory]} onValueChange={(v) => { if (v[0]) setCategory(v[0]); }} className="category-grid" spacing={1}>
              {categoryChoices.map((c) => <ToggleGroupItem variant="category" key={c.id} value={c.id}><CategoryIcon category={c} /><span>{c.name}{c.archived ? "（已停用）" : ""}</span></ToggleGroupItem>)}
            </ToggleGroup>
          </Field>}
          <FieldGroup className={isTransfer ? "account-pair" : ""}>
            {kind !== "income" && <AccountSelect id="entry-from" label={isTransfer ? "从哪个账户" : "付款账户"} accounts={kind === "repayment" ? book.accounts.filter((a) => a.type !== "credit") : book.accounts} value={from} onChange={setFrom} />}
            {isTransfer && <ArrowRight className="transfer-arrow" aria-hidden="true" />}
            {kind !== "expense" && <AccountSelect id="entry-to" label={kind === "repayment" ? "还哪张信用卡" : isTransfer ? "转入账户" : "收款账户"} accounts={kind === "repayment" ? book.accounts.filter((a) => a.type === "credit") : book.accounts} value={to} onChange={setTo} />}
          </FieldGroup>
          {isTransfer && <p className="form-hint">{kind === "repayment" ? "还款会减少账户余额和信用卡欠款，不会重复计算支出。" : "钱只是换个地方，不计入收入和支出。"}</p>}
          <FieldGroup className="entry-meta">
            <Field><FieldLabel htmlFor="entry-date">日期</FieldLabel><Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="entry-note">备注 <span className="optional">选填</span></FieldLabel><Input id="entry-note" placeholder="记点什么…" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </FieldGroup>
          {kind === "expense" && <>
            <Button type="button" variant="ghost" onClick={() => setMore(!more)} className="more-options" aria-expanded={more}><ChevronDown data-icon="inline-start" />更多选项</Button>
            {more && <Field orientation="horizontal"><input id="reimbursable" type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} /><FieldLabel htmlFor="reimbursable">这笔是垫付，之后会报销</FieldLabel></Field>}
            {reimbursable && more && <p className="form-hint">从付款账户扣款，计入待报销，不计入个人花销。</p>}
          </>}
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="lg" className="w-full" disabled={saving}><Check data-icon="inline-start" />{saving ? "正在保存…" : transaction ? "保存修改" : "记好了"}</Button>
          <p className="keyboard-hint">Enter 保存 · Esc 关闭</p>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ReimburseDialog({ book, original, today, onClose, onSave, saving = false }: {
  book: Book; original: Transaction; today: string; onClose: () => void; onSave: (input: TransactionInput, id?: string) => Promise<void>; saving?: boolean;
}) {
  const [draftId] = useState(() => crypto.randomUUID());
  const remaining = outstanding(book, original.id);
  const [amount, setAmount] = useState(String(remaining / 100));
  const [to, setTo] = useState(original.from);
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose(); }}><DialogContent className="compact-dialog">
    <DialogHeader><DialogTitle>报销到账</DialogTitle><DialogDescription>{original.note || "垫付款"} · 还待收回 ¥{money(remaining)}</DialogDescription></DialogHeader>
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (saving) return;
      try {
        await onSave({ kind: "reimbursement", amount: parseMoney(amount), date, category: "报销", from: "", to, note: original.note, reimbursable: false, reimbursementFor: original.id }, draftId);
        onClose();
      } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    }}><FieldGroup>
      <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="reimburse-amount">本次到账金额</FieldLabel><Input id="reimburse-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(error)} required /><FieldDescription>支持分次到账，不计入个人收入。</FieldDescription></Field>
      <AccountSelect id="reimburse-to" label="收款账户" accounts={book.accounts} value={to} onChange={setTo} />
      <Field><FieldLabel htmlFor="reimburse-date">到账日期</FieldLabel><Input id="reimburse-date" type="date" value={date} min={original.date} onChange={(e) => setDate(e.target.value)} required /></Field>
      {error && <FieldError>{error}</FieldError>}
      <Button size="lg" type="submit" disabled={saving}><Check data-icon="inline-start" />{saving ? "正在保存…" : "确认到账"}</Button>
    </FieldGroup></form>
  </DialogContent></Dialog>;
}

export function AccountDialog({ book, account, today, onClose, onSave, saving = false }: {
  book: Book; account?: Account; today: string; onClose: () => void; onSave: (account: Account, balance: number) => Promise<void>; saving?: boolean;
}) {
  const [draftId] = useState(() => account?.id ?? crypto.randomUUID());
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const currentBalance = account ? accountBalance(book, account.id) : 0;
  const [balance, setBalance] = useState(String(Math.abs(currentBalance) / 100));
  const [negative, setNegative] = useState(currentBalance < 0 && account?.type !== "credit");
  const [creditSurplus, setCreditSurplus] = useState(currentBalance > 0 && account?.type === "credit");
  const [note, setNote] = useState(account?.note ?? "");
  const [error, setError] = useState("");
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose(); }}><DialogContent className="compact-dialog">
    <DialogHeader><DialogTitle>{account ? (type === "investment" ? "更新投资估值" : "管理账户") : "添加账户"}</DialogTitle><DialogDescription>{account ? "核对实际余额，让家底心中有数。" : "先记下现在的余额，以后的变化慢慢记。"}</DialogDescription></DialogHeader>
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (saving) return;
      try {
        if (!name.trim()) throw new Error("请填写账户名称");
        if (book.accounts.some((a) => a.id !== account?.id && a.name === name.trim())) throw new Error("已有同名账户，请换个名称");
        const parsed = parseMoney(balance);
        const signed = ((type === "credit" && !creditSurplus) || (type !== "credit" && negative)) ? -parsed : parsed;
        const nextAccount: Account = { id: draftId, name: name.trim(), type, openingBalance: account?.openingBalance ?? signed, note: type === "investment" ? `最近估值 ${today}` : note.trim() };
        await onSave(nextAccount, signed);
        onClose();
      } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    }}><FieldGroup>
      <Field><FieldLabel htmlFor="account-name">账户名称</FieldLabel><Input id="account-name" placeholder="例如：招商银行卡" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field><FieldLabel htmlFor="account-type">账户类型</FieldLabel><NativeSelect id="account-type" className="w-full" value={type} disabled={Boolean(account)} onChange={(e) => { setType(e.target.value as AccountType); setNegative(false); }}>{Object.entries(accountTypeNames).map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field data-invalid={Boolean(error)}><FieldLabel htmlFor="account-balance">{type === "credit" ? creditSurplus ? "当前溢缴款" : "当前待还金额" : type === "investment" ? "当前总估值" : "当前余额"}</FieldLabel><Input id="account-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} aria-invalid={Boolean(error)} required /><FieldDescription>{account ? "余额差额会记作调整，不影响日常收支统计。" : "作为期初余额，不计入收入和支出。"}</FieldDescription></Field>
      {type === "credit" && <Field orientation="horizontal"><input id="credit-surplus" type="checkbox" checked={creditSurplus} onChange={(e) => setCreditSurplus(e.target.checked)} /><FieldLabel htmlFor="credit-surplus">这是溢缴款（多还的钱）</FieldLabel></Field>}
      {type !== "credit" && type !== "investment" && <Field orientation="horizontal"><input id="negative-balance" type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} /><FieldLabel htmlFor="negative-balance">余额为负数</FieldLabel></Field>}
      {type !== "investment" && <Field><FieldLabel htmlFor="account-note">备注 <span className="optional">选填</span></FieldLabel><Input id="account-note" placeholder="卡号尾号、用途等" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      {error && <FieldError>{error}</FieldError>}
      <Button size="lg" type="submit" disabled={saving}>{account ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{saving ? "正在保存…" : account ? "保存账户" : "添加账户"}</Button>
    </FieldGroup></form>
  </DialogContent></Dialog>;
}
