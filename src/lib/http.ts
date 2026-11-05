import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logServerError, requestContext } from "./logging";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function checkOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new HttpError(503, "账本尚未完成部署配置");
  if (request.headers.get("origin") !== new URL(origin).origin) throw new HttpError(403, "请求来源不受信任，请从账本页面重新操作");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "仅支持 JSON 请求");
}

export async function readJson(request: Request, limit = 32768): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请求内容为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "单次请求内容过大"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "请求内容格式不正确"); }
}

export function apiError(error: unknown, request?: Request) {
  const context = request ? requestContext(request, "api.request_failed") : { event: "api.request_failed", requestId: randomUUID() };
  const headers = { "X-Request-Id": context.requestId, "Cache-Control": "private, no-store" };
  if (error instanceof HttpError) return Response.json({ error: error.message, requestId: context.requestId }, { status: error.status, headers });
  if (error instanceof z.ZodError) return Response.json({ error: "填写内容不完整或格式有误，请检查后重试", requestId: context.requestId }, { status: 400, headers });
  logServerError(error, context);
  return Response.json({ error: "暂时无法连接账本，请稍后重试。请核对账目后再提交。", requestId: context.requestId }, { status: 503, headers });
}
