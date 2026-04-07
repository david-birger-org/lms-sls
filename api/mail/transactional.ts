import { env } from "../../src/lib/env.js";
import { sendTransactionalMail } from "../../src/lib/mailer.js";
import { json } from "../../src/lib/response.js";

interface TransactionalMailPayload {
  subject?: unknown;
  text?: unknown;
  replyTo?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTransactionalMailPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const payload = body as TransactionalMailPayload;
  if (!isNonEmptyString(payload.subject) || !isNonEmptyString(payload.text))
    return null;

  return {
    replyTo: isNonEmptyString(payload.replyTo) ? payload.replyTo : undefined,
    subject: payload.subject,
    text: payload.text,
  };
}

export async function POST(request: Request) {
  const internalApiKey = request.headers.get("x-internal-api-key")?.trim();

  if (!internalApiKey || internalApiKey !== env.internalApiKey)
    return json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payload = parseTransactionalMailPayload(body);

  if (!payload) return json({ error: "Invalid payload." }, { status: 400 });

  const result = await sendTransactionalMail({
    subject: payload.subject,
    text: payload.text,
    replyTo: payload.replyTo,
  });

  if (result.ok) return json({ ok: true });

  if (
    result.reason === "missing_config" ||
    result.reason === "missing_destination"
  )
    return json(
      { error: "Email provider is not configured." },
      { status: 500 },
    );

  console.error("Failed to send transactional mail", result.error);
  return json({ error: "Failed to send mail." }, { status: 502 });
}
