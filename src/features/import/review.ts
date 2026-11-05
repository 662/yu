import type { TransactionInput } from '../book/ledger';
import type { BillRow } from './types';
import type { Decision, RowEdit } from './preview';

export const reviewGroups = {
  ordinary: { title: '普通收支', description: '已按账单方向选择入账，检查账户和分类即可。' },
  refund: { title: '退款与冲正', description: '不会自动冲减原消费。可暂不导入并修正原账；记为收入会增加收入统计。' },
  movement: { title: '资金往来', description: '含充值、提现、理财及平台不计收支记录。确认是自己的账户间流动后，可批量记为转账；对手账户不同请分别处理。' },
  repayment: { title: '信用卡还款', description: '选择实际付款账户和信用卡，不计入收入或支出。' },
  duplicate: { title: '疑似重复', description: '可能已从其他账单或手工记账。确认确实是不同交易后再保留。' },
  blocked: { title: '无法导入', description: '已导入、文件内重复、未完成交易或格式错误，均不允许选择；可查看每笔具体原因。' },
} as const;
export type ReviewGroup = keyof typeof reviewGroups;
export function classifyRow(row: BillRow, blocked: boolean, similar: boolean): ReviewGroup {
  if (blocked) return 'blocked';
  if (similar || /重复/.test(row.review)) return 'duplicate';
  if (/退款|冲正/.test(row.review)) return 'refund';
  if (/还款/.test(row.review)) return 'repayment';
  if (row.review || row.direction === 'neutral') return 'movement';
  return 'ordinary';
}
export type ReviewState = 'selected' | 'pending' | 'skipped' | 'blocked';
export function reviewState(row: { blocked: boolean; input: unknown }, edit?: RowEdit): ReviewState {
  return row.blocked ? 'blocked' : row.input ? 'selected' : edit?.decision === 'skip' ? 'skipped' : 'pending';
}
export function isBulkEditable(edit?: RowEdit) {
  return edit?.bulk !== false && (edit?.decision === undefined || edit.bulk === true);
}
export function applyGroupDecision(rows: { index: number; blocked: boolean; row: Pick<BillRow, 'direction'> }[], edits: Record<number, RowEdit>, decision: Decision, from = '', to = '') {
  const next = { ...edits };
  for (const row of rows) {
    // A bulk choice never overwrites a row that the user already configured.
    if (row.blocked || !isBulkEditable(edits[row.index])) continue;
    next[row.index] = { decision: decision === 'auto' ? row.row.direction === 'neutral' ? 'skip' : row.row.direction : decision, bulk: true, from: from || undefined, to: to || undefined };
  }
  return next;
}

// Freeze the remaining choices before the new batch enters soft duplicate checks.
export function preserveSelections(rows: {index: number; input: TransactionInput | null}[], edits: Record<number, RowEdit>) {
  const next = { ...edits };
  for (const {index, input} of rows) {
    if (!input || (input.kind === 'reimbursement' || input.kind === 'adjustment')) continue;
    next[index] = {
      ...edits[index], decision: input.kind,
      bulk: edits[index]?.bulk ?? edits[index]?.decision === undefined,
    };
  }
  return next;
}
