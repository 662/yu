import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, readJson } from "@/lib/http";
import { requestSchema } from "@/features/book/commands";
import { getBookConditional, mutateBook, MutationError, RevisionConflict } from "@/features/book/repository";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireSession();
    const { book, etag } = await getBookConditional(user.id, request.headers.get("if-none-match"));
    const headers = { "Cache-Control": "private, no-store", ETag: etag, Vary: "Cookie" };
    return book ? Response.json(book, { headers }) : new Response(null, { status: 304, headers });
  } catch (error) { return apiError(error, request); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireSession();
    const { command, revision, ownerId } = requestSchema.parse(await readJson(request, 1024 * 1024));
    if (ownerId !== user.id) return Response.json({ error: "登录账号已变更，请刷新页面重新打开账本。", code: "account_changed" }, { status: 409 });
    try {
      return Response.json(await mutateBook(user.id, command, revision));
    } catch (error) {
      if (error instanceof RevisionConflict) return Response.json({ error: error.message, book: error.book }, { status: 409 });
      if (error instanceof MutationError) throw new HttpError(400, error.message);
      throw error;
    }
  } catch (error) { return apiError(error, request); }
}
