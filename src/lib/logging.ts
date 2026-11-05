import { randomUUID } from "node:crypto";

type ErrorContext = { event: string; requestId?: string; method?: string; path?: string };

export function requestContext(request: Request, event: string): ErrorContext & { requestId: string } {
  return { event, requestId: randomUUID(), method: request.method, path: new URL(request.url).pathname };
}

function redact(value: string): string {
  let result = value.replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s)]+/gi, "[redacted-url]");
  for (const [key, secret] of Object.entries(process.env)) {
    if (/(?:SECRET|PASSWORD|TOKEN|DATABASE_URL)/i.test(key) && secret && secret.length >= 4) result = result.split(secret).join("[redacted]");
  }
  return result.slice(0, 6000);
}

// Never log SQL, parameters, request bodies, cookies, OIDC codes, or error messages.
// Drizzle wraps pg errors in `cause`; retain codes and call sites from that chain.
export function logServerError(error: unknown, context: ErrorContext) {
  const errors: { name: string; code?: string; stack?: string }[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current) && errors.length < 5) {
    seen.add(current);
    const code = "code" in current && typeof current.code === "string" && /^[A-Z0-9_]{1,64}$/i.test(current.code) ? current.code : undefined;
    const frames = current.stack?.split("\n").filter(line => /^\s+at .+:\d+:\d+\)?$/.test(line)).slice(0, 12).join("\n");
    errors.push({ name: /^[\w.]{1,80}$/.test(current.name) ? current.name : "Error", code, stack: frames ? redact(frames) : undefined });
    current = current.cause;
  }
  console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), ...context, errors: errors.length ? errors : [{ name: "UnknownError" }] }));
}
