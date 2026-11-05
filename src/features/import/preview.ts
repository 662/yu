import { classifyRow } from './review';
import { activeCategories } from '../book/categories';
import type { Book, TransactionInput } from '../book/ledger';
import { receiptKey } from './commands';
import type { BillRow, Source } from './types';
export type Decision = 'auto' | 'skip' | 'expense' | 'income' | 'transfer' | 'repayment';
export type RowEdit = { bulk?: boolean; decision?: Decision; category?: string; from?: string; to?: string; note?: string };
export function suggestCategory(book: Book, row: BillRow, kind: 'expense' | 'income') {
  const categories = activeCategories(book, kind); const text = `${row.category} ${row.peer} ${row.description}`;
  const exact = categories.find(c => row.category && (row.category === c.name || row.category.includes(c.name)));
  if (exact) return exact.id;
  const rules: [RegExp,string][] = kind === 'income' ? [[/工资|薪资|代发/, '工资'], [/奖金/, '奖金']] : [[/餐|饭|外卖|咖啡|奶茶|食品|美团|饿了么/, 'food'], [/地铁|公交|打车|滴滴|火车|机票|加油/, 'transport'], [/医|药|医院/, 'health'], [/电费|水费|房租|燃气|物业/, 'home'], [/电影|游戏|娱乐/, 'fun'], [/百货|超市|日用/, 'daily'], [/购物|服饰|淘宝|京东|拼多多/, 'shopping']];
  return rules.find(([pattern,id]) => pattern.test(text) && categories.some(c => c.id === id))?.[1] ?? categories.find(c => c.id === (kind === 'income' ? '其他收入' : 'other'))?.id ?? categories[0]?.id ?? '';
}
export function suggestAccount(book: Book, method: string, source: Source) {
  const tail = method.match(/(?:\(|（|尾号\s*)(\d{4})(?:\)|）|$)/)?.[1];
  const matches = book.accounts.filter(a => tail ? `${a.name} ${a.note}`.includes(tail) : a.name === method || (source === 'wechat' && /零钱/.test(method) && /微信|零钱/.test(a.name)) || (source === 'alipay' && /余额/.test(method) && /支付宝|余额宝/.test(a.name)));
  return matches.length === 1 ? matches[0].id : '';
}
export function previewRow(book: Book, source: Source, row: BillRow, mapping: Record<string,string>, edit: RowEdit = {}, earlierKeys = new Set<string>()) {
  const account = mapping[row.method] ?? '';
  const key = receiptKey(source, row.key, account);
  const imported = (book.imports ?? []).some(b => !b.rolledBack && b.source === source && b.items.some(item => item.key === key));
  const repeated = earlierKeys.has(key);
  const similar = account && book.transactions.some(t => t.date === row.date && t.amount === row.amount && t.entries.some(e => e.accountId === account && Math.sign(e.amount) === (row.direction === 'income' ? 1 : -1)));
  const reason = row.issue || (imported ? '这笔流水已经导入' : repeated ? '文件内订单号重复' : similar ? '已有同日、同金额、同账户流水，可能重复' : row.review);
  const blocked = Boolean(row.issue || imported || repeated);
  const decision = edit.decision ?? 'auto';
  const kind = decision === 'auto' ? reason || row.direction === 'neutral' ? 'skip' : row.direction : decision;
  const input: TransactionInput | null = blocked || kind === 'skip' ? null : {
    kind, date: row.date, amount: row.amount,
    category: kind === 'expense' || kind === 'income' ? edit.category ?? suggestCategory(book, row, kind) : kind === 'repayment' ? '信用卡还款' : '账户转账',
    from: kind === 'income' ? '' : edit.from ?? (row.direction === 'income' && (kind === 'transfer' || kind === 'repayment') ? '' : account),
    to: kind === 'expense' ? '' : edit.to ?? (row.direction === 'income' ? account : ''),
    note: (edit.note ?? [row.peer, row.description].filter(v => v && v !== '/').join(' · ')).slice(0,200), reimbursable: false,
  };
  return { key, input, reason, blocked, kind, group: classifyRow(row, blocked, Boolean(similar)) };
}
