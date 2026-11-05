import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import * as oidc from "openid-client";
import { getDb } from "@/db";
import { books, categories, oidcFlows, users } from "@/db/schema";
import { createSession, digest } from "./auth";
import { HttpError } from "./http";
import { defaultCategories } from "@/features/book/categories";

const flowCookie = process.env.APP_ORIGIN?.startsWith("https://") ? "__Host-yu-oidc-flow" : "yu-oidc-flow";
let configuration: Promise<oidc.Configuration> | undefined;

export function oidcConfigured() {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.APP_ORIGIN);
}

export function getOidcConfig() {
  if (!oidcConfigured()) throw new HttpError(503, "账号中心暂未连接，请稍后再试");
  if (!configuration) {
    const issuer = new URL(process.env.OIDC_ISSUER!);
    const insecure = process.env.OIDC_ALLOW_INSECURE_HTTP === "true" && process.env.APP_ORIGIN?.startsWith("http://");
    if (issuer.protocol !== "https:" && !insecure) throw new HttpError(503, "账号中心需要 HTTPS 连接");
    configuration = oidc.discovery(issuer, process.env.OIDC_CLIENT_ID!, { client_secret: process.env.OIDC_CLIENT_SECRET! }, oidc.ClientSecretBasic(process.env.OIDC_CLIENT_SECRET!), {
      timeout: 10,
      execute: [oidc.enableNonRepudiationChecks, ...(insecure ? [oidc.allowInsecureRequests] : [])],
    }).catch((error) => { configuration = undefined; throw error; });
  }
  return configuration;
}

export function callbackUrl() {
  return new URL("/api/auth/callback/oidc", process.env.APP_ORIGIN!).href;
}

export async function startOidcLogin() {
  const config = await getOidcConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const token = randomBytes(32).toString("hex");
  const jar = await cookies();
  const old = jar.get(flowCookie)?.value;
  const db = getDb();
  await db.delete(oidcFlows).where(lt(oidcFlows.expiresAt, new Date()));
  if (old) await db.delete(oidcFlows).where(eq(oidcFlows.tokenHash, digest(old)));
  await db.insert(oidcFlows).values({ tokenHash: digest(token), state, verifier, nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  jar.set(flowCookie, token, { httpOnly: true, secure: process.env.APP_ORIGIN!.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 600 });
  return oidc.buildAuthorizationUrl(config, { redirect_uri: callbackUrl(), scope: "openid profile email", response_type: "code", code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256", state, nonce });
}

export async function finishOidcLogin(request: Request) {
  const jar = await cookies();
  const token = jar.get(flowCookie)?.value;
  const query = new URL(request.url).searchParams;
  if (!token || !/^[a-f0-9]{64}$/.test(token) || query.getAll("state").length !== 1) throw new HttpError(400, "登录请求已过期，请重新登录");
  const [flow] = await getDb().delete(oidcFlows).where(and(eq(oidcFlows.tokenHash, digest(token)), eq(oidcFlows.state, query.get("state")!), gt(oidcFlows.expiresAt, new Date()))).returning();
  if (!flow) throw new HttpError(400, "登录请求已过期，请重新登录");
  jar.delete(flowCookie);
  const config = await getOidcConfig();
  const url = new URL(callbackUrl());
  url.search = query.toString();
  const tokens = await oidc.authorizationCodeGrant(config, url, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 512) throw new HttpError(400, "账号中心未返回有效身份");
  // Email and display name are profile data only. Never link accounts by email.
  const name = [claims.name, claims.preferred_username, claims.email].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const user = await getDb().transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ id: randomUUID(), issuer: config.serverMetadata().issuer, subject: claims.sub, name: (name ?? "记账人").slice(0, 100), email: typeof claims.email === "string" ? claims.email.slice(0, 320) : null })
      .onConflictDoUpdate({ target: [users.issuer, users.subject], set: { name: (name ?? "记账人").slice(0, 100), email: typeof claims.email === "string" ? claims.email.slice(0, 320) : null } }).returning();
    const [created] = await tx.insert(books).values({ id: randomUUID(), userId: user.id }).onConflictDoNothing({ target: books.userId }).returning({ id: books.id });
    if (created) await tx.insert(categories).values(defaultCategories().map((c) => ({ ...c, bookId: created.id })));
    return user;
  });
  // Access/refresh/ID tokens are not retained in our session or sent to the browser.
  await createSession(user.id);
}

export async function endSessionUrl() {
  const config = await getOidcConfig();
  if (!config.serverMetadata().end_session_endpoint) return new URL("/login", process.env.APP_ORIGIN!).href;
  return oidc.buildEndSessionUrl(config, { post_logout_redirect_uri: new URL("/login", process.env.APP_ORIGIN!).href }).href;
}
