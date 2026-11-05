import { destroySession } from "@/lib/auth";
import { apiError, checkOrigin, HttpError } from "@/lib/http";
import { endSessionUrl } from "@/lib/oidc";

export async function POST(request: Request, context: RouteContext<"/api/auth/[action]">) {
  try {
    checkOrigin(request);
    if ((await context.params).action !== "logout") throw new HttpError(404, "请使用账号中心登录");
    await destroySession();
    // Local logout still succeeds if Keycloak is temporarily unavailable.
    const url = await endSessionUrl().catch(() => new URL("/login", process.env.APP_ORIGIN!).href);
    return Response.json({ url });
  } catch (error) { return apiError(error, request); }
}
