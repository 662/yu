import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { logServerError } from "./logging";
import { apiError } from "./http";

test("数据库包装错误保留错误码与调用栈，排除 SQL、参数和密钥", () => {
  const output: string[] = [];
  const spy = mock.method(console, "error", (line: string) => output.push(line));
  try {
    const cause = Object.assign(new Error("private account amount password"), { code: "23505", detail: "private details" });
    const error = new Error("Failed query: insert private SQL", { cause });
    logServerError(error, { event: "test.failure", requestId: "trace-id" });
    const entry = JSON.parse(output[0]);
    assert.equal(entry.requestId, "trace-id");
    assert.equal(entry.errors[1].code, "23505");
    assert.match(entry.errors[0].stack, /logging.test.ts/);
    assert.doesNotMatch(output[0], /private|password|Failed query/);
  } finally { spy.mock.restore(); }
});

test("服务端错误返回可关联的请求编号，不回显异常或查询参数", async () => {
  const output: string[] = [];
  const spy = mock.method(console, "error", (line: string) => output.push(line));
  try {
    const response = apiError(new Error("secret-value"), new Request("https://book.example/api/book?code=secret-value"));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("X-Request-Id"), body.requestId);
    assert.equal(JSON.parse(output[0]).requestId, body.requestId);
    assert.doesNotMatch(output[0] + JSON.stringify(body), /secret-value/);
    assert.equal(JSON.parse(output[0]).path, "/api/book");
  } finally { spy.mock.restore(); }
});
