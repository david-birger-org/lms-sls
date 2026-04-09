import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import {
  getPaymentDetailsByInvoiceId,
  listPaymentHistory,
  listRecentPaymentsByCustomerName,
} from "../../src/lib/invoice-store.js";
import {
  getStatementRange,
  InvalidStatementRangeError,
} from "../../src/lib/monobank.js";
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

    const customerName = requestUrl.searchParams.get("customerName")?.trim();

    if (customerName)
      return json({
        list: await listRecentPaymentsByCustomerName(customerName),
      });

    const range = getStatementRange(requestUrl.searchParams);

    return json({ list: await listPaymentHistory(range) });
  } catch (error) {
    if (error instanceof InvalidStatementRangeError)
      return json({ error: error.message }, { status: 400 });

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
