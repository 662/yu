// Isolated OIDC + PostgreSQL integration suite. Never point this at a real book.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool } from 'pg';
if (!process.env.DATABASE_URL?.endsWith('/yu_test') || process.env.OIDC_ISSUER !== 'http://mock-oidc:3102') throw new Error('Isolated test environment required');
const base=process.env.YU_TEST_BASE_URL || 'http://127.0.0.1:3000';
const origin=process.env.APP_ORIGIN;
let cookie='', book;
async function request(path,method='GET',body,expected=200,session=cookie,requestOrigin=origin) {
 const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&requestOrigin?{Origin:requestOrigin}:{}),...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 assert.equal(response.status,expected,method+' '+path+': '+JSON.stringify(data));
 return {data,response};
}
const sessionCookie=(r)=>r.headers.getSetCookie().find(v=>v.startsWith('yu-session='))?.split(';')[0];
async function beginLogin() {
 const start=await fetch(base+'/api/auth/signin/oidc',{redirect:'manual'});
 assert.equal(start.status,307);
 const flow=start.headers.getSetCookie().find(v=>v.startsWith('yu-oidc-flow=')).split(';')[0];
 return {authorization:new URL(start.headers.get('location')),flow};
}
async function authorize(start,subject) {
 start.authorization.searchParams.set('test_subject',subject);
 const r=await fetch(start.authorization,{redirect:'manual'});
 assert.equal(r.status,302);
 const callback=new URL(r.headers.get('location'));
 return callback.pathname+callback.search;
}
async function callback(path,flow) {return fetch(base+path,{headers:flow?{Cookie:flow}:{},redirect:'manual'});}
async function login(subject) {
 const start=await beginLogin();const path=await authorize(start,subject);const r=await callback(path,start.flow);
 assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location')).pathname,'/');
 const result=sessionCookie(r);assert.ok(result);assert.match(r.headers.get('set-cookie'),/HttpOnly/i);assert.match(r.headers.get('set-cookie'),/SameSite=lax/i);
 return result;
}
await request('/api/book','GET',undefined,401,'');
await request('/api/auth/setup','POST',{},404,'');
await request('/api/auth/login','POST',{},404,'');
for(const subject of ['wrong-nonce','bad-signature','wrong-issuer','wrong-audience','expired','cancel']) {
 const start=await beginLogin(); const path=await authorize(start,subject);const r=await callback(path,start.flow);
 assert.equal(new URL(r.headers.get('location')).pathname,'/login');assert.equal(sessionCookie(r),undefined);
}
const badPkce=await beginLogin();badPkce.authorization.searchParams.set('code_challenge','wrong');
const badPkceResponse=await callback(await authorize(badPkce,'alice'),badPkce.flow);
assert.equal(new URL(badPkceResponse.headers.get('location')).pathname,'/login');
const flow=await beginLogin();const path=await authorize(flow,'alice');
const wrongState=new URL(path,origin);wrongState.searchParams.set('state','wrong');
assert.equal(new URL((await callback(wrongState.pathname+wrongState.search,flow.flow)).headers.get('location')).pathname,'/login');
assert.equal(new URL((await callback(path,'')).headers.get('location')).pathname,'/login');
const validCallback=await callback(path,flow.flow);const alice=sessionCookie(validCallback);assert.ok(alice);
assert.equal(new URL((await callback(path,flow.flow)).headers.get('location')).pathname,'/login');
console.log('PASS signed OIDC code flow with state, nonce, PKCE; rejects forged/expired tokens, wrong audience/issuer and replay');
const bob=await login('bob'); const sameEmail=await login('same-email');
cookie=alice; book=(await request('/api/book')).data;
const aliceOwner=book.ownerId;assert.equal(book.accounts.length,0);
// The production runner must contain the Markdown and authenticate before serving it.
for (const path of ['/wiki', '/wiki/ledger']) {
 const response=await fetch(base+path,{redirect:'manual'});
 const html=await response.text();
 assert.ok(response.headers.get('location')?.endsWith('/login') || (html.includes('NEXT_REDIRECT') && html.includes('/login')), 'anonymous Wiki request must redirect to login');
 assert.ok(!html.includes('id="金额与分录"'), 'anonymous response must not include Wiki content');
}
for (const session of [alice,bob]) {
 for (const path of ['/wiki', '/wiki/ledger', '/wiki/ledger']) {
  const response=await fetch(base+path,{headers:{Cookie:session}});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.ok(!html.includes('NEXT_REDIRECT'), 'authenticated Wiki must not redirect');
  assert.ok(html.includes('Wiki 主题'));
  assert.ok(html.includes(path==='/wiki'?'理解年年有鱼':'id="金额与分录"'));
  assert.ok(html.includes('<table>'));
 }
}
const unknownWiki=await fetch(base+'/wiki/unknown-topic',{headers:{Cookie:alice}});
const unknownWikiHtml=await unknownWiki.text();
assert.ok(unknownWiki.status===404 || unknownWikiHtml.includes('NEXT_HTTP_ERROR_FALLBACK;404'));
assert.ok(!unknownWikiHtml.includes('id="金额与分录"'));
console.log('PASS Wiki auth, packaged Markdown, direct navigation, refresh, Chinese anchors, GFM tables and unknown pages');

const bobBook=(await request('/api/book','GET',undefined,200,bob)).data;
const thirdBook=(await request('/api/book','GET',undefined,200,sameEmail)).data;
assert.notEqual(aliceOwner,bobBook.ownerId);assert.notEqual(aliceOwner,thirdBook.ownerId);
const fullResponse=await fetch(base+'/api/book',{headers:{Cookie:alice}});
const etag=fullResponse.headers.get('etag');assert.ok(etag);await fullResponse.arrayBuffer();
const unchangedResponse=await fetch(base+'/api/book',{headers:{Cookie:alice,'If-None-Match':etag}});
assert.equal(unchangedResponse.status,304);assert.equal(await unchangedResponse.text(),'');
assert.equal(unchangedResponse.headers.get('etag'),etag);
const otherOwnerResponse=await fetch(base+'/api/book',{headers:{Cookie:bob,'If-None-Match':etag}});
assert.equal(otherOwnerResponse.status,200);assert.equal((await otherOwnerResponse.json()).ownerId,bobBook.ownerId);
assert.equal((await fetch(base+'/api/book',{headers:{'If-None-Match':etag}})).status,401);
console.log('PASS conditional sync skips unchanged books and remains session- and owner-bound');

const aliceAgain=await login('alice');assert.equal((await request('/api/book','GET',undefined,200,aliceAgain)).data.ownerId,aliceOwner);
console.log('PASS each identity gets its own empty book; same email does not link users; repeat SSO preserves identity');
assert.equal(book.categories.length,11);assert.equal(book.categories.filter(c=>c.kind==='expense'&&c.preset).length,8);assert.equal(bobBook.categories.length,11);assert.equal(thirdBook.categories.length,11);
console.log('PASS every new book starts with the original 11 presets');
const current=async()=>{book=(await request('/api/book')).data;return book;};
const mutate=async(command,expected=200,revision=book.revision)=>{
 const result=await request('/api/book','POST',{ownerId:book.ownerId,revision,command},expected);
 if(expected===200)book=result.data;return result;
};
const today='2026-11-03',bank=randomUUID(),credit=randomUUID(),wallet=randomUUID(),bobBank=randomUUID();
const transaction=(o={})=>({kind:'expense',amount:3500,date:today,category:'food',from:bank,to:'',note:'Alice 午餐',reimbursable:false,...o});
await request('/api/book','POST',{ownerId:aliceOwner,revision:0,command:{type:'transaction.delete',id:'nonexistent'}},403,cookie,'https://untrusted.invalid');
for(const [id,name,type,balance]of[[bank,'Alice 银行卡','bank',100000],[credit,'Alice 信用卡','credit',-20000],[wallet,'Alice 零钱','balance',0]]) await mutate({type:'account.save',account:{id,name,type,note:''},balance,date:today});
const lunch=randomUUID();await mutate({type:'transaction.save',id:lunch,input:{...transaction(),entries:[{accountId:bank,amount:999999}]}});
const balance=(id)=>book.accounts.find(a=>a.id===id).openingBalance+book.transactions.flatMap(t=>t.entries).filter(e=>e.accountId===id).reduce((s,e)=>s+e.amount,0);
assert.equal(balance(bank),96500);
let bobCurrent=(await request('/api/book','GET',undefined,200,bob)).data;
assert.equal(bobCurrent.accounts.length,0);assert.equal(bobCurrent.transactions.length,0);
const wrongOwner=await request('/api/book','POST',{ownerId:aliceOwner,revision:bobCurrent.revision,command:{type:'transaction.delete',id:lunch}},409,bob);
assert.equal(wrongOwner.data.code,'account_changed');assert.equal(wrongOwner.data.book,undefined);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.delete',id:lunch}},400,bob);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.save',id:randomUUID(),input:transaction()}},400,bob);
bobCurrent=(await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'account.save',account:{id:bobBank,name:'Bob 银行卡',type:'bank',note:''},balance:50000,date:today}},200,bob)).data;
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'account.save',account:{id:bank,name:'冒用其他账户编号',type:'bank',note:''},balance:0,date:today}},503,bob);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.save',id:lunch,input:transaction({from:bobBank})}},503,bob);
await current();assert.equal(balance(bank),96500);assert.equal(book.transactions.find(t=>t.id===lunch).amount,3500);
console.log('PASS no cross-user reads, writes, deletes, ID collisions or stale-tab account switching');
await mutate({type:'transaction.save',id:randomUUID(),input:transaction({kind:'transfer',amount:5000,to:wallet})});
await mutate({type:'transaction.save',id:randomUUID(),input:transaction({kind:'repayment',amount:10000,to:credit})});
assert.equal(balance(credit),-10000);
const advance=randomUUID();await mutate({type:'transaction.save',id:advance,input:transaction({amount:12600,reimbursable:true})});
await mutate({type:'transaction.save',id:randomUUID(),input:transaction({kind:'reimbursement',amount:5000,from:'',to:wallet,reimbursementFor:advance})});
await mutate({type:'transaction.save',id:randomUUID(),input:transaction({kind:'reimbursement',amount:7700,from:'',to:wallet,reimbursementFor:advance})},400);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.save',id:randomUUID(),input:transaction({kind:'reimbursement',from:'',to:bobBank,amount:100,reimbursementFor:advance})}},400,bob);
const revision=book.revision;
const parallel=await Promise.all([100,200].map(amount=>fetch(base+'/api/book',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:alice},body:JSON.stringify({ownerId:aliceOwner,revision,command:{type:'transaction.save',id:randomUUID(),input:transaction({amount,note:'并发校验'})}})})));
assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);await current();
const independent=await Promise.all([
 request('/api/book','POST',{ownerId:aliceOwner,revision:book.revision,command:{type:'transaction.save',id:randomUUID(),input:transaction({amount:100,note:'独立版本 A'})}},200,alice),
 request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.save',id:randomUUID(),input:transaction({from:bobBank,amount:200,note:'独立版本 B'})}},200,bob),
]);
assert.equal(independent.length,2);await current();
await mutate({type:'transaction.delete',id:advance});
assert.equal(book.transactions.some(t=>t.reimbursementFor===advance),false);
await mutate({type:'account.save',account:{id:bank,name:'Alice 银行卡',type:'bank',note:'已核对'},balance:300000,date:today});assert.equal(balance(bank),300000);
await mutate({type:'transaction.save',id:lunch,input:transaction({amount:4500})});assert.equal(balance(bank),299000);
await mutate({type:'transaction.delete',id:lunch});assert.equal(balance(bank),303500);
console.log('PASS transfers, repayments, reimbursement, edit/delete and per-user concurrency');
const customCategory=randomUUID();
const definition={id:customCategory,name:'宠物用品',kind:'expense',icon:'PawPrint',tone:'pink'};
await mutate({type:'category.save',category:definition});
const categorized=randomUUID();
await mutate({type:'transaction.save',id:categorized,input:transaction({category:customCategory,amount:600,note:'分类持久化测试'})});
const journalBefore=structuredClone(book.transactions.find(t=>t.id===categorized).entries);
await mutate({type:'category.save',category:{...definition,name:'毛孩子',tone:'green'}});
assert.deepEqual(book.transactions.find(t=>t.id===categorized).entries,journalBefore);
assert.equal(book.categories.find(c=>c.id===customCategory).name,'毛孩子');
bobCurrent=(await request('/api/book','GET',undefined,200,bob)).data;
assert.equal(bobCurrent.categories.some(c=>c.id===customCategory),false);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'category.archive',id:customCategory,archived:true}},400,bob);
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'transaction.save',id:randomUUID(),input:transaction({from:bobBank,category:customCategory})}},400,bob);
bobCurrent=(await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'category.save',category:{...definition,name:'Bob 独立分类'}}},200,bob)).data;
await request('/api/book','POST',{ownerId:bobCurrent.ownerId,revision:bobCurrent.revision,command:{type:'category.archive',id:customCategory,archived:true}},200,bob);
await current();assert.equal(book.categories.find(c=>c.id===customCategory).archived,false);
await mutate({type:'category.archive',id:customCategory,archived:true});
await mutate({type:'transaction.save',id:randomUUID(),input:transaction({category:customCategory})},400);
await mutate({type:'transaction.save',id:categorized,input:transaction({category:customCategory,amount:700,note:'分类持久化测试'})});
await mutate({type:'category.delete',id:customCategory},400);
await mutate({type:'category.delete',id:'food'},400);
await mutate({type:'category.archive',id:customCategory,archived:false});
const reordered=book.categories.filter(c=>c.kind==='expense').sort((a,b)=>a.order-b.order).map(c=>c.id).reverse();
const transactionsBeforeOrder=structuredClone(book.transactions);
await mutate({type:'category.reorder',kind:'expense',ids:reordered});
assert.deepEqual(book.transactions,transactionsBeforeOrder);
assert.deepEqual(book.categories.filter(c=>c.kind==='expense').sort((a,b)=>a.order-b.order).map(c=>c.id),reordered);
await mutate({type:'category.reorder',kind:'expense',ids:['food']},400);
await mutate({type:'category.save',category:{...definition,id:randomUUID(),name:'购物'}},400);
await mutate({type:'category.save',category:{...definition,kind:'income'}},400);
const salary=book.categories.find(c=>c.id==='工资');
await mutate({type:'category.save',category:{...salary,name:'薪资'}});
const salaryTransaction=randomUUID();
await mutate({type:'transaction.save',id:salaryTransaction,input:transaction({kind:'income',from:'',to:bank,category:'工资',amount:200000})});
assert.equal(book.transactions.find(t=>t.id===salaryTransaction).entries[1].accountId,'income:工资');
const unused=randomUUID();await mutate({type:'category.save',category:{...definition,id:unused,name:'可删除分类'}});
await mutate({type:'category.delete',id:unused});assert.equal(book.categories.some(c=>c.id===unused),false);
console.log('PASS category presets, stable journals after rename, archive/restore, order, income, delete guards and cross-user isolation');

const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
 const counts=await pool.query('select (select count(*) from users)::int as users,(select count(*) from books)::int as books');assert.equal(counts.rows[0].users,3);assert.equal(counts.rows[0].books,3);
 const unbalanced=await pool.query('select transaction_id from journal_entries group by transaction_id having sum(amount) <> 0 or count(*) <> 2');assert.equal(unbalanced.rowCount,0);
 const client=await pool.connect();try{
  await client.query('begin');const bad=randomUUID();
  const owned=await client.query('select id from books where user_id=$1',[aliceOwner]);
  await client.query('insert into transactions (id,book_id,kind,amount,date,category) values ($1,$2,$3,$4,$5,$6)',[bad,owned.rows[0].id,'expense',100,today,'food']);
  await client.query('insert into journal_entries (transaction_id,position,account_id,amount) values ($1,0,$2,100)',[bad,bank]);
  await assert.rejects(client.query('commit'),e=>e.code==='23514');await client.query('rollback');
 }finally{client.release();}
 const logout=await request('/api/auth/logout','POST',{});assert.equal(new URL(logout.data.url).hostname,'mock-oidc');
 await request('/api/book','GET',undefined,401,alice);
 assert.equal((await request('/api/book','GET',undefined,200,bob)).data.ownerId,bobCurrent.ownerId);
 writeFileSync('/tmp/yu-test-session',aliceAgain,{mode:0o600});
 console.log('PASS PostgreSQL journal constraints, local logout revocation and other users stay logged in');
}finally{await pool.end();}
console.log('PASS multi-user OIDC integration complete');
