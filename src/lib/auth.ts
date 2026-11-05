import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authAttempts, sessions, users } from "@/db/schema";
import { HttpError } from "./http";

export const cookieName = process.env.APP_ORIGIN?.startsWith("https://") ? "__Host-yu-session" : "yu-session";
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export type AuthUser = { id: string; name: string; email: string | null; issuer: string; subject: string };

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [user] = await getDb().select({ id: users.id, name: users.name, email: users.email, issuer: users.issuer, subject: users.subject })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())));
  if (!user || user.issuer !== process.env.OIDC_ISSUER) return null;
  return user;
}

export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "登录已过期，请重新登录");
  return user;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const maxAge = 60 * 60 * 8;
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await getDb().insert(sessions).values({ tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + maxAge * 1000) });
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.APP_ORIGIN?.startsWith("https://") ?? true, sameSite: "lax", path: "/", maxAge });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, digest(token)));
  jar.delete(cookieName);
}

export async function throttleAuth(request: Request) {
  const db = getDb();
  const address = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim().slice(0, 128) || "local";
  const key = digest(`oidc:${address}`);
  await db.delete(authAttempts).where(lt(authAttempts.expiresAt, new Date()));
  const [attempt] = await db.insert(authAttempts).values({ key, count: 1, expiresAt: new Date(Date.now() + 15 * 60 * 1000) })
    .onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } }).returning();
  if (attempt.count > 100) throw new HttpError(429, "登录尝试较多，请稍后再试");
}
