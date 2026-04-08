import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import {
  fetchStatement,
  getStatementRange,
  InvalidStatementRangeError,
} from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const range = getStatementRange(requestUrl.searchParams);
    const items = await fetchStatement(range);

    return json({ list: items });
  } catch (error) {
    if (error instanceof InvalidStatementRangeError)
      return json({ error: error.message }, { status: 400 });

    return json(
      { error: `Failed to load statement: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});
