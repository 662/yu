"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup, FieldError, FieldDescription } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDraftProtection } from "./draft-protection";
import { FieldValidationError, readAmount, checkDate, useFormFeedback } from "./form-feedback";
import { CategoryIcon } from "./icons";
import { activeCategories, bookCategories, type CategoryKind } from "./categories";
import {
  accountBalance, accountTypeNames, money, outstanding, createTransaction,
  type Account, type AccountType, type Book, type Kind, type Transaction, type TransactionInput,
} from "./ledger";

export const kindNames: Record<Kind, string> = {
  expense: "支出", income: "收入", transfer: "转账", repayment: "还信用卡", reimbursement: "报销到账", adjustment: "余额调整",
};

export function AccountSelect({ accounts, value, onChange, id, label, error, disabled = false }: {
  accounts: Account[]; value: string; onChange: (id: string) => void; id: string; label: string; error?: string; disabled?: boolean;
}) {
  return <Field data-invalid={!!error}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled} required>
      <NativeSelectOption value="" disabled>选择账户</NativeSelectOption>
      {accounts.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
    </NativeSelect>
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
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
  const { error, fields, clear, reject } = useFormFeedback();

  const draft = JSON.stringify({ kind, amount, category, from, to, date, note, reimbursable });
  const [initialDraft] = useState(draft);
  const discard = useDraftProtection("entry", draft !== initialDraft || saving);

  function changeKind(next: Kind) {
    setKind(next);
    clear();
    if (next === "income") { setCategory(activeCategories(book, "income")[0]?.id ?? ""); setTo(book.accounts.some(a => a.id === to) ? to : book.accounts.find(a => a.type === "bank")?.id ?? book.accounts[0]?.id ?? ""); }
    if (next === "expense") setCategory(activeCategories(book, "expense")[0]?.id ?? "");
    if (next === "transfer" && from === to) setTo(book.accounts.find(a => a.id !== from)?.id ?? "");
    if (next === "repayment") {
      setFrom(book.accounts.find((a) => a.type === "bank")?.id ?? book.accounts.find(a => a.type !== "credit")?.id ?? "");
      setTo(book.accounts.find((a) => a.type === "credit")?.id ?? "");
    }
  }

  const categoryChoices = bookCategories(book).filter((c) => c.kind === kind && (!c.archived || (transaction?.kind === kind && transaction.category === c.id)));
  const selectedCategory = categoryChoices.some((c) => c.id === category) ? category : categoryChoices[0]?.id ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    clear();
    try {
      const cents = readAmount(amount, "entry-amount");
      checkDate(date, "entry-date");
      if (kind !== "income" && !book.accounts.some(a => a.id === from && (kind !== "repayment" || a.type !== "credit"))) throw new FieldValidationError("entry-from", "请选择有效的付款账户");
      if (kind !== "expense" && !book.accounts.some(a => a.id === to && (kind !== "repayment" || a.type === "credit"))) throw new FieldValidationError("entry-to", "请选择有效的收款账户");
      if ((kind === "transfer" || kind === "repayment") && from === to) throw new FieldValidationError("entry-to", "转出和转入账户不能相同");
      const input = { kind, amount: cents, category: selectedCategory, from: kind === "income" ? "" : from, to: kind === "expense" ? "" : to, date, note: note.trim(), reimbursable: kind === "expense" && reimbursable };
      createTransaction(book, input, draftId);
      await onSave(input, draftId);
      onClose();
    } catch (e) { reject(e); }
  }

  const isTransfer = kind === "transfer" || kind === "repayment";
  return <Dialog open={open} onOpenChange={(open) => { if (!open && !saving) discard(onClose); }}>
    <DialogContent className="entry-dialog">
      <DialogHeader>
        <DialogTitle>{transaction ? "编辑这笔账" : "记一笔"}</DialogTitle>
        <DialogDescription>把生活记下来，每一笔都有着落。</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="entry-form">
        <FieldGroup>
          <ToggleGroup aria-label="记账类型" value={[kind]} onValueChange={(v) => { if (v[0]) changeKind(v[0] as Kind); }} className="entry-kinds" spacing={1}>
            {(["expense", "income", "transfer", "repayment"] as const).map((k) => <ToggleGroupItem key={k} value={k} disabled={saving || (k === "repayment" && (!book.accounts.some(a => a.type === "credit") || !book.accounts.some(a => a.type !== "credit"))) || (k === "transfer" && book.accounts.length < 2)}>{kindNames[k]}</ToggleGroupItem>)}
          </ToggleGroup>
          {!book.accounts.some(a => a.type === "credit") && <p className="form-hint">需要还信用卡？先在账户页添加信用卡账户。</p>}
          <Field data-invalid={!!fields["entry-amount"]}>
            <FieldLabel htmlFor="entry-amount">{kind === "repayment" ? "还款金额" : "金额"}</FieldLabel>
            <div className="amount-field"><span aria-hidden="true">¥</span><Input id="entry-amount" variant="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); clear(); }} aria-invalid={!!fields["entry-amount"]} aria-describedby={fields["entry-amount"] ? "entry-amount-error" : undefined} required autoFocus /></div>{fields["entry-amount"] && <FieldError id="entry-amount-error">{fields["entry-amount"]}</FieldError>}
          </Field>
          {(kind === "expense" || kind === "income") && <Field>
            <div className="category-field-heading"><FieldLabel>选个分类</FieldLabel><Button type="button" variant="ghost" size="sm" onClick={() => onManageCategories(kind)}>管理分类</Button></div>
            <ToggleGroup size="category" aria-label={kind === "expense" ? "支出分类" : "收入分类"} value={[selectedCategory]} onValueChange={(v) => { if (v[0]) setCategory(v[0]); }} className="category-grid" spacing={1}>
              {categoryChoices.map((c) => <ToggleGroupItem variant="category" key={c.id} value={c.id}><CategoryIcon category={c} /><span>{c.name}{c.archived ? "（已停用）" : ""}</span></ToggleGroupItem>)}
            </ToggleGroup>
          </Field>}
          <FieldGroup className={isTransfer ? "account-pair" : ""}>
            {kind !== "income" && <AccountSelect id="entry-from" label={isTransfer ? "从哪个账户" : "付款账户"} accounts={kind === "repayment" ? book.accounts.filter((a) => a.type !== "credit") : book.accounts} value={from} disabled={saving} error={fields["entry-from"]} onChange={value => { setFrom(value); clear("entry-from"); if (isTransfer && value === to) setTo(book.accounts.find(a => a.id !== value && (kind !== "repayment" || a.type === "credit"))?.id ?? ""); }} />}
            {isTransfer && <ArrowRight className="transfer-arrow" aria-hidden="true" />}
            {kind !== "expense" && <AccountSelect id="entry-to" label={kind === "repayment" ? "还哪张信用卡" : isTransfer ? "转入账户" : "收款账户"} accounts={kind === "repayment" ? book.accounts.filter((a) => a.type === "credit") : isTransfer ? book.accounts.filter(a => a.id !== from) : book.accounts} value={to} disabled={saving} error={fields["entry-to"]} onChange={value => { setTo(value); clear("entry-to"); }} />}
          </FieldGroup>
          {isTransfer && <p className="form-hint">{kind === "repayment" ? "还款会减少账户余额和信用卡欠款，不会重复计算支出。" : "钱只是换个地方，不计入收入和支出。"}</p>}
          <FieldGroup className="entry-meta">
            <Field data-invalid={!!fields["entry-date"]}><FieldLabel htmlFor="entry-date">日期</FieldLabel><Input id="entry-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); clear("entry-date"); }} aria-invalid={!!fields["entry-date"]} aria-describedby={fields["entry-date"] ? "entry-date-error" : undefined} required />{fields["entry-date"] && <FieldError id="entry-date-error">{fields["entry-date"]}</FieldError>}</Field>
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
  const { error, fields, clear, reject } = useFormFeedback();
  const draft = JSON.stringify({ amount, to, date });
  const [initialDraft] = useState(draft);
  const discard = useDraftProtection("reimburse", draft !== initialDraft || saving);
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) discard(onClose); }}><DialogContent className="compact-dialog">
    <DialogHeader><DialogTitle>报销到账</DialogTitle><DialogDescription>{original.note || "垫付款"} · 还待收回 ¥{money(remaining)}</DialogDescription></DialogHeader>
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (saving) return;
      clear();
      try {
        const cents = readAmount(amount, "reimburse-amount");
        if (cents > remaining) throw new FieldValidationError("reimburse-amount", "报销金额不能超过待报销金额");
        checkDate(date, "reimburse-date");
        if (date < original.date) throw new FieldValidationError("reimburse-date", "到账日期不能早于垫付日期");
        await onSave({ kind: "reimbursement", amount: cents, date, category: "报销", from: "", to, note: original.note, reimbursable: false, reimbursementFor: original.id }, draftId);
        onClose();
      } catch (e) { reject(e); }
    }}><FieldGroup>
      <Field data-invalid={!!fields["reimburse-amount"]}><FieldLabel htmlFor="reimburse-amount">本次到账金额</FieldLabel><Input id="reimburse-amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); clear("reimburse-amount"); }} aria-invalid={!!fields["reimburse-amount"]} aria-describedby={fields["reimburse-amount"] ? "reimburse-amount-error" : undefined} required />{fields["reimburse-amount"] && <FieldError id="reimburse-amount-error">{fields["reimburse-amount"]}</FieldError>}<FieldDescription>支持分次到账，不计入个人收入。</FieldDescription></Field>
      <AccountSelect id="reimburse-to" label="收款账户" accounts={book.accounts} value={to} onChange={setTo} />
      <Field data-invalid={!!fields["reimburse-date"]}><FieldLabel htmlFor="reimburse-date">到账日期</FieldLabel><Input id="reimburse-date" type="date" value={date} min={original.date} onChange={(e) => { setDate(e.target.value); clear("reimburse-date"); }} aria-invalid={!!fields["reimburse-date"]} aria-describedby={fields["reimburse-date"] ? "reimburse-date-error" : undefined} required />{fields["reimburse-date"] && <FieldError id="reimburse-date-error">{fields["reimburse-date"]}</FieldError>}</Field>
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
  const { error, fields, clear, reject } = useFormFeedback();
  const draft = JSON.stringify({ name, type, balance, negative, creditSurplus, note });
  const [initialDraft] = useState(draft);
  const discard = useDraftProtection("account", draft !== initialDraft || saving);
  return <Dialog open onOpenChange={(v) => { if (!v && !saving) discard(onClose); }}><DialogContent className="compact-dialog">
    <DialogHeader><DialogTitle>{account ? (type === "investment" ? "更新投资估值" : "管理账户") : "添加账户"}</DialogTitle><DialogDescription>{account ? "核对实际余额，让家底心中有数。" : "先记下现在的余额，以后的变化慢慢记。"}</DialogDescription></DialogHeader>
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (saving) return;
      clear();
      try {
        if (!name.trim()) throw new FieldValidationError("account-name", "请填写账户名称");
        if (book.accounts.some((a) => a.id !== account?.id && a.name === name.trim())) throw new FieldValidationError("account-name", "已有同名账户，请换个名称");
        const parsed = readAmount(balance, "account-balance", true);
        const signed = ((type === "credit" && !creditSurplus) || (type !== "credit" && negative)) ? -parsed : parsed;
        const nextAccount: Account = { id: draftId, name: name.trim(), type, openingBalance: account?.openingBalance ?? signed, note: type === "investment" ? `最近估值 ${today}` : note.trim() };
        await onSave(nextAccount, signed);
        onClose();
      } catch (e) { reject(e); }
    }}><FieldGroup>
      <Field data-invalid={!!fields["account-name"]}><FieldLabel htmlFor="account-name">账户名称</FieldLabel><Input id="account-name" placeholder="例如：招商银行卡" maxLength={30} value={name} onChange={(e) => { setName(e.target.value); clear("account-name"); }} aria-invalid={!!fields["account-name"]} aria-describedby={fields["account-name"] ? "account-name-error" : undefined} required autoFocus />{fields["account-name"] && <FieldError id="account-name-error">{fields["account-name"]}</FieldError>}</Field>
      <Field><FieldLabel htmlFor="account-type">账户类型</FieldLabel><NativeSelect id="account-type" className="w-full" value={type} disabled={Boolean(account)} onChange={(e) => { setType(e.target.value as AccountType); setNegative(false); setCreditSurplus(false); clear(); }}>{Object.entries(accountTypeNames).map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field data-invalid={!!fields["account-balance"]}><FieldLabel htmlFor="account-balance">{type === "credit" ? creditSurplus ? "当前溢缴款" : "当前待还金额" : type === "investment" ? "当前总估值" : "当前余额"}</FieldLabel><Input id="account-balance" inputMode="decimal" value={balance} onChange={(e) => { setBalance(e.target.value); clear("account-balance"); }} aria-invalid={!!fields["account-balance"]} aria-describedby={fields["account-balance"] ? "account-balance-error" : undefined} required />{fields["account-balance"] && <FieldError id="account-balance-error">{fields["account-balance"]}</FieldError>}<FieldDescription>{account ? "余额差额会记作调整，不影响日常收支统计。" : "作为期初余额，不计入收入和支出。"}</FieldDescription></Field>
      {type === "credit" && <Field orientation="horizontal"><input id="credit-surplus" type="checkbox" checked={creditSurplus} onChange={(e) => setCreditSurplus(e.target.checked)} /><FieldLabel htmlFor="credit-surplus">这是溢缴款（多还的钱）</FieldLabel></Field>}
      {type !== "credit" && type !== "investment" && <Field orientation="horizontal"><input id="negative-balance" type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} /><FieldLabel htmlFor="negative-balance">余额为负数</FieldLabel></Field>}
      {type !== "investment" && <Field><FieldLabel htmlFor="account-note">备注 <span className="optional">选填</span></FieldLabel><Input id="account-note" placeholder="卡号尾号、用途等" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      {error && <FieldError>{error}</FieldError>}
      <Button size="lg" type="submit" disabled={saving}>{account ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{saving ? "正在保存…" : account ? "保存账户" : "添加账户"}</Button>
    </FieldGroup></form>
  </DialogContent></Dialog>;
}
