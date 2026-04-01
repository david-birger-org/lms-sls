import { getErrorMessage } from "../../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import { syncMonobankPaymentStatus } from "../../../src/lib/invoice-store.js";
import { fetchInvoiceStatus } from "../../../src/lib/monobank.js";
import { json } from "../../../src/lib/response.js";

export async function GET(request: Request) {
  const access = await requireTrustedInternalAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const requestUrl = new URL(request.url);
    const invoiceId = requestUrl.searchParams.get("invoiceId")?.trim();

    if (!invoiceId) {
      return json({ error: "invoiceId is required." }, { status: 400 });
    }

    const invoiceStatus = await fetchInvoiceStatus(invoiceId);
    await syncMonobankPaymentStatus(invoiceStatus);

    return json(invoiceStatus);
  } catch (error) {
    return json(
      { error: `Failed to load payment details: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
