import type { TextItem } from 'pdfjs-dist/types/src/display/api';
// Reconstruct columns using the statement's own header coordinates; never evaluate PDF scripts.
export async function pdfTable(bytes: Uint8Array, password?: string): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: bytes, password, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error('PDF 最多支持 100 页，请缩小账单时间范围');
    const pages: TextItem[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.filter((v): v is TextItem => 'str' in v && Boolean(v.str.trim())));
      page.cleanup();
    }
    return reconstructPdf(pages);
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('PDF 需要密码或密码不正确，请填写后重新选择文件');
    throw error;
  } finally { await task.destroy(); }
}

export function reconstructPdf(pages: TextItem[][]): string[][] {
  let columns: { name: string; x: number }[] = []; let credit = false;
  const table: string[][] = []; const titles: string[] = [];
  for (let n = 1; n <= pages.length; n++) {
    const items = pages[n-1].filter(v => Boolean(v.str.trim()));
    const text = items.map(v => v.str).join(' ');
    if (n === 1) {
      if (!/招商银行/.test(text)) throw new Error('目前 PDF 仅支持招商银行交易流水和信用卡对账单');
      credit = /人民币金额|信用卡对账单/.test(text);
      const title = text.match(/招商银行信用卡对账单.{0,60}?(20\d{2})年(\d{1,2})月/);
      titles.push(title ? `${title[1]}年${title[2]}月` : text);
    }
    const expected = credit ? ['交易日', '记账日', '交易摘要', '人民币金额', '卡号末四位', '交易地金额'] : ['记账日期', '货币', '交易金额', '联机余额', '交易摘要', '对手信息', '客户摘要'];
    const found = expected.map(name => { const item = items.find(v => v.str.trim() === name); return item ? { name, x: item.transform[4] } : null; }).filter(v => v !== null).sort((a,b) => a.x-b.x);
    if (found.length >= 4) columns = found;
    if (!columns.length) throw new Error('无法识别 PDF 表格列。请使用文字版流水，或转成 CSV 后导入');
    if (n === 1) table.push(titles, columns.map(c => c.name));
    const col = (item: TextItem) => {
      const x = item.transform[4];
      for (let i = columns.length - 1; i >= 0; i--) if (x >= columns[i].x - 2) return i;
      return -1;
    };
    const dateColumn = columns.findIndex(c => c.name === (credit ? '记账日' : '记账日期'));
    const anchors = items.filter(item => col(item) === dateColumn && (credit ? /^\d{2}\/\d{2}$/ : /^\d{4}[-/]\d{2}[-/]\d{2}$/).test(item.str.trim())).sort((a,b) => b.transform[5]-a.transform[5]);
    for (let r = 0; r < anchors.length; r++) {
      const anchor = anchors[r]; const y = anchor.transform[5];
      const previous = anchors[r-1]?.transform[5]; const following = anchors[r+1]?.transform[5];
      const gap = previous === undefined ? (following === undefined ? 30 : y-following) : previous-y;
      const top = previous === undefined ? y+gap/2 : (previous+y)/2;
      const bottom = following === undefined ? y-gap/2 : (y+following)/2;
      const cells = columns.map(() => [] as TextItem[]);
      for (const item of items) {
        const iy = item.transform[5]; const c = col(item);
        const inRow = credit ? Math.abs(iy-y) <= Math.max(anchor.height, 3) : iy < top && iy >= bottom;
        if (c >= 0 && inRow) cells[c].push(item);
      }
      table.push(cells.map(cell => cell.sort((a,b) => b.transform[5]-a.transform[5] || a.transform[4]-b.transform[4]).map(v => v.str.trim()).join('')));
    }
    if (table.length > 5300) throw new Error('单个文件最多支持 5000 笔记录');

  }
  if (table.length <= 2) throw new Error('没有读到 PDF 交易。扫描件暂不支持，请使用文字版流水或 CSV');
  return table;
}
