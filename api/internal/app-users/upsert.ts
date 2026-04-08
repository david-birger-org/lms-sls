import { env } from "../../../src/lib/env.js";
import { mirrorAuthUserToAppUsers } from "../../../src/lib/invoice-store.js";
import { json } from "../../../src/lib/response.js";

interface UpsertAppUserPayload {
  authUserId?: unknown;
  email?: unknown;
  fullName?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  const internalApiKey = request.headers.get("x-internal-api-key")?.trim();
  if (!internalApiKey || internalApiKey !== env.internalApiKey)
    return json({ error: "Unauthorized." }, { status: 401 });

  let body: UpsertAppUserPayload;
  try {
    body = (await request.json()) as UpsertAppUserPayload;
  } catch {
    return json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!isNonEmptyString(body.authUserId))
    return json({ error: "authUserId is required." }, { status: 400 });

  const email = isNonEmptyString(body.email) ? body.email : null;
  const fullName = isNonEmptyString(body.fullName)
    ? body.fullName
    : email?.split("@")[0] || body.authUserId;

  try {
    const appUserId = await mirrorAuthUserToAppUsers({
      authUserId: body.authUserId,
      email,
      fullName,
    });
    return json({ appUserId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: `Failed to upsert app user: ${message}` },
      { status: 500 },
    );
  }
}
