// Large-book regression, only in the disposable integration stack.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
if (!process.env.DATABASE_URL?.endsWith('/yu_test') || process.env.KEYCLOAK_ISSUER !== 'http://mock-oidc:3102') throw new Error('Isolated test environment required');
const base = process.env.YU_TEST_BASE_URL || 'http://127.0.0.1:3000';
const start = await fetch(base + '/api/auth/signin/keycloak', { redirect: 'manual' });
const flow = start.headers.getSetCookie().find(v => v.startsWith('yu-oidc-flow=')).split(';')[0];
const authorization = new URL(start.headers.get('location'));
authorization.searchParams.set('test_subject', 'scale-' + randomUUID());
const authorized = await fetch(authorization, { redirect: 'manual' });
const callback = new URL(authorized.headers.get('location'));
const loggedIn = await fetch(base + callback.pathname + callback.search, { redirect: 'manual', headers: { Cookie: flow } });
const cookie = loggedIn.headers.getSetCookie().find(v => v.startsWith('yu-session=')).split(';')[0];
let book = await (await fetch(base + '/api/book', { headers: { Cookie: cookie } })).json();
async function mutate(command) {
  const response = await fetch(base + '/api/book', { method: 'POST', headers: { Cookie: cookie, Origin: process.env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId: book.ownerId, revision: book.revision, command }) });
  assert.equal(response.status, 200, await response.clone().text().then(text => text.slice(0, 500)));
  book = await response.json();
}
const account = randomUUID();
await mutate({ type: 'account.save', account: { id: account, name: 'Scale bank', type: 'bank', note: '' }, balance: 0, date: '2026-11-04' });
const input = { kind: 'expense', amount: 100, date: '2026-11-04', category: 'food', from: account, to: '', note: 'Synthetic scale test', reimbursable: false };
await mutate({ type: 'import.commit', id: randomUUID(), source: 'wechat', filename: 'synthetic-500.csv', rows: Array.from({ length: 500 }, (_, i) => ({ id: randomUUID(), key: 'order-' + i, sourceAccount: account, input })) });
assert.equal(book.transactions.length, 500);
assert.equal(book.imports[0].items.length, 500);
console.log('PASS 500-row atomic batch import and receipts');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const count = 66000; // Exceeds the old per-ID SQL bind parameter limit.
try {
  const { rows: [head] } = await client.query('select id from books where user_id=$1', [book.ownerId]);
  const prefix = 'scale-' + randomUUID() + '-';
  await client.query('BEGIN');
  await client.query("insert into transactions (id,book_id,kind,amount,date,category,from_account) select $1||n,$2,'expense',100,'2026-11-04','food',$3 from generate_series(1,$4::int) n", [prefix, head.id, account, count]);
  await client.query("insert into journal_entries (transaction_id,position,account_id,amount) select $1||n,0,$2,-100 from generate_series(1,$3::int) n union all select $1||n,1,'expense:food',100 from generate_series(1,$3::int) n", [prefix, account, count]);
  await client.query('update books set revision=revision+1 where id=$1', [head.id]);
  await client.query('COMMIT');
  const started = performance.now();
  const full = await fetch(base + '/api/book', { headers: { Cookie: cookie } });
  assert.equal(full.status, 200);
  book = await full.json();
  assert.equal(book.transactions.length, count + 500);
  assert.ok(book.transactions.every(t => t.entries.length === 2 && t.entries[0].amount + t.entries[1].amount === 0));
  const etag = full.headers.get('etag');
  assert.ok(etag);
  const unchanged = await fetch(base + '/api/book', { headers: { Cookie: cookie, 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  await mutate({ type: 'transaction.save', id: randomUUID(), input });
  assert.equal(book.transactions.length, count + 501);
  const changed = await fetch(base + '/api/book', { headers: { Cookie: cookie, 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), etag);
  await changed.arrayBuffer();
  console.log(JSON.stringify({ result: 'PASS large-book read, write and conditional sync', transactions: count + 501, elapsedMs: Math.round(performance.now() - started) }));
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
