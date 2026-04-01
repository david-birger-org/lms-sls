import { getErrorMessage } from "../../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import {
  markInvoiceCancelled,
  syncMonobankPaymentStatus,
} from "../../../src/lib/invoice-store.js";
import {
  fetchInvoiceStatus,
  removeInvoice,
} from "../../../src/lib/monobank.js";
import { json } from "../../../src/lib/response.js";

interface RemoveInvoiceRequestBody {
  invoiceId?: unknown;
}

function isExpiredInvoiceError(error: unknown) {
  return /"errCode"\s*:\s*"INVOICE_EXPIRED"/i.test(getErrorMessage(error));
}

async function removeOrResolveExpiredInvoice({
  fetchInvoiceStatusFn,
  invoiceId,
  markInvoiceCancelledFn,
  removeInvoiceFn,
  syncMonobankPaymentStatusFn,
}: {
  fetchInvoiceStatusFn: typeof fetchInvoiceStatus;
  invoiceId: string;
  markInvoiceCancelledFn: typeof markInvoiceCancelled;
  removeInvoiceFn: typeof removeInvoice;
  syncMonobankPaymentStatusFn: typeof syncMonobankPaymentStatus;
}) {
  try {
    const result = await removeInvoiceFn(invoiceId);
    await markInvoiceCancelledFn({ invoiceId, providerPayload: result });
    return result;
  } catch (error) {
    if (!isExpiredInvoiceError(error)) {
      throw error;
    }

    const invoiceStatus = await fetchInvoiceStatusFn(invoiceId);
    await syncMonobankPaymentStatusFn(invoiceStatus);
    return invoiceStatus;
  }
}

export function createPostHandler({
  fetchInvoiceStatusFn = fetchInvoiceStatus,
  markInvoiceCancelledFn = markInvoiceCancelled,
  removeInvoiceFn = removeInvoice,
  requireTrustedInternalAdminFn = requireTrustedInternalAdmin,
  syncMonobankPaymentStatusFn = syncMonobankPaymentStatus,
}: {
  fetchInvoiceStatusFn?: typeof fetchInvoiceStatus;
  markInvoiceCancelledFn?: typeof markInvoiceCancelled;
  removeInvoiceFn?: typeof removeInvoice;
  requireTrustedInternalAdminFn?: typeof requireTrustedInternalAdmin;
  syncMonobankPaymentStatusFn?: typeof syncMonobankPaymentStatus;
} = {}) {
  return async function POST(request: Request) {
    const access = await requireTrustedInternalAdminFn(request);

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

      const result = await removeOrResolveExpiredInvoice({
        fetchInvoiceStatusFn,
        invoiceId,
        markInvoiceCancelledFn,
        removeInvoiceFn,
        syncMonobankPaymentStatusFn,
      });

      return json(result);
    } catch (error) {
      return json(
        { error: `Failed to cancel invoice: ${getErrorMessage(error)}` },
        { status: 500 },
      );
    }
  };
}

export const POST = createPostHandler();
