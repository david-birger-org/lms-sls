import QRCode from "qrcode";

import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import {
  createPendingInvoice,
  ensureAppUser,
  findPaymentByIdempotencyKey,
  markInvoiceCreationFailed,
  storeCreatedInvoice,
} from "../../src/lib/invoice-store.js";
import {
  createInvoice,
  type MonobankInvoiceResponse,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank.js";
import { json } from "../../src/lib/response.js";

type OutputMode = "link" | "qr";

const DEFAULT_INVOICE_VALIDITY_SECONDS = 24 * 60 * 60;

interface CreateInvoiceRequestBody {
  amount?: unknown;
  currency?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  description?: unknown;
  output?: unknown;
  redirectUrl?: unknown;
  validitySeconds?: unknown;
}

interface ParsedCreateInvoiceInput {
  amountMinor: number;
  currency: SupportedCurrency;
  customerEmail?: string;
  customerName: string;
  description: string;
  output: OutputMode;
  redirectUrl?: string;
  validitySeconds: number;
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function getInvoiceExpirationTimestamp(validitySeconds: number) {
  return new Date(Date.now() + validitySeconds * 1000).toISOString();
}

function getWebhookUrl(request: Request) {
  return new URL("/api/monobank/webhook", request.url).toString();
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
    output,
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

  if (output !== "link" && output !== "qr") {
    return badRequest("Output mode must be link or qr.");
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
    output,
    redirectUrl: normalizedRedirectUrl,
    validitySeconds: normalizedValiditySeconds,
  };
}

function buildInvoiceResponse({
  expiresAt,
  invoiceId,
  pageUrl,
  paymentId,
  qrCodeDataUrl,
}: {
  expiresAt: string;
  invoiceId: string;
  pageUrl: string;
  paymentId: string;
  qrCodeDataUrl?: string;
}) {
  return json({
    expiresAt,
    invoiceId,
    pageUrl,
    paymentId,
    qrCodeDataUrl,
  });
}

async function persistInvoiceFailure(
  paymentId: string | null,
  errorMessage: string,
  providerPayload: unknown,
  markInvoiceCreationFailedFn: typeof markInvoiceCreationFailed,
) {
  if (!paymentId) {
    return;
  }

  try {
    await markInvoiceCreationFailedFn({
      errorMessage,
      paymentId,
      providerPayload,
    });
  } catch {
    // Ignore follow-up persistence failures and return the primary API error.
  }
}

export function createPostHandler({
  createInvoiceFn = createInvoice,
  createPendingInvoiceFn = createPendingInvoice,
  ensureAppUserFn = ensureAppUser,
  findPaymentByIdempotencyKeyFn = findPaymentByIdempotencyKey,
  markInvoiceCreationFailedFn = markInvoiceCreationFailed,
  qrcodeToDataUrl = QRCode.toDataURL,
  requireTrustedInternalAdminFn = requireTrustedInternalAdmin,
  storeCreatedInvoiceFn = storeCreatedInvoice,
}: {
  createInvoiceFn?: typeof createInvoice;
  createPendingInvoiceFn?: typeof createPendingInvoice;
  ensureAppUserFn?: typeof ensureAppUser;
  findPaymentByIdempotencyKeyFn?: typeof findPaymentByIdempotencyKey;
  markInvoiceCreationFailedFn?: typeof markInvoiceCreationFailed;
  qrcodeToDataUrl?: typeof QRCode.toDataURL;
  requireTrustedInternalAdminFn?: typeof requireTrustedInternalAdmin;
  storeCreatedInvoiceFn?: typeof storeCreatedInvoice;
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
      const createdByAdminUserId = await ensureAppUserFn({
        authUserId: access.admin.userId,
        email: access.admin.email,
        fullName: access.admin.name ?? access.admin.email ?? access.admin.userId,
      });
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

      let invoice: MonobankInvoiceResponse;

      try {
        invoice = await createInvoiceFn({
          amountMinor: parsedInput.amountMinor,
          currency: parsedInput.currency,
          customerName: parsedInput.customerName,
          description: parsedInput.description,
          redirectUrl: parsedInput.redirectUrl,
          reference: pendingInvoice.reference,
          validitySeconds: parsedInput.validitySeconds,
          webHookUrl: getWebhookUrl(request),
        });
      } catch (error) {
        const message = getErrorMessage(error);

        await persistInvoiceFailure(
          paymentId,
          message,
          undefined,
          markInvoiceCreationFailedFn,
        );

        return json({ error: message }, { status: 502 });
      }

      const invoiceId = invoice.invoiceId?.trim();
      const pageUrl = invoice.pageUrl?.trim();

      if (!invoiceId || !pageUrl) {
        const message =
          "Monobank response did not include invoiceId or pageUrl.";

        await persistInvoiceFailure(
          paymentId,
          message,
          invoice,
          markInvoiceCreationFailedFn,
        );

        return json({ error: message }, { status: 502 });
      }

      const expiresAt = getInvoiceExpirationTimestamp(
        parsedInput.validitySeconds,
      );

      await storeCreatedInvoiceFn({
        expiresAt,
        invoiceId,
        pageUrl,
        paymentId,
        providerPayload: invoice,
      });
      paymentId = null;

      const qrCodeDataUrl =
        parsedInput.output === "qr"
          ? await qrcodeToDataUrl(pageUrl, {
              width: 320,
              margin: 1,
            })
          : undefined;

      return buildInvoiceResponse({
        expiresAt,
        invoiceId,
        pageUrl,
        paymentId: pendingInvoice.paymentId,
        qrCodeDataUrl,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      await persistInvoiceFailure(
        paymentId,
        message,
        undefined,
        markInvoiceCreationFailedFn,
      );

      return json(
        { error: `Failed to create invoice: ${message}` },
        { status: 500 },
      );
    }
  };
}

export const POST = createPostHandler();
