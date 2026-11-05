import { logServerError } from "../src/lib/logging";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await pool.query("select 1");
    if (!existsSync("drizzle/meta/_journal.json")) {
      console.log("数据库连接成功，当前尚无迁移。");
      return;
    }
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("数据库迁移完成。");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  logServerError(error, { event: "db.migration_failed" });
  console.error("数据库迁移失败，请检查数据库连接与迁移文件。");
  process.exitCode = 1;
});
