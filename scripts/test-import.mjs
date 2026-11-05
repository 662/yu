// Isolated OIDC + PostgreSQL integration suite. Never point this at a real book.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const alice=await login('alice'),bob=await login('bob');cookie=alice;
book=(await request('/api/book')).data;
const bobBook=(await request('/api/book','GET',undefined,200,bob)).data;
const bank=book.accounts.find(a=>a.type==='bank').id,bobBank=bobBook.accounts.find(a=>a.type==='bank').id;
const initial=structuredClone(book.transactions);
const mutate=async(command,expected=200,revision=book.revision,session=alice,owner=book.ownerId)=>{
 const {data}=await request('/api/book','POST',{ownerId:owner,revision,command},expected,session);
 if(expected===200&&session===alice)book=data;return data;
};
const row=(overrides={})=>({key:'test-order-'+randomUUID(),sourceAccount:bank,id:randomUUID(),input:{kind:'expense',amount:1234,date:'2026-11-04',category:'food',from:bank,to:'',note:'导入集成测试',reimbursable:false},...overrides});
const a=row(),b=row({input:{...row().input,kind:'income',from:'',to:bank,category:'工资',amount:4567}});
const command={type:'import.commit',id:randomUUID(),source:'wechat',filename:'合成测试.csv',rows:[a,b]};
const priorRevision=book.revision;
await mutate({...command,rows:[a,{...b,input:{...b.input,to:bobBank}}]},400);
assert.deepEqual((await request('/api/book')).data.transactions,initial);
await mutate(command);assert.equal(book.transactions.length,initial.length+2);
const batchId=command.id;
let fresh=(await request('/api/book')).data;assert.equal(fresh.imports.find(i=>i.id===batchId).items.length,2);
assert.ok(fresh.transactions.find(t=>t.id===a.id).entries.every(e=>Number.isInteger(e.amount)));
await mutate(command,409,priorRevision); // concurrent/stale retries cannot partially write
await mutate(command);assert.equal(book.transactions.length,initial.length+2); // current-revision retry is idempotent
await mutate({...command,id:randomUUID(),rows:[{...a,id:randomUUID()}]},400);
await mutate({type:'import.rollback',id:batchId},400,bobBook.revision,bob,bobBook.ownerId);
assert.equal((await request('/api/book','GET',undefined,200,bob)).data.imports.some(i=>i.id===batchId),false);
const bobCommand={...command,id:randomUUID(),rows:[{...a,id:randomUUID(),sourceAccount:bobBank,input:{...a.input,from:bobBank}}]};
await mutate(bobCommand,200,bobBook.revision,bob,bobBook.ownerId);
console.log('PASS atomic database import, balanced entries, receipt persistence, stale revision, safe retry, duplicate prevention and user isolation');
await mutate({type:'transaction.save',id:a.id,input:{...a.input,note:'已经手动修改'}});
await mutate({type:'import.rollback',id:batchId},400);
await mutate({type:'transaction.save',id:a.id,input:a.input});
await mutate({type:'import.rollback',id:batchId});assert.deepEqual(book.transactions,initial);assert.equal(book.imports.find(i=>i.id===batchId).rolledBack,true);
await mutate({...command,id:randomUUID()});
const again=book.imports.at(-1);await mutate({type:'import.rollback',id:again.id});
assert.deepEqual((await request('/api/book')).data.transactions,initial);
console.log('PASS rollback protects edited rows, restores exact original transactions and releases receipt keys for reimport');
