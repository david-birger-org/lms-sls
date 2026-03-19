import { json } from "./response";

export function requireInternalApiKey(request: Request) {
  const expectedApiKey = process.env.INTERNAL_API_KEY?.trim();

  if (!expectedApiKey) {
    return json(
      { error: "INTERNAL_API_KEY is missing in environment variables." },
      { status: 500 },
    );
  }

  const providedApiKey = request.headers.get("x-internal-api-key")?.trim();

  if (providedApiKey !== expectedApiKey) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}
