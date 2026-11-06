"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/confirm-action";
import { useDraftProtection } from "./draft-protection";
import { FieldValidationError, useFormFeedback } from "./form-feedback";
import { cn } from "@/lib/utils";
import type { Book } from "./ledger";
import type { Command } from "./commands";
import { bookCategories, categoryIconNames, categoryTones, type Category, type CategoryKind } from "./categories";
import { categoryIcons, CategoryIcon } from "./icons";

const iconLabels = ["餐饮", "购物", "交通", "居住", "休闲", "健康", "日用", "其他", "工作", "礼物", "增长", "学习", "宠物", "旅行"];
const toneLabels = ["暖橙", "粉红", "浅蓝", "青绿", "浅紫", "橄榄", "灰色"];

export function CategoryManager({ book, kind, onKindChange, saving, onCommand }: {
  book: Book; kind: CategoryKind; onKindChange: (kind: CategoryKind) => void; saving: boolean; onCommand: (command: Command) => Promise<void>;
}) {
  const [editor, setEditor] = useState<{ category?: Category } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const group = bookCategories(book).filter((c) => c.kind === kind);
  const active = group.filter((c) => !c.archived);
  const archived = group.filter((c) => c.archived);
  async function run(command: Command, message: string) {
    if (saving) return;
    setError("");
    try { await onCommand(command); toast.add({ title: message, type: "success" }); }
    catch (error) { setError(error instanceof Error ? error.message : "暂时无法保存，请重试"); }
  }
  function move(category: Category, offset: number) {
    const at = active.findIndex((c) => c.id === category.id);
    const target = active[at + offset];
    if (!target) return;
    const ids = group.map((c) => c.id);
    const a = ids.indexOf(category.id), b = ids.indexOf(target.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    void run({ type: "category.reorder", kind, ids }, "分类顺序已保存");
  }
  return <section className="categories-page" aria-label="分类管理">
    {editor && <header className="category-editor-heading"><h2>{editor.category ? "编辑分类" : "添加分类"}</h2><p>取个顺手的名字，再选一个喜欢的图标。</p></header>}
    {editor ? <CategoryEditor key={editor.category?.id ?? `new-${kind}`} book={book} kind={kind} category={editor.category} saving={saving} onBack={() => { setEditor(null); setError(""); }} onCommand={async (command) => { await onCommand(command); setEditor(null); toast.add({ title: command.type === "category.delete" ? "分类已删除" : "分类已保存", type: "success" }); }} /> : <>
      <div className="category-manager-toolbar"><ToggleGroup aria-label="管理分类类型" value={[kind]} onValueChange={(v) => { if (v[0]) { onKindChange(v[0] as CategoryKind); setError(""); } }}><ToggleGroupItem value="expense">支出分类</ToggleGroupItem><ToggleGroupItem value="income">收入分类</ToggleGroupItem></ToggleGroup><Button onClick={() => setEditor({})} disabled={saving}><Plus data-icon="inline-start" />添加分类</Button></div>
      <div className="category-list-heading"><h3>正在使用 <span>{active.length}</span></h3><span>顺序会同步到记账选项</span></div>
      <div className="managed-categories">{active.map((c, index) => <CategoryRow key={c.id} category={c} book={book} saving={saving} onEdit={() => { setError(""); setEditor({ category: c }); }} onArchive={() => void run({ type: "category.archive", id: c.id, archived: true }, "分类已停用，历史账目保持原来的归类")} onUp={index > 0 ? () => move(c, -1) : undefined} onDown={index < active.length - 1 ? () => move(c, 1) : undefined} />)}</div>
      {!active.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><Tags /></EmptyMedia><EmptyTitle>还没有启用的分类</EmptyTitle><EmptyDescription>添加一个分类，或恢复之前停用的分类。</EmptyDescription></EmptyHeader></Empty>}
      {archived.length > 0 && <><Button variant="ghost" className="archive-heading" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}><ChevronDown data-icon="inline-start" />已停用 {archived.length} 个分类</Button>{showArchived && <div className="managed-categories">{archived.map((c) => <CategoryRow key={c.id} category={c} book={book} saving={saving} onEdit={() => setEditor({ category: c })} onArchive={() => void run({ type: "category.archive", id: c.id, archived: false }, "分类已恢复使用")} />)}</div>}</>}
      {error && <FieldError>{error}</FieldError>}
      <p className="category-manager-footnote">预设分类会保留。停用不影响历史统计；重命名会同步更新账目中的分类名称。</p>
    </>}
  </section>;
}

function CategoryRow({ category: c, book, saving, onEdit, onArchive, onUp, onDown }: {
  category: Category; book: Book; saving: boolean; onEdit: () => void; onArchive: () => void; onUp?: () => void; onDown?: () => void;
}) {
  const count = book.transactions.filter((t) => t.kind === c.kind && t.category === c.id).length;
  return <div className={cn("managed-category", c.archived && "is-archived")} data-category-id={c.id}><CategoryIcon category={c} /><div className="managed-category-info"><div><strong>{c.name}</strong>{c.preset && <Badge variant="outline">预设</Badge>}</div><span>{count ? `已用于 ${count} 笔账目` : "还没有账目"}</span></div><div className="category-row-actions">{!c.archived && <div className="category-order"><Button variant="ghost" size="icon-sm" aria-label={`上移${c.name}`} onClick={onUp} disabled={saving || !onUp}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" aria-label={`下移${c.name}`} onClick={onDown} disabled={saving || !onDown}><ArrowDown /></Button></div>}<Button variant="ghost" size="icon" aria-label={`编辑${c.name}分类`} onClick={onEdit} disabled={saving}><Pencil /></Button><Button variant="outline" size="sm" aria-label={`${c.archived ? "启用" : "停用"}${c.name}分类`} onClick={onArchive} disabled={saving}>{c.archived ? "启用" : "停用"}</Button></div></div>;
}

function CategoryEditor({ book, kind, category, saving, onBack, onCommand }: {
  book: Book; kind: CategoryKind; category?: Category; saving: boolean; onBack: () => void; onCommand: (command: Command) => Promise<void>;
}) {
  const [id] = useState(() => category?.id ?? crypto.randomUUID());
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState<Category["icon"]>(category?.icon ?? (kind === "income" ? "Briefcase" : "Ellipsis"));
  const [tone, setTone] = useState<Category["tone"]>(category?.tone ?? "green");
  const { error, fields, clear, reject } = useFormFeedback();
  const draft = JSON.stringify({ name, icon, tone });
  const [initialDraft] = useState(draft);
  const discard = useDraftProtection("category", draft !== initialDraft || saving);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const used = Boolean(category && book.transactions.some((t) => t.kind === category.kind && t.category === category.id));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    clear();
    try {
      if (!name.trim() || name.trim().length > 20) throw new FieldValidationError("category-name", "分类名称需为 1 至 20 个字符");
      if (bookCategories(book).some(c => c.id !== id && c.kind === kind && c.name.normalize("NFKC").toLowerCase() === name.trim().normalize("NFKC").toLowerCase())) throw new FieldValidationError("category-name", "已有同名分类，请修改名称或恢复已停用的分类");
      await onCommand({ type: "category.save", category: { id, name: name.trim(), kind, icon, tone } }); }
    catch (error) { reject(error); }
  }
  return <form onSubmit={submit} className="category-editor"><FieldGroup>
    <Button type="button" variant="ghost" className="category-back" disabled={saving} onClick={() => discard(onBack)}><ArrowLeft data-icon="inline-start" />返回分类列表</Button>
    <div className="category-editor-preview"><CategoryIcon category={{ id, name, kind, icon, tone, preset: false, archived: false, order: 0 }} /><div><strong>{name || "新的分类"}</strong><span>{kind === "expense" ? "支出分类" : "收入分类"}</span></div></div>
    <Field data-invalid={!!fields["category-name"]}><FieldLabel htmlFor="category-name">分类名称</FieldLabel><Input id="category-name" placeholder={kind === "expense" ? "例如：宠物、学习、旅行" : "例如：兼职、租金"} value={name} onChange={(e) => { setName(e.target.value); clear("category-name"); }} required maxLength={20} aria-invalid={!!fields["category-name"]} aria-describedby={fields["category-name"] ? "category-name-error" : undefined} autoFocus />{fields["category-name"] && <FieldError id="category-name-error">{fields["category-name"]}</FieldError>}</Field>
    <Field><FieldLabel>选择图标</FieldLabel><ToggleGroup aria-label="分类图标" value={[icon]} onValueChange={(v) => { if (v[0]) setIcon(v[0] as Category["icon"]); }} className="category-icon-picker">{categoryIconNames.map((name, index) => { const Icon = categoryIcons[name]; return <ToggleGroupItem key={name} value={name} aria-label={iconLabels[index]}><Icon /></ToggleGroupItem>; })}</ToggleGroup></Field>
    <Field><FieldLabel>选择颜色</FieldLabel><ToggleGroup aria-label="分类颜色" value={[tone]} onValueChange={(v) => { if (v[0]) setTone(v[0] as Category["tone"]); }} className="category-tone-picker">{categoryTones.map((color, index) => <ToggleGroupItem key={color} value={color} aria-label={toneLabels[index]}><span className={cn("category-color-swatch", `tone-${color}`)} />{tone === color && <Check />}</ToggleGroupItem>)}</ToggleGroup></Field>
    {error && <FieldError>{error}</FieldError>}
    <Button size="lg" type="submit" disabled={saving}><Check data-icon="inline-start" />{saving ? "正在保存…" : "保存分类"}</Button>
    {category && (category.preset ? <p className="category-manager-footnote">这是预设分类，会一直保留。不常使用时，可以在列表中停用。</p> : used ? <p className="category-manager-footnote">这个分类已用于历史账目，可以重命名或停用，历史记录会保留。</p> : <><Button type="button" variant="ghost" disabled={saving} onClick={() => setConfirmDelete(true)}><Trash2 data-icon="inline-start" />删除这个分类</Button><ConfirmAction open={confirmDelete} title="删除这个分类？" description={`「${category.name}」没有关联账目，删除后无法恢复。`} confirmLabel="删除分类" onCancel={() => setConfirmDelete(false)} onConfirm={async () => { await onCommand({ type: "category.delete", id }); }} /></>)}
  </FieldGroup></form>;
}
