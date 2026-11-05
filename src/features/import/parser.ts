import { parseMoney } from '../book/ledger';
import { type BillRow, type ParsedBill, type Source } from './types';
export const MAX_ROWS = 5000;
const clean = (v: unknown) => String(v ?? '').replace(/^\uFEFF/, '').trim().replace(/^['`]/, '');
const header = (v: unknown) => clean(v).replace(/[\s（）()]/g, '').replace(/元$/, '');
export function parseDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/).find(l => /交易时间|记账日期|人民币金额/.test(l)) ?? text.split(/\r?\n/)[0];
  const separator = first.split('\t').length > first.split(',').length ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || !value.trim())) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && c === separator) { row.push(clean(value)); value = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(clean(value)); rows.push(row); row = []; value = '';
    } else value += c;
    if (rows.length > MAX_ROWS + 300) throw new Error('单个文件最多支持 5000 笔记录，请缩小导出时间范围');
  }
  if (quoted) throw new Error('文件中的引号没有闭合，请重新导出原始账单');
  if (value || row.length) { row.push(clean(value)); rows.push(row); }
  return rows;
}
export function decodeBill(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
}
function dateValue(raw: string, period: RegExpMatchArray | null): string {
  let text = raw.trim().replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-');
  if (/^\d{8}$/.test(text)) text = `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6)}`;
  if (/^\d{1,2}-\d{1,2}$/.test(text)) {
    if (!period) throw new Error('缺少信用卡账单年月，请保留原文件标题，或填写账单月份');
    let year = Number(period[1]); if (Number(text.split('-')[0]) > Number(period[2])) year--;
    text = `${year}-${text}`;
  }
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|$)/);
  if (!match) throw new Error('无法识别交易日期');
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('交易日期无效');
  return date;
}
export function parseTable(table: unknown[][], selected?: Source, statementMonth?: string): ParsedBill {
  const start = table.findIndex(row => {
    const names = row.map(header);
    return (names.includes('交易时间') && (names.includes('金额') || names.includes('交易金额'))) || (names.includes('记账日期') && names.includes('交易金额')) || (names.includes('记账日') && names.includes('人民币金额'));
  });
  if (start < 0) throw new Error('未找到支持的账单表头。请选择微信、支付宝个人对账账单，或招行交易流水');
  const names = table[start].map(header);
  const source: Source = names.includes('人民币金额') ? 'cmb-credit' : names.includes('记账日期') ? 'cmb-debit' : names.includes('商品说明') || names.includes('收/付款方式') || names.includes('交易订单号') ? 'alipay' : 'wechat';
  if (selected && source !== selected) throw new Error('所选平台与文件表头不符，请检查文件或选择自动识别');
  const period = (statementMonth || table.slice(0,start).flat().join(' ')).match(/(20\d{2})[年\-/](\d{1,2})/);
  const rows: BillRow[] = []; const occurrences = new Map<string, number>();
  for (let i = start + 1; i < table.length; i++) {
    const cells = table[i].map(clean); if (!cells.some(Boolean)) continue;
    const get = (...keys: string[]) => { const index = names.findIndex(n => keys.includes(n)); return index < 0 ? '' : cells[index] ?? ''; };
    const rawDate = get('交易时间', '记账日期', '交易日') || get('记账日');
    if (/^(交易时间|记账日期|交易日)$/.test(rawDate) || /^[\-—]{3,}|^合计|^共\d+笔|^总计/.test(cells.join(''))) continue;
    if (!rawDate && cells.filter(Boolean).length < 2) continue;
    let issue = '', date = '', amount = 0;
    try { date = dateValue(rawDate, period); } catch (error) { issue = (error as Error).message; }
    const numeric = get('人民币金额', '交易金额', '金额').replace(/[,，¥￥\s]/g, '').replace(/^(CNY|RMB)/i, '').replace(/元$/, '');
    try { amount = parseMoney(numeric.replace(/^[+-]/, '')); if (!amount) throw new Error(); } catch { issue ||= '金额无效或为零'; }
    const currency = get('货币', '币种');
    if (currency && !/^(CNY|RMB|人民币|人民币元|156)$/i.test(currency)) issue ||= '仅支持人民币，请单独处理外币流水';
    const directionText = get('收/支', '收支');
    let direction: BillRow['direction'] = /收入/.test(directionText) ? 'income' : /支出/.test(directionText) ? 'expense' : 'neutral';
    if (source === 'cmb-debit') direction = numeric.startsWith('-') ? 'expense' : 'income';
    if (source === 'cmb-credit') direction = numeric.startsWith('-') ? 'income' : 'expense';
    const peer = get('交易对方', '对手信息');
    const description = [get('商品', '商品说明', '交易摘要'), get('客户摘要'), get('备注')].filter(v => v && v !== '/').join(' · ');
    const category = get('交易分类', '交易类型'); const status = get('当前状态', '交易状态');
    if (/关闭|失败|撤销|未支付|等待付款|待付款/.test(status)) issue ||= '交易未完成，不导入';
    const method = get('支付方式', '收/付款方式', '卡号末四位') || (source === 'wechat' && direction === 'income' ? '微信零钱' : source.startsWith('cmb') ? '招商银行账户' : '未注明账户');
    const all = `${category} ${description} ${peer} ${status}`;
    let review = '';
    if (/退款|退货|退回|冲正/.test(all)) review = '退款或冲正，请核对原消费；可暂时跳过并手动修正原账';
    else if (/还款|偿还/.test(all)) review = '可能是信用卡还款，请选择付款账户和信用卡';
    else if (/充值|提现|取款|ATM|零钱通|余额宝|理财|基金|证券|转账汇款|银联转账|转入|转出/.test(all) || direction === 'neutral') review = '可能是账户间资金流动，请核对并选择转账或跳过';
    else if (source.startsWith('cmb') && /财付通|微信|支付宝|快捷支付/.test(all)) review = '可能与支付平台账单重复，请核对后再选择';
    const externalId = get('交易单号', '交易订单号').replace(/\s/g, '');
    const base = externalId && externalId !== '/' ? `order:${externalId}` : JSON.stringify([rawDate, numeric, peer, description, method]);
    const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
    const key = externalId && externalId !== '/' ? base : `row:${base}:${occurrence}`;
    if (key.length > 500) issue ||= '流水标识过长，请单独处理';
    rows.push({ line: i+1, key, date, time: rawDate, amount, direction, peer, description, method, category, status, issue, review });
    if (rows.length > MAX_ROWS) throw new Error('单个文件最多支持 5000 笔记录，请缩小导出时间范围');
  }
  if (!rows.length) throw new Error('这个文件没有交易明细');
  return { source, rows, warnings: source === 'cmb-credit' ? ['信用卡正数为消费、负数为还款或退款；只有月日的日期按账单年月推算，请检查跨年记录。'] : [] };
}
