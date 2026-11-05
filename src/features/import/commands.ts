import { z } from 'zod';
import { saveTransaction, removeTransaction, type Book } from '../book/ledger';
import { sources, transactionSignature, type Source } from './types';
const rowInput = z.object({
  kind: z.enum(['expense','income','transfer','repayment']), amount: z.number().int().positive().max(99999999999), date: z.iso.date(),
  category: z.string().min(1).max(80), from: z.string().max(80), to: z.string().max(80), note: z.string().max(200), reimbursable: z.literal(false),
});
export const commitSchema = z.object({ type: z.literal('import.commit'), id: z.uuid(), source: z.enum(sources), filename: z.string().min(1).max(200), rows: z.array(z.object({ key: z.string().min(1).max(500), sourceAccount: z.string().max(80), id: z.uuid(), input: rowInput })).min(1).max(500) });
export const rollbackSchema = z.object({ type: z.literal('import.rollback'), id: z.uuid() });
export type ImportCommand = z.infer<typeof commitSchema> | z.infer<typeof rollbackSchema>;
export function receiptKey(source: Source, key: string, account: string) { return source.startsWith('cmb') ? `${account}:${key}` : key; }
export function applyImport(book: Book, command: ImportCommand): Book {
  const batches = book.imports ?? [];
  if (command.type === 'import.rollback') {
    const batch = batches.find(b => b.id === command.id);
    if (!batch || batch.rolledBack) throw new Error('这个导入批次不存在或已撤销');
    const ids = new Set(batch.items.map(i => i.transactionId));
    for (const item of batch.items) {
      const transaction = book.transactions.find(t => t.id === item.transactionId);
      if (transaction && transactionSignature(transaction) !== item.signature) throw new Error('这批账目已有手动修改，为保留修改，无法整批撤销。请逐笔处理');
    }
    if (book.transactions.some(t => t.reimbursementFor && ids.has(t.reimbursementFor))) throw new Error('这批账目已有报销关联，请先处理关联记录');
    let next = book;
    for (const id of ids) next = removeTransaction(next, id);
    return { ...next, imports: batches.map(b => b.id === batch.id ? { ...b, rolledBack: true, items: [] } : b) };
  }
  const existingBatch = batches.find(b => b.id === command.id);
  if (existingBatch) {
    if (existingBatch.rolledBack) throw new Error('该批次已撤销，请重新预览导入');
    return book; // Safe retry after an uncertain network response.
  }
  const used = new Set(batches.filter(b => !b.rolledBack && b.source === command.source).flatMap(b => b.items.map(i => i.key)));
  const ids = new Set(book.transactions.map(t => t.id));
  const items = []; let next = book;
  for (const row of command.rows) {
    const account = row.sourceAccount;
    if (command.source.startsWith('cmb') && (!book.accounts.some(a => a.id === account) || ![row.input.from, row.input.to].includes(account))) throw new Error('招行流水必须使用映射的银行账户，请核对账户选择');
    const key = receiptKey(command.source, row.key, account);
    if (used.has(key)) throw new Error('有流水已经导入，请刷新预览并排除重复记录');
    if (ids.has(row.id)) throw new Error('导入记录编号重复，请重新预览');
    used.add(key); ids.add(row.id);
    next = saveTransaction(next, row.input, row.id);
    items.push({ key, transactionId: row.id, signature: transactionSignature(next.transactions.find(t => t.id === row.id)!) });
  }
  return { ...next, imports: [...batches, { id: command.id, source: command.source, filename: command.filename, createdAt: new Date().toISOString(), rolledBack: false, items }] };
}
