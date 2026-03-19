import { requireInternalApiKey } from "../../../src/lib/auth";
import { fetchInvoiceStatus } from "../../../src/lib/monobank";
import { json } from "../../../src/lib/response";

export async function GET(request: Request) {
  const unauthorizedResponse = requireInternalApiKey(request);

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
    return json(invoiceStatus);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return json(
      { error: `Failed to load payment details: ${message}` },
      { status: 500 },
    );
  }
}
