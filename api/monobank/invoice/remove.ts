import { getErrorMessage } from "../../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import { removeInvoice } from "../../../src/lib/monobank.js";
import { markInvoiceCancelled } from "../../../src/lib/persistence.js";
import { json } from "../../../src/lib/response.js";

interface RemoveInvoiceRequestBody {
  invoiceId?: unknown;
}

export async function POST(request: Request) {
  const access = await requireTrustedInternalAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const body = (await request.json()) as RemoveInvoiceRequestBody;
    const invoiceId =
      typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";

    if (!invoiceId) {
      return json({ error: "invoiceId is required." }, { status: 400 });
    }

    const result = await removeInvoice(invoiceId);
    await markInvoiceCancelled({ invoiceId, providerPayload: result });

    return json(result);
  } catch (error) {
    return json(
      { error: `Failed to cancel invoice: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
