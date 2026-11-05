import { logServerError, requestContext } from "@/lib/logging";
import { connection, NextResponse } from "next/server";
import { finishOidcLogin } from "@/lib/oidc";

export async function GET(request: Request) {
  await connection();
  try {
    await finishOidcLogin(request);
    return NextResponse.redirect(new URL("/", process.env.APP_ORIGIN!), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const context = requestContext(request, "oidc.callback_failed");
    logServerError(error, context);
    const canceled = new URL(request.url).searchParams.get("error") === "access_denied";
    return NextResponse.redirect(new URL(`/login?error=${canceled ? "canceled" : "failed"}`, process.env.APP_ORIGIN!), { headers: { "X-Request-Id": context.requestId, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
