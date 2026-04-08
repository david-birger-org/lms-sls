import { getErrorMessage } from "./errors.js";
import {
  markInvoiceCreationFailed,
  storeCreatedInvoice,
  type StoreCreatedInvoiceInput,
} from "./invoice-store.js";
import {
  createInvoice,
  type MonobankInvoiceResponse,
  type SupportedCurrency,
} from "./monobank.js";

export interface PendingInvoiceReference {
  paymentId: string;
  reference: string;
}

interface CreateStoredMonobankInvoiceDeps {
  createInvoiceFn?: typeof createInvoice;
  markInvoiceCreationFailedFn?: typeof markInvoiceCreationFailed;
  storeCreatedInvoiceFn?: typeof storeCreatedInvoice;
}

interface CreateStoredMonobankInvoiceInput
  extends CreateStoredMonobankInvoiceDeps {
  amountMinor: number;
  currency: SupportedCurrency;
  customerName: string;
  description: string;
  pendingInvoice: PendingInvoiceReference;
  redirectUrl?: string;
  request: Request;
  validitySeconds: number;
}

interface CreatedStoredMonobankInvoice {
  expiresAt: string;
  invoiceId: string;
  pageUrl: string;
  paymentId: string;
}

type CreateStoredMonobankInvoiceResult =
  | {
      ok: true;
      value: CreatedStoredMonobankInvoice;
    }
  | {
      errorMessage: string;
      ok: false;
      status: 502;
    };

function getWebhookUrl(request: Request) {
  return new URL("/api/monobank/webhook", request.url).toString();
}

function getInvoiceExpirationTimestamp(validitySeconds: number) {
  return new Date(Date.now() + validitySeconds * 1000).toISOString();
}

async function persistInvoiceFailure(
  paymentId: string,
  errorMessage: string,
  providerPayload: unknown,
  markInvoiceCreationFailedFn: typeof markInvoiceCreationFailed,
) {
  try {
    await markInvoiceCreationFailedFn({
      errorMessage,
      paymentId,
      providerPayload,
    });
  } catch {
    return;
  }
}

export async function createStoredMonobankInvoice({
  amountMinor,
  createInvoiceFn = createInvoice,
  currency,
  customerName,
  description,
  markInvoiceCreationFailedFn = markInvoiceCreationFailed,
  pendingInvoice,
  redirectUrl,
  request,
  storeCreatedInvoiceFn = storeCreatedInvoice,
  validitySeconds,
}: CreateStoredMonobankInvoiceInput): Promise<CreateStoredMonobankInvoiceResult> {
  let invoice: MonobankInvoiceResponse;

  try {
    invoice = await createInvoiceFn({
      amountMinor,
      currency,
      customerName,
      description,
      redirectUrl,
      reference: pendingInvoice.reference,
      validitySeconds,
      webHookUrl: getWebhookUrl(request),
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await persistInvoiceFailure(
      pendingInvoice.paymentId,
      errorMessage,
      undefined,
      markInvoiceCreationFailedFn,
    );

    return { errorMessage, ok: false, status: 502 };
  }

  const invoiceId = invoice.invoiceId?.trim();
  const pageUrl = invoice.pageUrl?.trim();

  if (!invoiceId || !pageUrl) {
    const errorMessage =
      "Monobank response did not include invoiceId or pageUrl.";

    await persistInvoiceFailure(
      pendingInvoice.paymentId,
      errorMessage,
      invoice,
      markInvoiceCreationFailedFn,
    );

    return { errorMessage, ok: false, status: 502 };
  }

  const expiresAt = getInvoiceExpirationTimestamp(validitySeconds);
  const storeInput: StoreCreatedInvoiceInput = {
    expiresAt,
    invoiceId,
    pageUrl,
    paymentId: pendingInvoice.paymentId,
    providerPayload: invoice,
  };

  await storeCreatedInvoiceFn(storeInput);

  return {
    ok: true,
    value: {
      expiresAt,
      invoiceId,
      pageUrl,
      paymentId: pendingInvoice.paymentId,
    },
  };
}
