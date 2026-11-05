import "server-only";
import { logServerError } from "@/lib/logging";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { dbPool?: Pool };

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  if (!globalForDb.dbPool) {
    const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    });
    pool.on("error", (error) => {
      // An idle connection can disappear when PostgreSQL restarts; pg will
      // replace it on the next request without terminating the application.
      logServerError(error, { event: "db.idle_connection_failed" });
    });
    globalForDb.dbPool = pool;
  }

  return drizzle(globalForDb.dbPool, { schema });
}
