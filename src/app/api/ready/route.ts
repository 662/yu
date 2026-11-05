import { logServerError, requestContext } from "@/lib/logging";
import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

export async function GET(request: Request) {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    logServerError(error, requestContext(request, "db.readiness_failed"));
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
