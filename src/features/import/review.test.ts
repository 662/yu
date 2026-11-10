import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRow, applyGroupDecision, reviewState, preserveSelections } from './review';
import { previewRow, suggestAccount, type RowEdit } from './preview';
import { defaultCategories } from '../book/categories';
import { createTransaction, type Book } from '../book/ledger';
import type { BillRow } from './types';
const row: BillRow = { line:1,key:'order:one',date:'2026-11-01',time:'2026-11-01',amount:1000,direction:'expense',peer:'商店',description:'购物',method:'银行卡',category:'购物',status:'交易成功',issue:'',review:'' };
const book: Book = {version:1,categories:defaultCategories(),accounts:[{id:'bank',name:'银行卡',type:'bank',note:'',openingBalance:0},{id:'wallet',name:'余额',type:'cash',note:'',openingBalance:0}],transactions:[]};
test('review groups separate hard exclusions, duplicates, refunds, repayments and neutral movements',()=>{
 assert.equal(classifyRow(row,false,false),'ordinary');
 assert.equal(classifyRow({...row,review:'退款或冲正'},false,false),'refund');
 assert.equal(classifyRow({...row,review:'可能是信用卡还款'},false,false),'repayment');
 assert.equal(classifyRow({...row,direction:'neutral'},false,false),'movement');
 assert.equal(classifyRow({...row,review:'可能与支付平台账单重复'},false,false),'duplicate');
 assert.equal(classifyRow({...row,review:'退款'},false,true),'duplicate');
 assert.equal(classifyRow({...row,review:'退款'},true,true),'blocked');
});
test('pending and deliberate skip are distinct; missing accounts stay selected for validation',()=>{
 const pending=previewRow(book,'alipay',{...row,direction:'neutral'},{});
 assert.equal(reviewState(pending),'pending');
 assert.equal(reviewState(pending,{decision:'skip'}),'skipped');
 assert.equal(reviewState(previewRow(book,'alipay',row,{})),'selected');
 assert.equal(reviewState(previewRow(book,'alipay',{...row,issue:'交易未完成'},{})),'blocked');
});
test('bulk applies across pages, protects individual choices and hard exclusions, and can be revised',()=>{
 const rows=Array.from({length:1389},(_,index)=>({index,blocked:index===1388,row}));
 const manual: Record<number,RowEdit>={2:{decision:'income',category:'工资'},3:{decision:'skip'},4:{category:'food',bulk:false}};
 const skipped=applyGroupDecision(rows,manual,'skip');
 assert.equal(Object.keys(skipped).length,1388);
 assert.deepEqual(skipped[2],manual[2]);assert.deepEqual(skipped[3],manual[3]);assert.equal(skipped[1388],undefined);
 const transfers=applyGroupDecision(rows,skipped,'transfer','bank','wallet');
 const preview=previewRow(book,'alipay',{...row,direction:'neutral'},{},transfers[0]);
 assert.equal(preview.input?.kind,'transfer');assert.equal(preview.input?.from,'bank');assert.equal(preview.input?.to,'wallet');
 assert.deepEqual(transfers[2],manual[2]);
 const restored=applyGroupDecision(rows,transfers,'auto');
 assert.equal(restored[0].decision,'expense');assert.equal(restored[0].to,undefined);
 assert.deepEqual(transfers[4],manual[4]);
 assert.deepEqual(manual,{2:{decision:'income',category:'工资'},3:{decision:'skip'},4:{category:'food',bulk:false}});
});
test('explicitly retaining mixed-direction duplicates preserves each original direction',()=>{
 const edits=applyGroupDecision([{index:0,blocked:false,row},{index:1,blocked:false,row:{...row,direction:'income'}}],{},'auto');
 assert.equal(edits[0].decision,'expense');assert.equal(edits[1].decision,'income');
});

test('Alipay investment movements suggest a direction but require an explicit decision',()=>{
 const investment = {...row,category:'投资理财',direction:'neutral',method:'余额宝'} as const;
 const mapping = {余额宝:'wallet',银行卡:'bank'};
 const buy = {...investment,description:'某基金-买入'};
 const sell = {...investment,description:'某基金-卖出至余额宝'};
 const yieldRow = {...investment,description:'余额宝-收益发放'};
 const deposit = {...investment,description:'余额宝-单次转入',method:'某银行储蓄卡'};
 const withdrawal = {...deposit,description:'余额宝-转出到银行卡'};
 const cases = [
   [buy,'purchase','transfer','wallet',''],
   [sell,'redemption','transfer','','wallet'],
   [yieldRow,'yield','income','','wallet'],
   [deposit,'deposit','transfer','bank',''],
   [withdrawal,'withdrawal','transfer','','bank'],
 ] as const;
 for (const [billRow,movement,decision,from,to] of cases) {
   const accounts = {...mapping,某银行储蓄卡:'bank'};
   const pending = previewRow(book,'alipay',billRow,accounts);
   assert.equal(pending.movement,movement);
   assert.equal(pending.input,null);
   const chosen = previewRow(book,'alipay',billRow,accounts,{decision});
   assert.equal(chosen.input?.from,from);
   assert.equal(chosen.input?.to,to);
 }
 assert.equal(previewRow(book,'wechat',buy,mapping).movement,'other');
 assert.equal(previewRow(book,'alipay',{...buy,category:'其他'},mapping,{decision:'transfer'}).input?.from,'');
 assert.equal(previewRow(book,'alipay',buy,mapping,{decision:'transfer',from:''}).input?.from,'');
 assert.equal(suggestAccount({...book,accounts:[{...book.accounts[1],name:'支付宝'}]},'余额宝','alipay'),'');
});

test('a successful 500-row batch preserves remaining choices despite new soft duplicates',()=>{
 const first=previewRow(book,'alipay',row,{银行卡:'bank'});
 assert.ok(first.input);
 const selected=Array.from({length:1201},(_,index)=>({index,input:first.input}));
 const remaining=selected.slice(500);
 const edits=preserveSelections(remaining,{});
 assert.equal(remaining.length,701);assert.equal(Object.keys(edits).length,701);assert.equal(edits[499],undefined);
 const updated={...book,transactions:[createTransaction(book,first.input,'new-batch')]};
 const nextRow={...row,key:'another-order'};
 assert.equal(previewRow(updated,'alipay',nextRow,{银行卡:'bank'}).input,null);
 assert.equal(previewRow(updated,'alipay',nextRow,{银行卡:'bank'},edits[500]).input?.kind,'expense');
 assert.equal(reviewState(previewRow(updated,'alipay',nextRow,{银行卡:'bank'},edits[500]),edits[500]),'selected');
 assert.equal(previewRow(updated,'alipay',nextRow,{银行卡:'wallet'},edits[500]).input?.from,'wallet');
});
