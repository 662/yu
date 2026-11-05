// Exercise the migration contract only in the disposable integration stack.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL?.endsWith('/yu_test') || process.env.OIDC_ISSUER !== 'http://mock-oidc:3102') throw new Error('Isolated test environment required');
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const name = 'yu_baseline_' + randomUUID().replaceAll('-', '');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + name;
const pool = new Pool({ connectionString: url.href });
const folder = await mkdtemp(join(tmpdir(), 'yu-migrations-'));
try {
  await admin.query(`CREATE DATABASE ${name}`);
  const db = drizzle(pool);
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
  await migrate(db, { migrationsFolder: 'drizzle' });
  await pool.query("INSERT INTO users (id,issuer,subject,name) VALUES ('baseline-user','test','test','test')");
  await migrate(db, { migrationsFolder: 'drizzle' });
  assert.equal((await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rowCount, 1);

  // Completed pre-0.1 databases have a different hash at the same timestamp.
  // Drizzle must skip the baseline and retain existing data and journal rows.
  await pool.query("UPDATE drizzle.__drizzle_migrations SET hash='pre-0.1-completed-history'");
  await migrate(db, { migrationsFolder: 'drizzle' });
  assert.equal((await pool.query('SELECT * FROM users')).rowCount, 1);
  assert.equal((await pool.query('SELECT hash FROM drizzle.__drizzle_migrations')).rows[0].hash, 'pre-0.1-completed-history');

  // A later generated migration must run on either journal history.
  await mkdir(join(folder, 'meta'));
  await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: [
    ...journal.entries,
    { idx: 1, version: '7', when: journal.entries[0].when + 1, tag: '0001_probe', breakpoints: true },
  ] }));
  await writeFile(join(folder, '0000_baseline.sql'), await readFile('drizzle/0000_baseline.sql'));
  await writeFile(join(folder, '0001_probe.sql'), 'CREATE TABLE baseline_probe (id integer PRIMARY KEY);');
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  assert.equal((await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rowCount, 2);
  assert.equal((await pool.query('SELECT * FROM baseline_probe')).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM users')).rowCount, 1);
  console.log('PASS baseline bootstrap, repeat runs, existing database handover and later migration');
} finally {
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  await rm(folder, { recursive: true, force: true });
}
