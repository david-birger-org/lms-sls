import type { ContactRequestType } from "../../src/lib/contact-requests/index.js";
import {
  insertContactRequest,
  toContactRequestRecord,
} from "../../src/lib/contact-requests/index.js";
import { env } from "../../src/lib/env.js";
import { getErrorMessage } from "../../src/lib/errors.js";
import { json } from "../../src/lib/response.js";

interface ContactRequestPayload {
  requestType?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  country?: unknown;
  phone?: unknown;
  preferredContactMethod?: unknown;
  social?: unknown;
  message?: unknown;
  service?: unknown;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRequestType(value: unknown): ContactRequestType | null {
  return value === "contact" || value === "service" ? value : null;
}

function parsePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const payload = body as ContactRequestPayload;
  const requestType = parseRequestType(payload.requestType);
  if (!requestType) return null;

  return {
    requestType,
    firstName: normalizeString(payload.firstName),
    lastName: normalizeString(payload.lastName),
    email: normalizeString(payload.email),
    country: normalizeString(payload.country),
    phone: normalizeString(payload.phone),
    preferredContactMethod: normalizeString(payload.preferredContactMethod),
    social: normalizeString(payload.social),
    message: normalizeString(payload.message),
    service: normalizeString(payload.service),
  };
}

export async function POST(request: Request) {
  const internalApiKey = request.headers.get("x-internal-api-key")?.trim();
  if (!internalApiKey || internalApiKey !== env.internalApiKey)
    return json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = parsePayload(body);

  if (!input)
    return json(
      { error: "Invalid payload. requestType must be 'contact' or 'service'." },
      { status: 400 },
    );

  try {
    const row = await insertContactRequest(input);
    return json({ request: toContactRequestRecord(row) }, { status: 201 });
  } catch (error) {
    return json(
      { error: `Failed to save contact request: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
