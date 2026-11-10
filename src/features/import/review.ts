import type { TransactionInput } from '../book/ledger';
import type { BillRow, Source } from './types';
import type { Decision, RowEdit } from './preview';

export const reviewGroups = {
  ordinary: { title: '普通收支', description: '已按账单方向选择入账，检查账户和分类即可。' },
  refund: { title: '退款与冲正', description: '不会自动冲减原消费。可暂不导入并修正原账；记为收入会增加收入统计。' },
  movement: { title: '资金往来', description: '先按用途缩小范围。理财收益可以记为收入；自己的两个账户之间划转时，才选账户转账。账本未跟踪的流水可跳过。' },
  repayment: { title: '信用卡还款', description: '选择实际付款账户和信用卡，不计入收入或支出。' },
  duplicate: { title: '疑似重复', description: '可能已从其他账单或手工记账。确认确实是不同交易后再保留。' },
  blocked: { title: '无法导入', description: '已导入、文件内重复、未完成交易或格式错误，均不允许选择；可查看每笔具体原因。' },
} as const;
export type ReviewGroup = keyof typeof reviewGroups;
export const movementTypes = {
  yield: '理财收益',
  purchase: '理财买入',
  redemption: '理财卖出与赎回',
  deposit: '转入余额宝',
  withdrawal: '转出余额宝',
  other: '其他资金往来',
} as const;
export type MovementType = keyof typeof movementTypes;

export function classifyMovement(source: Source, row: BillRow): MovementType {
  if (source !== 'alipay' || row.category !== '投资理财') return 'other';
  const description = row.description.split(' · ')[0];
  if (/(?:^|[-－])收益发放$/.test(description)) return 'yield';
  if (/(?:^|[-－])买入$/.test(description)) return 'purchase';
  if (/(?:^|[-－])(?:卖出|赎回)(?:至余额宝)?$/.test(description)) return 'redemption';
  if (/^余额宝[-－](?:自动|单次)?转入$/.test(description)) return 'deposit';
  if (/^余额宝[-－]转出(?:到银行卡)?$/.test(description)) return 'withdrawal';
  return 'other';
}

export const movementActions: Record<MovementType, Decision> = {
  yield: 'income',
  purchase: 'transfer',
  redemption: 'transfer',
  deposit: 'transfer',
  withdrawal: 'transfer',
  other: 'transfer',
};

export function movementAccountSide(movement: MovementType, method: string) {
  if (movement === 'purchase') return 'from';
  if (movement === 'yield' || movement === 'redemption') return 'to';
  if (movement === 'deposit') return method === '余额宝' ? 'to' : /储蓄卡|余额支付|^余额$/.test(method) ? 'from' : '';
  if (movement === 'withdrawal') return method === '余额宝' ? 'from' : /储蓄卡|余额支付|^余额$/.test(method) ? 'to' : '';
  return '';
}
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
