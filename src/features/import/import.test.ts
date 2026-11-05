import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDelimited, parseTable, decodeBill } from './parser';
import { previewRow } from './preview';
import { applyCommand, commandSchema } from '../book/commands';
import { defaultCategories } from '../book/categories';
import { accountBalance, type Book } from '../book/ledger';
import type { ImportCommand } from './commands';
const wxHeader = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注';
const wx = (extra='') => parseTable(parseDelimited('微信支付账单明细\n'+wxHeader+'\n2026-11-01 12:00:00,商户消费,小店,"午餐,饮料",支出,¥12.34,招商银行(1234),支付成功,001234567890123456789\t,001,/'+extra));
const book = ():Book => ({version:1,categories:defaultCategories(),accounts:[{id:'bank',name:'招行1234',type:'bank',note:'',openingBalance:100000},{id:'credit',name:'招行信用卡',type:'credit',note:'',openingBalance:0}],transactions:[]});
const id = '6a9a69ef-4452-4937-9ac5-aafeb0a10001';
function command():Extract<ImportCommand,{type:'import.commit'}> { return {type:'import.commit',id,source:'wechat',filename:'账单.csv',rows:[{key:wx().rows[0].key,sourceAccount:'bank',id:'6a9a69ef-4452-4937-9ac5-aafeb0a10002',input:{kind:'expense',amount:1234,date:'2026-11-01',category:'food',from:'bank',to:'',note:'午餐',reimbursable:false}}]}; }
test('CSV protects long IDs, commas, multiline quotes, UTF-8 BOM and GB18030 decoding',()=>{
 const parsed=wx();assert.equal(parsed.source,'wechat');assert.equal(parsed.rows[0].amount,1234);assert.equal(parsed.rows[0].key,'order:001234567890123456789');assert.equal(parsed.rows[0].description,'午餐,饮料');
 assert.deepEqual(parseDelimited('\uFEFFa,b\r\n"a\n""b",c'),[['a','b'],['a\n"b','c']]);
 assert.equal(decodeBill(new Uint8Array([0xd6,0xa7,0xb8,0xb6,0xb1,0xa6])),'支付宝');
 assert.throws(()=>parseDelimited('a,b\n"unterminated'));
});
test('Alipay columns may be reordered and padded; status/refund/neutral are reviewed',()=>{
 const parsed=parseTable([['收/支','交易对方','商品说明','收/付款方式','金额','交易状态','交易分类','交易订单号','交易时间'],['不计收支','某店','退款','余额','10.00','退款成功','退款','0001','2026-11-01 01:00:00'],['支出','某店','未支付','余额','20.00','交易关闭','购物','0002','2026-11-02 01:00:00']]);
 assert.equal(parsed.source,'alipay');assert.match(parsed.rows[0].review,/退款/);assert.match(parsed.rows[1].issue,/未完成/);
 assert.equal(previewRow(book(),'alipay',parsed.rows[0],{}).input,null);
});
test('CMB debit and credit have opposite signs; credit dates roll across January',()=>{
 const debit=parseTable([['记账日期','货币','交易金额','联机余额','交易摘要'],['2026-11-01','CNY','-1,234.56','100','消费'],['2026-11-02','USD','10.00','110','利息']]);
 assert.equal(debit.rows[0].direction,'expense');assert.equal(debit.rows[0].amount,123456);assert.match(debit.rows[1].issue,/人民币/);
 const credit=parseTable([['招商银行信用卡对账单 2026年01月'],['交易日','记账日','交易摘要','人民币金额','卡号末四位'],['','12/29','还款','-10.00','1234'],['01/01','01/02','消费','10.00','1234']]);
 assert.equal(credit.rows[0].date,'2025-12-29');assert.equal(credit.rows[0].direction,'income');assert.match(credit.rows[0].review,/还款/);assert.equal(credit.rows[1].direction,'expense');
 const missing=parseTable([['交易日','记账日','人民币金额'],['01/01','01/02','1.00']]);assert.match(missing.rows[0].issue,/账单年月/);
});
test('Malformed dates and money stay visible and are blocked, source mismatch fails',()=>{
 const parsed=wx('\n2026-02-30,商户消费,店,商品,支出,NaN,零钱,支付成功,bad,1,/');assert.match(parsed.rows[1].issue,/日期/);
 assert.equal(previewRow(book(),'wechat',parsed.rows[1],{}, {decision:'expense'}).input,null);
 assert.throws(()=>parseTable(parseDelimited(wxHeader),'cmb-credit'));
});
test('Import is balanced, idempotent, scoped to each book and detects receipt replay after deletion',()=>{
 const cmd=command();let b=applyCommand(book(),cmd);assert.equal(b.transactions.length,1);assert.equal(accountBalance(b,'bank'),98766);assert.equal(b.transactions[0].entries.reduce((s,e)=>s+e.amount,0),0);
 assert.deepEqual(applyCommand(b,cmd),b);assert.equal(applyCommand(book(),cmd).transactions.length,1);
 b=applyCommand(b,{type:'transaction.delete',id:cmd.rows[0].id});assert.equal(b.transactions.length,0);
 assert.throws(()=>applyCommand(b,{...cmd,id:'6a9a69ef-4452-4937-9ac5-aafeb0a10003'}),/已经导入/);
 assert.match(previewRow(b,'wechat',wx().rows[0],{[wx().rows[0].method]:'bank'}).reason,/已经导入/);
});
test('One invalid or repeated row rejects whole import without changing the original book',()=>{
 const b=book(),cmd=command();const invalid={...cmd,rows:[...cmd.rows,{...cmd.rows[0],id:'6a9a69ef-4452-4937-9ac5-aafeb0a10003',key:'other',input:{...cmd.rows[0].input,from:'other-user-account'}}]};
 assert.throws(()=>applyCommand(b,invalid),/有效账户/);assert.equal(b.transactions.length,0);
 assert.throws(()=>applyCommand(b,{...cmd,rows:[cmd.rows[0],{...cmd.rows[0],id:'6a9a69ef-4452-4937-9ac5-aafeb0a10003'}]}),/已经导入/);
 assert.equal(commandSchema.safeParse({...cmd,rows:Array(501).fill(cmd.rows[0])}).success,false);
});
test('Rollback restores balances, permits reimport, protects manual edits and never targets other batches',()=>{
 const cmd=command(),b=applyCommand(book(),cmd);const restored=applyCommand(b,{type:'import.rollback',id});assert.equal(restored.transactions.length,0);assert.equal(accountBalance(restored,'bank'),100000);
 assert.equal(applyCommand(restored,{...cmd,id:'6a9a69ef-4452-4937-9ac5-aafeb0a10003'}).transactions.length,1);
 const edited=applyCommand(b,{type:'transaction.save',id:cmd.rows[0].id,input:{...cmd.rows[0].input,note:'修改'}});
 assert.throws(()=>applyCommand(edited,{type:'import.rollback',id}),/手动修改/);
 assert.throws(()=>applyCommand(book(),{type:'import.rollback',id}),/不存在/);
});
test('Transfers and credit repayments create no expense/income; CMB identity uses mapped bank',()=>{
 const cmd=command();cmd.source='cmb-credit';cmd.rows[0].sourceAccount='credit';cmd.rows[0].input={...cmd.rows[0].input,kind:'repayment',from:'bank',to:'credit',category:'信用卡还款'};
 const b=applyCommand(book(),cmd);assert.equal(b.transactions[0].entries.every(e=>!e.accountId.startsWith('expense:')&&!e.accountId.startsWith('income:')),true);
 assert.ok(b.imports?.[0].items[0].key.startsWith('credit:'));
 assert.throws(()=>applyCommand(book(),{...cmd,rows:[{...cmd.rows[0],sourceAccount:'unknown'}]}),/映射/);
});
test('Potential cross-platform duplicates are skipped by default and explicitly selectable',()=>{
 const b=applyCommand(book(),command()),row=wx().rows[0];row.key='different-order';
 const p=previewRow(b,'alipay',row,{[row.method]:'bank'});assert.match(p.reason,/可能重复/);assert.equal(p.input,null);
 assert.equal(previewRow(b,'alipay',row,{[row.method]:'bank'},{decision:'expense'}).input?.amount,1234);
});

test('PDF column reconstruction keeps wrapped payees in their own row and reads the credit statement month',async()=>{
 const {reconstructPdf}=await import('./pdf');
 const item=(str:string,x:number,y:number)=>({str,transform:[10,0,0,10,x,y],height:10,width:30,dir:'ltr',fontName:'test',hasEOL:false});
 const headers=['记账日期','货币','交易金额','联机余额','交易摘要','对手信息'];
 const page=[item('招商银行交易流水',0,800),...headers.map((h,i)=>item(h,i*100,750)),item('2026-11-01',0,700),item('CNY',100,700),item('-10.00',200,700),item('90.00',300,700),item('消费',400,700),item('上行店名',500,705),item('尾行',500,695),item('2026-11-02',0,670),item('CNY',100,670),item('-20.00',200,670),item('70.00',300,670),item('消费',400,670),item('下一笔',500,675)];
 const parsed=parseTable(reconstructPdf([page]));assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].peer,'上行店名尾行');assert.equal(parsed.rows[1].peer,'下一笔');
 const credit=[item('账单日 2025年01月01日',0,820),item('招商银行信用卡对账单（个人消费卡账户 2026年01月）',0,800),...['交易日','记账日','交易摘要','人民币金额','卡号末四位'].map((h,i)=>item(h,i*100,750)),item('12/30',0,700),item('12/31',100,700),item('消费',200,700),item('10.00',300,700),item('1234',400,700)];
 assert.equal(parseTable(reconstructPdf([credit])).rows[0].date,'2025-12-30');
});
