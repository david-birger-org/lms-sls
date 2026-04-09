import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { createStoredMonobankInvoice } from "../../src/lib/invoice-creation.js";
import {
  createPendingInvoice,
  findPaymentByIdempotencyKey,
  getAppUserIdByAuthUserId,
  markInvoiceCancelled,
  markInvoiceCreationFailed,
  syncMonobankPaymentStatus,
} from "../../src/lib/invoice-store.js";
import {
  fetchInvoiceStatus,
  removeInvoice,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

const DEFAULT_INVOICE_VALIDITY_SECONDS = 24 * 60 * 60;

interface CreateInvoiceRequestBody {
  amount?: unknown;
  currency?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  description?: unknown;
  redirectUrl?: unknown;
  validitySeconds?: unknown;
}

interface ParsedCreateInvoiceInput {
  amountMinor: number;
  currency: SupportedCurrency;
  customerEmail?: string;
  customerName: string;
  description: string;
  redirectUrl?: string;
  validitySeconds: number;
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function parseCreateInvoiceInput(
  body: unknown,
): ParsedCreateInvoiceInput | Response {
  if (!body || typeof body !== "object") {
    return badRequest("Request body must be a JSON object.");
  }

  const {
    amount,
    currency,
    customerEmail,
    customerName,
    description,
    redirectUrl,
    validitySeconds,
  } = body as CreateInvoiceRequestBody;
  const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
  const normalizedCustomerEmail = getTrimmedString(customerEmail) ?? undefined;
  const normalizedCustomerName = getTrimmedString(customerName);
  const normalizedDescription = getTrimmedString(description);
  const normalizedValiditySeconds =
    validitySeconds === undefined
      ? DEFAULT_INVOICE_VALIDITY_SECONDS
      : Number(validitySeconds);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return badRequest("Amount must be greater than 0.");
  }

  if (currency !== "UAH" && currency !== "USD") {
    return badRequest("Currency must be UAH or USD.");
  }

  if (!normalizedCustomerName) {
    return badRequest("Customer name is required.");
  }

  if (!normalizedDescription) {
    return badRequest("Description is required.");
  }

  if (
    !Number.isInteger(normalizedValiditySeconds) ||
    normalizedValiditySeconds < 60
  ) {
    return badRequest("Expiration time must be at least 60 seconds.");
  }

  const normalizedRedirectUrl = getTrimmedString(redirectUrl) ?? undefined;

  return {
    amountMinor: toMinorUnits(normalizedAmount),
    currency,
    customerEmail: normalizedCustomerEmail,
    customerName: normalizedCustomerName,
    description: normalizedDescription,
    redirectUrl: normalizedRedirectUrl,
    validitySeconds: normalizedValiditySeconds,
  };
}

function buildInvoiceResponse({
  expiresAt,
  invoiceId,
  pageUrl,
  paymentId,
}: {
  expiresAt: string;
  invoiceId: string;
  pageUrl: string;
  paymentId: string;
}) {
  return json({
    expiresAt,
    invoiceId,
    pageUrl,
    paymentId,
  });
}

export function createPostHandler({
  createPendingInvoiceFn = createPendingInvoice,
  createStoredMonobankInvoiceFn = createStoredMonobankInvoice,
  getAppUserIdByAuthUserIdFn = getAppUserIdByAuthUserId,
  findPaymentByIdempotencyKeyFn = findPaymentByIdempotencyKey,
  markInvoiceCreationFailedFn = markInvoiceCreationFailed,
  requireTrustedInternalAdminFn = requireTrustedInternalAdmin,
}: {
  createPendingInvoiceFn?: typeof createPendingInvoice;
  createStoredMonobankInvoiceFn?: typeof createStoredMonobankInvoice;
  getAppUserIdByAuthUserIdFn?: typeof getAppUserIdByAuthUserId;
  findPaymentByIdempotencyKeyFn?: typeof findPaymentByIdempotencyKey;
  markInvoiceCreationFailedFn?: typeof markInvoiceCreationFailed;
  requireTrustedInternalAdminFn?: typeof requireTrustedInternalAdmin;
} = {}) {
  return async function POST(request: Request) {
    const access = await requireTrustedInternalAdminFn(request);

    if (!access.ok) {
      return access.response;
    }

    let paymentId: string | null = null;

    try {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return badRequest("Request body must be valid JSON.");
      }

      const parsedInput = parseCreateInvoiceInput(body);

      if (parsedInput instanceof Response) {
        return parsedInput;
      }

      const idempotencyKey = request.headers.get("idempotency-key")?.trim();

      if (idempotencyKey) {
        const existing = await findPaymentByIdempotencyKeyFn(idempotencyKey);

        if (existing?.invoice_id && existing.page_url) {
          return json({
            expiresAt: existing.expires_at,
            invoiceId: existing.invoice_id,
            pageUrl: existing.page_url,
            paymentId: existing.id,
          });
        }
      }

      const customerEmail = parsedInput.customerEmail ?? null;
      const createdByAdminUserId = await getAppUserIdByAuthUserIdFn(
        access.admin.userId,
      );
      const pendingInvoice = await createPendingInvoiceFn({
        amountMinor: parsedInput.amountMinor,
        createdByAdminUserId,
        currency: parsedInput.currency,
        customerEmail,
        customerName: parsedInput.customerName,
        description: parsedInput.description,
        idempotencyKey: idempotencyKey ?? null,
        userId: null,
      });

      paymentId = pendingInvoice.paymentId;

      const invoiceResult = await createStoredMonobankInvoiceFn({
        amountMinor: parsedInput.amountMinor,
        currency: parsedInput.currency,
        customerName: parsedInput.customerName,
        description: parsedInput.description,
        markInvoiceCreationFailedFn,
        pendingInvoice,
        redirectUrl: parsedInput.redirectUrl,
        request,
        validitySeconds: parsedInput.validitySeconds,
      });

      if (!invoiceResult.ok)
        return json(
          { error: invoiceResult.errorMessage },
          { status: invoiceResult.status },
        );

      paymentId = null;

      return buildInvoiceResponse({
        expiresAt: invoiceResult.value.expiresAt,
        invoiceId: invoiceResult.value.invoiceId,
        pageUrl: invoiceResult.value.pageUrl,
        paymentId: invoiceResult.value.paymentId,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      if (paymentId)
        await markInvoiceCreationFailedFn({
          errorMessage: message,
          paymentId,
          providerPayload: undefined,
        }).catch(() => undefined);

      return json(
        { error: `Failed to create invoice: ${message}` },
        { status: 500 },
      );
    }
  };
}

export const POST = createPostHandler();

interface RemoveInvoiceRequestBody {
  invoiceId?: unknown;
}

function isExpiredInvoiceError(error: unknown) {
  return /"errCode"\s*:\s*"INVOICE_EXPIRED"/i.test(getErrorMessage(error));
}

async function removeOrResolveExpiredInvoice(invoiceId: string) {
  try {
    const result = await removeInvoice(invoiceId);
    await markInvoiceCancelled({ invoiceId, providerPayload: result });
    return result;
  } catch (error) {
    if (!isExpiredInvoiceError(error)) throw error;
    const invoiceStatus = await fetchInvoiceStatus(invoiceId);
    await syncMonobankPaymentStatus(invoiceStatus);
    return invoiceStatus;
  }
}

export async function DELETE(request: Request) {
  const access = await requireTrustedInternalAdmin(request);
  if (!access.ok) return access.response;

  try {
    const body = (await request.json()) as RemoveInvoiceRequestBody;
    const invoiceId =
      typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";

    if (!invoiceId)
      return json({ error: "invoiceId is required." }, { status: 400 });

    const result = await removeOrResolveExpiredInvoice(invoiceId);
    return json(result);
  } catch (error) {
    return json(
      { error: `Failed to cancel invoice: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
