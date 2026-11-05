// Validate 0002 against a populated old-schema database without touching real data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client,Pool} from 'pg';
if(!process.env.DATABASE_URL?.endsWith('/yu_test')||process.env.KEYCLOAK_ISSUER!=='http://mock-oidc:3102')throw new Error('Isolated test environment required');
const admin=new Pool({connectionString:process.env.DATABASE_URL});
const name='yu_migration_'+randomUUID().replaceAll('-','');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
let client;
try {
 await admin.query(`CREATE DATABASE ${name}`);
 client=new Client({connectionString:url.href});
 await client.connect();
 await client.query('BEGIN');
 for(const file of ['0000_simple_thunderbird.sql','0001_crazy_ben_parker.sql'])await client.query(readFileSync('drizzle/'+file,'utf8'));
 await client.query('COMMIT');
 const user=randomUUID(),book=randomUUID(),account=randomUUID();
 await client.query('insert into users (id,issuer,subject,name) values ($1,$2,$3,$4)',[user,'http://mock-oidc:3102','legacy','旧用户']);
 await client.query('insert into books (id,user_id,revision) values ($1,$2,7)',[book,user]);
 await client.query('insert into accounts (id,book_id,name,type,opening_balance) values ($1,$2,$3,$4,100000)',[account,book,'原有银行卡','bank']);
 for(const[kind,category,amount]of[['expense','food',3500],['income','工资',100000],['expense','legacy-custom',500]]){
  const id=randomUUID();await client.query('BEGIN');
  await client.query('insert into transactions (id,book_id,kind,amount,date,category,from_account,to_account) values ($1,$2,$3,$4,$5,$6,$7,$8)',[id,book,kind,amount,'2026-11-03',category,kind==='expense'?account:'',kind==='income'?account:'']);
  await client.query('insert into journal_entries (transaction_id,position,account_id,amount) values ($1,0,$2,$3),($1,1,$4,$5)',[id,account,kind==='expense'?-amount:amount,kind+':'+category,kind==='expense'?amount:-amount]);
  await client.query('COMMIT');
 }
 const snapshot=async()=>Promise.all(['accounts','transactions','journal_entries','books'].map(async table=>(await client.query(`select * from ${table} order by 1,2`)).rows));
 const before=await snapshot();
 await client.query('BEGIN');await client.query(readFileSync('drizzle/0002_nebulous_stephen_strange.sql','utf8'));await client.query('COMMIT');
 assert.deepEqual(await snapshot(),before);
 const {rows}=await client.query('select * from categories where book_id=$1',[book]);
 assert.equal(rows.filter(c=>c.is_preset).length,11);
 assert.equal(rows.find(c=>c.id==='food').name,'餐饮');
 assert.equal(rows.find(c=>c.id==='工资').name,'工资');
 assert.equal(rows.find(c=>c.id==='legacy-custom').archived,true);
 console.log('PASS category migration preserves all existing accounts, transactions, journal entries and revisions; seeds presets and preserves legacy categories');
}finally{
 if(client)await client.end();
 await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
 await admin.end();
}
