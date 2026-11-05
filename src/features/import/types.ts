import type { Transaction } from '../book/ledger';
export const sources = ['wechat', 'alipay', 'cmb-debit', 'cmb-credit'] as const;
export type Source = typeof sources[number];
export const sourceNames: Record<Source, string> = { wechat: '微信支付', alipay: '支付宝', 'cmb-debit': '招行储蓄卡', 'cmb-credit': '招行信用卡' };
export type ImportBatch = { id: string; source: Source; filename: string; createdAt: string; rolledBack: boolean; items: { key: string; transactionId: string; signature: string }[] };
export type BillRow = { line: number; key: string; date: string; time: string; amount: number; direction: 'expense' | 'income' | 'neutral'; peer: string; description: string; method: string; category: string; status: string; issue: string; review: string };
export type ParsedBill = { source: Source; rows: BillRow[]; warnings: string[] };
export function transactionSignature(t: Transaction) {
  return JSON.stringify([t.kind, t.amount, t.date, t.category, t.from, t.to, t.note, t.reimbursable, t.reimbursementFor ?? '', t.entries.map(e => [e.accountId, e.amount])]);
}
