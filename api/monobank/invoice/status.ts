import { requireAuthenticatedAdmin } from "../../../src/lib/auth";
import { getErrorMessage } from "../../../src/lib/errors";
import { fetchInvoiceStatus } from "../../../src/lib/monobank";
import { syncMonobankPaymentStatus } from "../../../src/lib/persistence";
import { json } from "../../../src/lib/response";

export async function GET(request: Request) {
  const unauthorizedResponse = await requireAuthenticatedAdmin(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
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
