import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { fetchStatement, getRangeDays } from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
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
});
