import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { getPaymentDetailsByInvoiceId } from "../../src/lib/invoice-store.js";
import { listPaymentHistory } from "../../src/lib/invoice-store.js";
import { getRangeDays } from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const invoiceId = requestUrl.searchParams.get("invoiceId")?.trim();

    if (invoiceId) {
      const payment = await getPaymentDetailsByInvoiceId(invoiceId);

      if (!payment) {
        return json({ error: "Payment not found." }, { status: 404 });
      }

      return json(payment);
    }

    const safeDays = getRangeDays(requestUrl.searchParams);

    return json({ list: await listPaymentHistory(safeDays) });
  } catch (error) {
    const message = getErrorMessage(error);

    return json(
      {
        error: request.url.includes("invoiceId=")
          ? `Failed to load payment details: ${message}`
          : `Failed to load payment history: ${message}`,
      },
      { status: 500 },
    );
  }
});
