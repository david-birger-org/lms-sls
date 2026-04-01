import { getErrorMessage } from "../../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import { listPendingInvoices } from "../../../src/lib/invoice-store.js";
import { json } from "../../../src/lib/response.js";

export async function GET(request: Request) {
  const access = await requireTrustedInternalAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const requestUrl = new URL(request.url);
    const limitParam = Number(requestUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    return json({ list: await listPendingInvoices(limit) });
  } catch (error) {
    return json(
      { error: `Failed to load pending invoices: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
