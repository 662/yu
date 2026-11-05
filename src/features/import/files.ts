import { decodeBill, parseDelimited, parseTable, MAX_ROWS } from './parser';
import type { ParsedBill, Source } from './types';
export async function readBill(file: File, source?: Source, month?: string, password?: string): Promise<ParsedBill> {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的账单文件');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    const { pdfTable } = await import('./pdf');
    return parseTable(await pdfTable(bytes, password), source, month);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const xlsx = await import('xlsx');
    const workbook = xlsx.read(bytes, { type: 'array', cellDates: false, sheetRows: MAX_ROWS + 301 });
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const range = xlsx.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
      if (range.e.r > MAX_ROWS + 300 || range.e.c > 100) throw new Error('表格过大，请缩小导出时间范围');
      const table = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
      if (table.some(row => row.some(cell => /交易时间|记账日期|人民币金额/.test(String(cell))))) return parseTable(table, source, month);
    }
    throw new Error('Excel 中未找到支持的账单工作表');
  }
  if (!['csv', 'txt', 'tsv'].includes(ext ?? '')) throw new Error('支持 CSV、Excel 和招行文字版 PDF；ZIP 请先解压');
  return parseTable(parseDelimited(decodeBill(bytes)), source, month);
}
