import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { getPaymentDetailsByInvoiceId } from "../../src/lib/invoice-store.js";
import { json } from "../../src/lib/response.js";

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

    const payment = await getPaymentDetailsByInvoiceId(invoiceId);

    if (!payment) {
      return json({ error: "Payment not found." }, { status: 404 });
    }

    return json(payment);
  } catch (error) {
    return json(
      { error: `Failed to load payment details: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
