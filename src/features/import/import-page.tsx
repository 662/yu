'use client';
import { useRef, useState } from 'react';
import { Upload, Check, FileText, ArrowLeft, ArrowRight, RotateCcw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel, FieldGroup, FieldError } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { reviewGroups, reviewState, applyGroupDecision, isBulkEditable, preserveSelections, type ReviewGroup } from './review';
import { ConfirmAction } from '@/components/confirm-action';
import { toast } from '@/components/ui/toast';
import { useDraftProtection } from '../book/draft-protection';
import { Separator } from '@/components/ui/separator';
import { activeCategories } from '../book/categories';
import { createTransaction, money, type Book } from '../book/ledger';
import type { Command } from '../book/commands';
import { readBill } from './files';
import { previewRow, suggestAccount, type RowEdit, type Decision } from './preview';
import { sourceNames, sources, type ParsedBill, type Source } from './types';

function notify(title: string) { toast.add({ title, type: 'success' }); }

export function ImportPage({ book, saving, onCommand, onAddAccount }: { book: Book; saving: boolean; onCommand: (command: Command) => Promise<void>; onAddAccount: () => void }) {
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [filename, setFilename] = useState(''); const [source,setSource] = useState('auto');
  const [month,setMonth] = useState(''); const [password,setPassword] = useState('');
  const [mapping,setMapping] = useState<Record<string,string>>({}); const [edits,setEdits] = useState<Record<number,RowEdit>>({});
  const [loading,setLoading] = useState(false); const [error,setError] = useState('');
  const [group,setGroup] = useState<ReviewGroup>('ordinary');
  const [bulkDecision,setBulkDecision] = useState<Decision>('skip');
  const [methodFilter,setMethodFilter] = useState(''); const [categoryFilter,setCategoryFilter] = useState('');
  const [bulkFrom,setBulkFrom] = useState(''); const [bulkTo,setBulkTo] = useState('');
  const [done,setDone] = useState<number[]>([]);
  const [step,setStep] = useState('1');
  const [page,setPage] = useState(0); const [view,setView] = useState('all'); const [confirm,setConfirm] = useState(false);
  const [rollback,setRollback] = useState(''); const [batchId,setBatchId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const busy = loading || saving;
  async function load(file?: File) {
    if (!file || busy) return;
    setLoading(true); setError(''); setConfirm(false); setStep('1');
    try {
      const parsed = await readBill(file, source === 'auto' ? undefined : source as Source, month, password);
      setMethodFilter('');setCategoryFilter('');setDone([]);setGroup('ordinary');setBulkDecision('skip');setBulkFrom('');setBulkTo('');setBill(parsed); setFilename(file.name.slice(0,200)); setEdits({}); setPage(0); setView('all'); setBatchId(crypto.randomUUID());
      setMapping(Object.fromEntries([...new Set(parsed.rows.map(r => r.method))].map(method => [method, suggestAccount(book, method, parsed.source)])));
      setPassword('');
    } catch (e) { setError(e instanceof Error ? e.message : '无法读取文件，请重新导出账单'); }
    finally { setLoading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  const seen = new Set<string>();
  const previews = bill?.rows.map((row,index) => {
    const preview = previewRow(book, bill.source, row, mapping, edits[index], seen); seen.add(preview.key);
    let validation = '';
    if (preview.input) { try { createTransaction(book, preview.input, 'preview'); } catch (e) { validation = (e as Error).message; } }
    return { row, index, ...preview, validation };
  }) ?? [];
  const remaining = previews.filter(p => !done.includes(p.index));
  const selected = remaining.filter(p => p.input); const invalid = selected.filter(p => p.validation);
  const pending = remaining.filter(p => reviewState(p, edits[p.index]) === 'pending');
  const skipped = remaining.filter(p => reviewState(p, edits[p.index]) === 'skipped');
  const blocked = remaining.filter(p => p.blocked);
  const discardPreview = useDraftProtection("import", !!bill && remaining.length > 0);
  const allGroupRows = remaining.filter(p => p.group === group);
  const groupRows = allGroupRows.filter(p => (!methodFilter || p.row.method === methodFilter) && (!categoryFilter || p.row.category === categoryFilter));
  const bulkRows = groupRows.filter(p => !p.blocked && isBulkEditable(edits[p.index]));
  const visible = (view === 'invalid' ? invalid : groupRows.filter(p => view === 'all' || reviewState(p, edits[p.index]) === view));
  const batch = selected.slice(0,500);
  const bulkActions: {value: Decision; label: string}[] = group === 'ordinary' || group === 'duplicate'
    ? [{value:'auto',label:'按原收支保留'}, {value:'skip',label:'跳过'}, {value:'expense',label:'记为支出'}, {value:'income',label:'记为收入'}]
    : group === 'refund' ? [{value:'skip',label:'暂不导入'}, {value:'income',label:'记为收入'}]
    : [{value:'skip',label:'跳过'}, {value:group === 'repayment' ? 'repayment' : 'transfer',label:group === 'repayment' ? '记为还款' : '记为转账'}];
  function applyBulk() {
    setEdits(prev => applyGroupDecision(groupRows, prev, bulkDecision, bulkFrom, bulkTo));
    setConfirm(false);setError('');
  }
  const pages = Math.max(1,Math.ceil(visible.length/20)); const currentPage = Math.min(page,pages-1);
  const patch = (index: number, edit: RowEdit) => { setEdits(prev => ({...prev,[index]:{...prev[index],...edit,bulk:false}})); setConfirm(false); setError(''); };
  const accounts = book.accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>);
  function showInvalid() {
    setStep('2');
    setView('invalid');
    setPage(0);
    requestAnimationFrame(() => {
      rowsRef.current?.focus({ preventScroll: true });
      rowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  async function commit() {
    if (!bill || busy || !selected.length || invalid.length) return;
    if (!confirm) { setConfirm(true); return; }
    setError('');
    try {
      await onCommand({type:'import.commit',id:batchId,source:bill.source,filename,rows:batch.map(p => ({key:p.row.key,sourceAccount:mapping[p.row.method] ?? '',id:crypto.randomUUID(),input:p.input! as Extract<Command,{type:'import.commit'}>['rows'][number]['input']}))});
      setEdits(prev => preserveSelections(selected.slice(500), prev));
      setDone(prev => [...prev,...batch.map(p => p.index)]);setBatchId(crypto.randomUUID());setConfirm(false);notify(`已导入 ${batch.length} 笔，账户余额已更新。剩余记录仍在预览中，可继续处理或结束。`);
    } catch(e) { setConfirm(false);setError(e instanceof Error ? e.message : '导入失败，请重试'); }
  }
  return <section className="import-page" aria-label="账单导入">
    {!bill ? <>
      <div className="import-intro"><span className="import-file-icon"><Upload /></span><h3>让过去的记录，也有着落</h3><p>选择导出的账单文件，接下来一起确认账户和分类。</p><Button size="lg" disabled={busy || !book.accounts.length} onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" />{loading ? '正在读取账单…' : '选择账单文件'}</Button><small>CSV / TXT / XLS / XLSX / 招行 PDF · 最大 10 MB</small>{!book.accounts.length && <p role="alert">请先在「账户」中添加银行卡或平台余额，再导入账单。</p>}{!book.accounts.length && <Button variant="outline" onClick={onAddAccount}><Plus data-icon="inline-start" />添加账户</Button>}</div>
      <FieldGroup className="import-file-options"><Field><FieldLabel htmlFor="import-source">账单来源</FieldLabel><NativeSelect id="import-source" value={source} onChange={e=>setSource(e.target.value)} disabled={busy}><NativeSelectOption value="auto">自动识别</NativeSelectOption>{sources.map(s=><NativeSelectOption key={s} value={s}>{sourceNames[s]}</NativeSelectOption>)}</NativeSelect></Field><details className="import-advanced"><summary>PDF 密码与账单月份（选填）</summary><FieldGroup><Field><FieldLabel htmlFor="import-month">信用卡账单月份（缺少年份时填写）</FieldLabel><Input id="import-month" type="month" value={month} onChange={e=>setMonth(e.target.value)} disabled={busy}/></Field><Field><FieldLabel htmlFor="import-password">PDF 密码（如有）</FieldLabel><Input id="import-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></Field></FieldGroup></details></FieldGroup>
      <details className="import-help"><summary>怎样获取账单？</summary><p>微信：我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 用于个人对账。支付宝：我的 → 账单 → 右上角菜单 → 开具交易流水证明 → 用于个人对账。</p><p>招行储蓄卡：App 搜索「流水打印」，导出包含交易摘要和对手信息的文字版 PDF。信用卡：掌上生活搜索「账单补寄」，下载信用卡对账单。也支持社区转换器生成的 CSV。ZIP 先解压，扫描件暂不支持。</p><p>文件和 PDF 密码在浏览器中读取，确认前不会上传账单；只保存你确认的账目及去重标识。</p></details>
    </> : <>
      <div className="import-preview-heading"><div><Badge variant="secondary">{sourceNames[bill.source]}</Badge><strong>{filename}</strong><span>识别 {previews.length} 笔 · 已导入 {done.length} 笔 · 已选 {selected.length} 笔 · 尚未决定 {pending.length} 笔 · 主动跳过 {skipped.length} 笔 · 无法导入 {blocked.length} 笔</span></div><Button variant="ghost" disabled={busy} onClick={()=>discardPreview(()=>{setBill(null);setConfirm(false);setError('');})}>重新选文件</Button></div>
      <ToggleGroup className="import-steps" aria-label="导入步骤" value={[step]} onValueChange={v => { if (v[0]) { setStep(v[0]); setConfirm(false); } }} disabled={busy}>
        <ToggleGroupItem value="1">1 · 支付账户</ToggleGroupItem><ToggleGroupItem value="2">2 · 核对账目</ToggleGroupItem><ToggleGroupItem value="3">3 · 确认入账</ToggleGroupItem>
      </ToggleGroup>
      {bill.warnings.map(w=><p className="form-hint" key={w}>{w}</p>)}
      <section className="import-mappings" hidden={step !== '1'}><h3>1 · 确认支付账户</h3><p>银行卡付款选对应银行卡，零钱和余额选平台账户。不会自动创建或合并账户。</p><FieldGroup>{[...new Set(bill.rows.map(r=>r.method))].map((method,i)=><Field key={method}><FieldLabel htmlFor={`import-map-${i}`}>{method}</FieldLabel><NativeSelect id={`import-map-${i}`} value={mapping[method] ?? ''} disabled={busy} onChange={e=>{setMapping(m=>({...m,[method]:e.target.value}));setConfirm(false);}}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>)}</FieldGroup><div className="import-step-actions"><Button disabled={busy} onClick={() => setStep('2')}>下一步：核对账目<ArrowRight data-icon="inline-end" /></Button></div></section>
      <div hidden={step !== '2'} className="import-review-stage"><section className="import-review" aria-label="按原因批量处理">
        <h3>2 · 按组处理，不必逐笔翻找</h3>
        <ToggleGroup className="flex-wrap" variant="outline" value={[group]} onValueChange={v=>{if(v[0]){setGroup(v[0] as ReviewGroup);setMethodFilter('');setCategoryFilter('');setView('all');setPage(0);setBulkDecision('skip');setBulkFrom('');setBulkTo('');}}} aria-label="账单分组" disabled={busy}>
          {Object.entries(reviewGroups).map(([key,info])=><ToggleGroupItem key={key} value={key}>{info.title} · {remaining.filter(p=>p.group===key).length}</ToggleGroupItem>)}
        </ToggleGroup>
        <p>{reviewGroups[group].description}</p>
        <FieldGroup className="import-bulk-accounts">
          <Field><FieldLabel htmlFor="group-method">缩小范围：支付方式</FieldLabel><NativeSelect id="group-method" value={methodFilter} disabled={busy} onChange={e=>{setMethodFilter(e.target.value);setPage(0);}}><NativeSelectOption value="">所有支付方式</NativeSelectOption>{[...new Set(allGroupRows.map(p=>p.row.method))].map(method=><NativeSelectOption key={method} value={method}>{method}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="group-category">原始交易分类</FieldLabel><NativeSelect id="group-category" value={categoryFilter} disabled={busy} onChange={e=>{setCategoryFilter(e.target.value);setPage(0);}}><NativeSelectOption value="">所有原始分类</NativeSelectOption>{[...new Set(allGroupRows.map(p=>p.row.category))].filter(Boolean).map(category=><NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}</NativeSelect></Field>
        </FieldGroup>
        <p>当前范围 {groupRows.length} 笔，合计 ¥{money(groupRows.reduce((n,p)=>n+p.row.amount,0))}（交易金额合计，不代表净收支）。</p>
        {group !== 'blocked' && <>
          <p>当前范围可批量设置 {bulkRows.length} 笔。可重复调整批量设置；已单独设置的记录会保留。应用范围包含当前支付方式和原始分类下的所有页，不受下方状态筛选影响。</p>
          <ToggleGroup className="flex-wrap" variant="outline" value={[bulkDecision]} onValueChange={v=>{if(v[0])setBulkDecision(v[0] as Decision);}} aria-label="本组批量记账方式" disabled={busy}>
            {bulkActions.map(a=><ToggleGroupItem key={a.value} value={a.value}>{a.label}</ToggleGroupItem>)}
          </ToggleGroup>
          {(bulkDecision==='transfer'||bulkDecision==='repayment') && <FieldGroup className="import-bulk-accounts">
            <Field><FieldLabel htmlFor="bulk-from">统一付款账户</FieldLabel><NativeSelect id="bulk-from" value={bulkFrom} disabled={busy} onChange={e=>setBulkFrom(e.target.value)}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="bulk-to">统一收款账户{bulkDecision==='repayment'?'（信用卡）':''}</FieldLabel><NativeSelect id="bulk-to" value={bulkTo} disabled={busy} onChange={e=>setBulkTo(e.target.value)}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>
          </FieldGroup>}
          <Button variant="outline" disabled={busy||!bulkRows.length||((bulkDecision==='transfer'||bulkDecision==='repayment')&&(!bulkFrom||!bulkTo||bulkFrom===bulkTo))} onClick={applyBulk}>应用到当前范围 {bulkRows.length} 笔</Button>
        </>}
      </section>
      <ToggleGroup className="flex-wrap" variant="outline" value={[view]} onValueChange={v=>{if(v[0]){setView(v[0]);setPage(0);}}} aria-label="筛选导入明细">
        <ToggleGroupItem value="all">本组全部 · {groupRows.length}</ToggleGroupItem>
        <ToggleGroupItem value="pending">尚未决定 · {groupRows.filter(p=>reviewState(p,edits[p.index])==='pending').length}</ToggleGroupItem>
        <ToggleGroupItem value="selected">已选入账 · {groupRows.filter(p=>p.input).length}</ToggleGroupItem>
        <ToggleGroupItem value="skipped">主动跳过 · {groupRows.filter(p=>reviewState(p,edits[p.index])==='skipped').length}</ToggleGroupItem>
        <ToggleGroupItem value="invalid">全部需补全 · {invalid.length}</ToggleGroupItem>
      </ToggleGroup>
      <div className="import-rows" ref={rowsRef} tabIndex={-1} aria-label="导入明细">{view === 'invalid' && <p className="form-hint">这里显示所有分组中需要补全的已选记录，不受上方范围筛选影响。</p>}{!visible.length && <Empty><EmptyHeader><EmptyTitle>当前没有记录</EmptyTitle><EmptyDescription>可切换其他分组或筛选项继续处理。</EmptyDescription></EmptyHeader></Empty>}{visible.slice(currentPage*20,currentPage*20+20).map(p=><article className="import-row" key={p.index}>
        <div className="import-row-title"><div><strong>{p.row.peer || p.row.description || '未注明交易对方'}</strong><span>{p.row.time.startsWith(p.row.date) ? p.row.time : `${p.row.date}（原始 ${p.row.time}）`} · 原始第 {p.row.line} 行</span></div><strong>¥{money(p.row.amount)}</strong></div>
        <p className="import-row-description">{p.row.description || p.row.category} · {p.row.direction==='income'?'平台收入':p.row.direction==='expense'?'平台支出':'平台不计收支'} · {p.row.method} {p.row.status && `· ${p.row.status}`}</p>
        <Badge variant="secondary">{p.blocked?'无法导入':p.validation?'需补全':p.input?'已选入账':edits[p.index]?.decision==='skip'?'主动跳过':'尚未决定'}</Badge>
        {p.reason && <p className="import-row-warning">{p.reason}</p>}
        <FieldGroup className="import-row-fields"><Field><FieldLabel htmlFor={`import-action-${p.index}`}>如何记账</FieldLabel><NativeSelect id={`import-action-${p.index}`} value={edits[p.index]?.decision ?? 'auto'} disabled={busy || p.blocked} onChange={e=>patch(p.index,{decision:e.target.value as Decision,category:undefined,from:undefined,to:undefined})}><NativeSelectOption value="auto">{p.blocked?'不可导入':p.kind === 'skip'?'自动：尚未决定':'自动：'+(p.kind==='income'?'收入':'支出')}</NativeSelectOption><NativeSelectOption value="skip">跳过</NativeSelectOption><NativeSelectOption value="expense">支出</NativeSelectOption><NativeSelectOption value="income">收入</NativeSelectOption><NativeSelectOption value="transfer">账户转账</NativeSelectOption><NativeSelectOption value="repayment">信用卡还款</NativeSelectOption></NativeSelect></Field>
          {p.input && (p.input.kind==='expense' || p.input.kind==='income') && <Field><FieldLabel htmlFor={`import-category-${p.index}`}>分类</FieldLabel><NativeSelect id={`import-category-${p.index}`} value={p.input.category} disabled={busy} onChange={e=>patch(p.index,{category:e.target.value})}>{activeCategories(book,p.input.kind).map(c=><NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></Field>}
          {p.input && <>{p.input.kind!=='income' && <Field><FieldLabel htmlFor={`import-from-${p.index}`}>付款账户</FieldLabel><NativeSelect id={`import-from-${p.index}`} value={p.input.from} disabled={busy} onChange={e=>patch(p.index,{from:e.target.value})}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>}{p.input.kind!=='expense' && <Field><FieldLabel htmlFor={`import-to-${p.index}`}>收款账户</FieldLabel><NativeSelect id={`import-to-${p.index}`} value={p.input.to} disabled={busy} onChange={e=>patch(p.index,{to:e.target.value})}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>}</>}
        </FieldGroup>{p.validation && <FieldError>{p.validation}</FieldError>}
      </article>)}</div>
      <div className="import-pagination"><span>第 {currentPage+1} / {pages} 页 · {visible.length} 笔</span><Button variant="ghost" size="sm" aria-label="上一页账单" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}><ArrowLeft /></Button><Button variant="ghost" size="sm" aria-label="下一页账单" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}><ArrowRight /></Button></div>
      <div className="import-progress"><span>已选 {selected.length} 笔 · 尚未决定 {pending.length} 笔 · 需补全 {invalid.length} 笔</span><Button disabled={busy} onClick={() => setStep('3')}>下一步：确认入账<ArrowRight data-icon="inline-end" /></Button></div>
      </div>
      <div className="import-confirm" hidden={step !== '3'}>
        <h3>3 · 核对本批入账</h3><Button variant="ghost" disabled={busy} onClick={() => setStep('2')}><ArrowLeft data-icon="inline-start" />返回核对账目</Button>
        <p>已选 <strong>{selected.length}</strong> 笔，本次将新增 <strong>{batch.length}</strong> 笔，支出 ¥{money(batch.filter(p=>p.input?.kind==='expense').reduce((n,p)=>n+p.row.amount,0))}，收入 ¥{money(batch.filter(p=>p.input?.kind==='income').reduce((n,p)=>n+p.row.amount,0))}。转账与还款不计收支。</p>
        <p>尚未决定 {pending.length} 笔、主动跳过 {skipped.length} 笔、无法导入 {blocked.length} 笔，均不会在本次入账。</p>
        {invalid.length>0 && <div><p role="alert">已选记录中还有 {invalid.length} 笔需补全账户或分类。</p><Button variant="outline" size="sm" disabled={busy} onClick={showInvalid}>查看这 {invalid.length} 笔</Button></div>}
        {selected.length>500 && <p>每次最多导入 500 笔，剩余 {selected.length-batch.length} 笔保留在当前预览，下次继续确认。</p>}
        {confirm && <p>本次只导入上面列出的 {batch.length} 笔，并更新账户余额。其他记录仍留在预览。若期初余额使用了今天的余额，导入历史流水后请核对余额。</p>}
        <Button size="lg" disabled={busy||!selected.length||!!invalid.length} onClick={()=>void commit()}><Check data-icon="inline-start" />{saving?'正在入账…':confirm?`确认导入本批 ${batch.length} 笔`:'核对本批并准备入账'}</Button>
        <Button variant="ghost" disabled={busy} onClick={()=>discardPreview(()=>{setBill(null);setConfirm(false);})}>结束预览（未入账记录不保存）</Button>
      </div>
    </>}
    <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx,.pdf" className="sr-only" aria-label="账单文件" disabled={busy} onChange={e=>void load(e.target.files?.[0])}/>
    {error && <FieldError>{error}</FieldError>}
    <ConfirmAction open={!!rollback} title="撤销这批导入？" description={`将移除「${book.imports?.find(batch => batch.id === rollback)?.filename ?? ''}」中的 ${book.imports?.find(batch => batch.id === rollback)?.items.length ?? 0} 笔导入记录并重新计算账户余额。已有手动修改或关联报销时将阻止整批撤销。`} confirmLabel="撤销这批导入" onCancel={()=>setRollback('')} onConfirm={async()=>{await onCommand({type:'import.rollback',id:rollback});setRollback('');notify('这批导入已撤销，账户余额已恢复');}} />
    {!bill && !!book.imports?.length && <><Separator /><section className="import-history"><h3>导入记录</h3>{[...book.imports].reverse().slice(0,20).map(batch=><div className="import-history-row" key={batch.id}><FileText /><div><strong>{batch.filename}</strong><span>{sourceNames[batch.source]} · {new Date(batch.createdAt).toLocaleString('zh-CN')} · {batch.rolledBack?'已撤销':`${batch.items.length} 笔`}</span></div>{!batch.rolledBack && <Button variant="ghost" size="sm" disabled={busy} onClick={()=>setRollback(batch.id)}><RotateCcw data-icon="inline-start" />撤销</Button>}</div>)}<p className="form-hint">整批撤销会移除该批账目；已有手动修改或关联报销时，请逐笔处理。</p></section></>}
  </section>;
}
