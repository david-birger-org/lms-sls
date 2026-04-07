import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { listPaymentHistory } from "../../src/lib/invoice-store.js";
import { getRangeDays } from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const safeDays = getRangeDays(requestUrl.searchParams);

    return json({ list: await listPaymentHistory(safeDays) });
  } catch (error) {
    return json(
      { error: `Failed to load payment history: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});
