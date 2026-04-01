import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { getRangeDays } from "../../src/lib/monobank.js";
import { listPaymentHistory } from "../../src/lib/persistence.js";
import { json } from "../../src/lib/response.js";

export async function GET(request: Request) {
  const access = await requireTrustedInternalAdmin(request);

  if (!access.ok) {
    return access.response;
  }

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
}
