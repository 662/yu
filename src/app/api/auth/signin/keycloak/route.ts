import { logServerError, requestContext } from "@/lib/logging";
import { connection, NextResponse } from "next/server";
import { throttleAuth } from "@/lib/auth";
import { startOidcLogin } from "@/lib/oidc";

export async function GET(request: Request) {
  await connection();
  try {
    await throttleAuth(request);
    return NextResponse.redirect(await startOidcLogin(), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const context = requestContext(request, "oidc.signin_failed");
    logServerError(error, context);
    return NextResponse.redirect(new URL("/login?error=unavailable", process.env.APP_ORIGIN!), { headers: { "X-Request-Id": context.requestId, "Cache-Control": "no-store" } });
  }
}
