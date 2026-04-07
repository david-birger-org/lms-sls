import { getErrorMessage } from "../../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import { listPendingInvoices } from "../../../src/lib/invoice-store.js";
import { syncMonobankPaymentStatus } from "../../../src/lib/invoice-store.js";
import { fetchInvoiceStatus } from "../../../src/lib/monobank.js";
import { json } from "../../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const invoiceId = requestUrl.searchParams.get("invoiceId")?.trim();

    if (invoiceId) {
      const invoiceStatus = await fetchInvoiceStatus(invoiceId);
      await syncMonobankPaymentStatus(invoiceStatus);

      return json(invoiceStatus);
    }

    const limitParam = Number(requestUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    return json({ list: await listPendingInvoices(limit) });
  } catch (error) {
    const message = getErrorMessage(error);

    return json(
      {
        error: request.url.includes("invoiceId=")
          ? `Failed to load payment details: ${message}`
          : `Failed to load pending invoices: ${message}`,
      },
      { status: 500 },
    );
  }
});
