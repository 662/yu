'use client';
import { useRef, useState } from 'react';
import { Upload, Check, FileText, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel, FieldGroup, FieldError } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { activeCategories } from '../book/categories';
import { createTransaction, money, type Book } from '../book/ledger';
import type { Command } from '../book/commands';
import { readBill } from './files';
import { previewRow, suggestAccount, type RowEdit, type Decision } from './preview';
import { sourceNames, sources, type ParsedBill, type Source } from './types';

export function ImportPage({ book, saving, onCommand }: { book: Book; saving: boolean; onCommand: (command: Command) => Promise<void> }) {
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [filename, setFilename] = useState(''); const [source,setSource] = useState('auto');
  const [month,setMonth] = useState(''); const [password,setPassword] = useState('');
  const [mapping,setMapping] = useState<Record<string,string>>({}); const [edits,setEdits] = useState<Record<number,RowEdit>>({});
  const [loading,setLoading] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  const [page,setPage] = useState(0); const [view,setView] = useState('all'); const [confirm,setConfirm] = useState(false);
  const [rollback,setRollback] = useState(''); const [batchId,setBatchId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const busy = loading || saving;
  async function load(file?: File) {
    if (!file || busy) return;
    setLoading(true); setError(''); setNotice(''); setConfirm(false);
    try {
      const parsed = await readBill(file, source === 'auto' ? undefined : source as Source, month, password);
      setBill(parsed); setFilename(file.name.slice(0,200)); setEdits({}); setPage(0); setView('all'); setBatchId(crypto.randomUUID());
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
  const selected = previews.filter(p => p.input); const invalid = selected.filter(p => p.validation);
  const visible = previews.filter(p => view === 'all' || (view === 'invalid' ? p.validation : view === 'selected' ? p.input : p.reason || p.validation));
  const pages = Math.max(1,Math.ceil(visible.length/20)); const currentPage = Math.min(page,pages-1);
  const patch = (index: number, edit: RowEdit) => { setEdits(prev => ({...prev,[index]:{...prev[index],...edit}})); setConfirm(false); setError(''); };
  const accounts = book.accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>);
  function showInvalid() {
    setView('invalid');
    setPage(0);
    requestAnimationFrame(() => {
      rowsRef.current?.focus({ preventScroll: true });
      rowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  async function commit() {
    if (!bill || busy || !selected.length || invalid.length || selected.length > 500) return;
    if (!confirm) { setConfirm(true); return; }
    setError('');
    try {
      await onCommand({type:'import.commit',id:batchId,source:bill.source,filename,rows:selected.map(p => ({key:p.row.key,sourceAccount:mapping[p.row.method] ?? '',id:crypto.randomUUID(),input:p.input! as Extract<Command,{type:'import.commit'}>['rows'][number]['input']}))});
      setBill(null);setConfirm(false);setNotice(`已导入 ${selected.length} 笔账目，账户余额已同步更新`);
    } catch(e) { setConfirm(false);setError(e instanceof Error ? e.message : '导入失败，请重试'); }
  }
  return <section className="import-page" aria-label="账单导入">
    {!bill ? <>
      <div className="import-intro"><span className="import-file-icon"><Upload /></span><h3>让过去的记录，也有着落</h3><p>选择导出的账单文件，接下来一起确认账户和分类。</p><Button size="lg" disabled={busy || !book.accounts.length} onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" />{loading ? '正在读取账单…' : '选择账单文件'}</Button><small>CSV / TXT / XLS / XLSX / 招行 PDF · 最大 10 MB</small>{!book.accounts.length && <p role="alert">请先在「账户」中添加银行卡或平台余额，再导入账单。</p>}</div>
      <FieldGroup className="import-file-options"><Field><FieldLabel htmlFor="import-source">账单来源</FieldLabel><NativeSelect id="import-source" value={source} onChange={e=>setSource(e.target.value)} disabled={busy}><NativeSelectOption value="auto">自动识别</NativeSelectOption>{sources.map(s=><NativeSelectOption key={s} value={s}>{sourceNames[s]}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="import-month">信用卡账单月份（缺少年份时填写）</FieldLabel><Input id="import-month" type="month" value={month} onChange={e=>setMonth(e.target.value)} disabled={busy}/></Field><Field><FieldLabel htmlFor="import-password">PDF 密码（如有）</FieldLabel><Input id="import-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></Field></FieldGroup>
      <details className="import-help"><summary>怎样获取账单？</summary><p>微信：我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 用于个人对账。支付宝：我的 → 账单 → 右上角菜单 → 开具交易流水证明 → 用于个人对账。</p><p>招行储蓄卡：App 搜索「流水打印」，导出包含交易摘要和对手信息的文字版 PDF。信用卡：掌上生活搜索「账单补寄」，下载信用卡对账单。也支持社区转换器生成的 CSV。ZIP 先解压，扫描件暂不支持。</p><p>文件和 PDF 密码在浏览器中读取，确认前不会上传账单；只保存你确认的账目及去重标识。</p></details>
    </> : <>
      <div className="import-preview-heading"><div><Badge variant="secondary">{sourceNames[bill.source]}</Badge><strong>{filename}</strong><span>识别 {previews.length} 笔 · 待入账 {selected.length} 笔 · 待核对 {previews.filter(p=>p.reason || p.validation).length} 笔</span></div><Button variant="ghost" disabled={busy} onClick={()=>{setBill(null);setConfirm(false);setError('');}}>重新选文件</Button></div>
      {bill.warnings.map(w=><p className="form-hint" key={w}>{w}</p>)}
      <section className="import-mappings"><h3>这些钱，来自哪个账户？</h3><p>银行卡付款选对应银行卡，零钱和余额选平台账户。不会自动创建或合并账户。</p><FieldGroup>{[...new Set(bill.rows.map(r=>r.method))].map((method,i)=><Field key={method}><FieldLabel htmlFor={`import-map-${i}`}>{method}</FieldLabel><NativeSelect id={`import-map-${i}`} value={mapping[method] ?? ''} disabled={busy} onChange={e=>{setMapping(m=>({...m,[method]:e.target.value}));setConfirm(false);}}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>)}</FieldGroup></section>
      <div className="import-toolbar"><NativeSelect aria-label="筛选导入明细" value={view} onChange={e=>{setView(e.target.value);setPage(0);}}><NativeSelectOption value="all">全部明细</NativeSelectOption><NativeSelectOption value="review">需要核对</NativeSelectOption><NativeSelectOption value="selected">已选入账</NativeSelectOption><NativeSelectOption value="invalid">无法入账（{invalid.length} 笔）</NativeSelectOption></NativeSelect><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{setEdits(Object.fromEntries(bill.rows.map((_,i)=>[i,{...edits[i],decision:'skip'}])));setConfirm(false);}}>全部跳过</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>{let count=0;const next:Record<number,RowEdit>={};for(const p of previews){next[p.index]={...edits[p.index],decision:!p.reason && count++<500?'auto':'skip'};}setEdits(next);setConfirm(false);}}>选择普通收支（最多500笔）</Button></div>
      <div className="import-rows" ref={rowsRef} tabIndex={-1} aria-label="导入明细">{view === 'invalid' && !invalid.length && <p role="status">已没有无法入账的记录，可切换到「已选入账」继续检查。</p>}{visible.slice(currentPage*20,currentPage*20+20).map(p=><article className="import-row" key={p.index}>
        <div className="import-row-title"><div><strong>{p.row.peer || p.row.description || '未注明交易对方'}</strong><span>{p.row.time.startsWith(p.row.date) ? p.row.time : `${p.row.date}（原始 ${p.row.time}）`} · 原始第 {p.row.line} 行</span></div><strong>¥{money(p.row.amount)}</strong></div>
        <p className="import-row-description">{p.row.description || p.row.category} · {p.row.direction==='income'?'平台收入':p.row.direction==='expense'?'平台支出':'平台不计收支'} · {p.row.method} {p.row.status && `· ${p.row.status}`}</p>
        {p.reason && <p className="import-row-warning">{p.reason}</p>}
        <FieldGroup className="import-row-fields"><Field><FieldLabel htmlFor={`import-action-${p.index}`}>如何记账</FieldLabel><NativeSelect id={`import-action-${p.index}`} value={edits[p.index]?.decision ?? 'auto'} disabled={busy || p.blocked} onChange={e=>patch(p.index,{decision:e.target.value as Decision,category:undefined,from:undefined,to:undefined})}><NativeSelectOption value="auto">{p.kind === 'skip'?'自动：暂不导入':'自动：'+(p.kind==='income'?'收入':'支出')}</NativeSelectOption><NativeSelectOption value="skip">跳过</NativeSelectOption><NativeSelectOption value="expense">支出</NativeSelectOption><NativeSelectOption value="income">收入</NativeSelectOption><NativeSelectOption value="transfer">账户转账</NativeSelectOption><NativeSelectOption value="repayment">信用卡还款</NativeSelectOption></NativeSelect></Field>
          {p.input && (p.input.kind==='expense' || p.input.kind==='income') && <Field><FieldLabel htmlFor={`import-category-${p.index}`}>分类</FieldLabel><NativeSelect id={`import-category-${p.index}`} value={p.input.category} disabled={busy} onChange={e=>patch(p.index,{category:e.target.value})}>{activeCategories(book,p.input.kind).map(c=><NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></Field>}
          {p.input && <>{p.input.kind!=='income' && <Field><FieldLabel htmlFor={`import-from-${p.index}`}>付款账户</FieldLabel><NativeSelect id={`import-from-${p.index}`} value={p.input.from} disabled={busy} onChange={e=>patch(p.index,{from:e.target.value})}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>}{p.input.kind!=='expense' && <Field><FieldLabel htmlFor={`import-to-${p.index}`}>收款账户</FieldLabel><NativeSelect id={`import-to-${p.index}`} value={p.input.to} disabled={busy} onChange={e=>patch(p.index,{to:e.target.value})}><NativeSelectOption value="">请选择账户</NativeSelectOption>{accounts}</NativeSelect></Field>}</>}
        </FieldGroup>{p.validation && <FieldError>{p.validation}</FieldError>}
      </article>)}</div>
      <div className="import-pagination"><span>第 {currentPage+1} / {pages} 页 · {visible.length} 笔</span><Button variant="ghost" size="sm" aria-label="上一页账单" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}><ArrowLeft /></Button><Button variant="ghost" size="sm" aria-label="下一页账单" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}><ArrowRight /></Button></div>
      <div className="import-confirm"><p>将新增 <strong>{selected.length}</strong> 笔，支出 ¥{money(selected.filter(p=>p.input?.kind==='expense').reduce((n,p)=>n+p.row.amount,0))}，收入 ¥{money(selected.filter(p=>p.input?.kind==='income').reduce((n,p)=>n+p.row.amount,0))}。转账与还款不计收支。</p>{invalid.length>0 && <div><p role="alert">还有 {invalid.length} 笔无法入账，请查看明细中的具体原因。</p><Button variant="outline" size="sm" disabled={busy} onClick={showInvalid}>查看这 {invalid.length} 笔</Button></div>}{selected.length>500 && <p role="alert">单次最多 500 笔，请使用上方「选择普通收支」或分批导出。</p>}{confirm && <p>确认后会更新账户余额。若期初余额使用了今天的余额，导入历史流水后请核对账户余额。</p>}<Button size="lg" disabled={busy || !selected.length || !!invalid.length || selected.length>500} onClick={()=>void commit()}><Check data-icon="inline-start" />{saving?'正在入账…':confirm?`确认导入 ${selected.length} 笔`:'检查并准备入账'}</Button></div>
    </>}
    <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx,.pdf" className="sr-only" aria-label="账单文件" disabled={busy} onChange={e=>void load(e.target.files?.[0])}/>
    {error && <FieldError>{error}</FieldError>}{notice && <p role="status" className="category-notice"><Check />{notice}</p>}
    {!bill && !!book.imports?.length && <><Separator /><section className="import-history"><h3>导入记录</h3>{[...book.imports].reverse().slice(0,20).map(batch=><div className="import-history-row" key={batch.id}><FileText /><div><strong>{batch.filename}</strong><span>{sourceNames[batch.source]} · {new Date(batch.createdAt).toLocaleString('zh-CN')} · {batch.rolledBack?'已撤销':`${batch.items.length} 笔`}</span></div>{!batch.rolledBack && <Button variant={rollback===batch.id?'destructive':'ghost'} size="sm" disabled={busy} onClick={async()=>{if(rollback!==batch.id){setRollback(batch.id);return;}setError('');try{await onCommand({type:'import.rollback',id:batch.id});setRollback('');setNotice('这批导入已撤销，账户余额已恢复');}catch(e){setError((e as Error).message);}}}><RotateCcw data-icon="inline-start" />{rollback===batch.id?'确认撤销':'撤销'}</Button>}</div>)}<p className="form-hint">整批撤销会移除该批账目；已有手动修改或关联报销时，请逐笔处理。</p></section></>}
  </section>;
}
