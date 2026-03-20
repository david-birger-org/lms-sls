import { requireAuthenticatedAdmin } from "../../src/lib/auth";
import { getErrorMessage } from "../../src/lib/errors";
import { fetchStatement, getRangeDays } from "../../src/lib/monobank";
import { json } from "../../src/lib/response";

export async function GET(request: Request) {
  const access = await requireAuthenticatedAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const requestUrl = new URL(request.url);
    const safeDays = getRangeDays(requestUrl.searchParams);
    const items = await fetchStatement(safeDays);

    return json({ list: items });
  } catch (error) {
    return json(
      { error: `Failed to load statement: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
