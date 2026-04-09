import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { listRecentPaymentsByCustomerName } from "../../src/lib/invoice-store.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const customerName = requestUrl.searchParams.get("customerName")?.trim();

    if (!customerName)
      return json({ error: "customerName is required." }, { status: 400 });

    const list = await listRecentPaymentsByCustomerName(customerName);
    return json({ list });
  } catch (error) {
    return json(
      { error: `Failed to check duplicates: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});
