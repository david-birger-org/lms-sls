import { requireInternalApiKey } from "../../src/lib/auth";
import { fetchStatement, getRangeDays } from "../../src/lib/monobank";
import { json } from "../../src/lib/response";

export async function GET(request: Request) {
  const unauthorizedResponse = requireInternalApiKey(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const requestUrl = new URL(request.url);
    const safeDays = getRangeDays(requestUrl.searchParams);
    const items = await fetchStatement(safeDays);

    return json({ list: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return json(
      { error: `Failed to load statement: ${message}` },
      { status: 500 },
    );
  }
}
