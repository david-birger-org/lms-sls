import QRCode from "qrcode";
import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import {
  createInvoice,
  type MonobankInvoiceResponse,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank.js";
import {
  completePaymentCreation,
  createPaymentDraft,
  markPaymentCreationFailed,
  reservePaymentForInvoiceCreation,
} from "../../src/lib/persistence.js";
import { json } from "../../src/lib/response.js";

type OutputMode = "link" | "qr";
const DEFAULT_INVOICE_VALIDITY_SECONDS = 24 * 60 * 60;

function getInvoiceExpirationTimestamp(validitySeconds: number) {
  return new Date(Date.now() + validitySeconds * 1000).toISOString();
}

function getWebhookUrl(request: Request) {
  return new URL("/api/monobank/webhook", request.url).toString();
}

interface CreateInvoiceRequestBody {
  appUserId?: unknown;
  amount?: unknown;
  currency?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  description?: unknown;
  idempotencyKey?: unknown;
  output?: unknown;
  validitySeconds?: unknown;
}

interface ParsedCreateInvoiceInput {
  appUserId?: string;
  amountMinor: number;
  currency: SupportedCurrency;
  customerEmail?: string;
  customerName: string;
  description: string;
  idempotencyKey?: string;
  output: OutputMode;
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
    appUserId,
    amount,
    currency,
    customerEmail,
    customerName,
    description,
    idempotencyKey,
    output,
    validitySeconds,
  } = body as CreateInvoiceRequestBody;
  const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
  const normalizedAppUserId = getTrimmedString(appUserId) ?? undefined;
  const normalizedCustomerEmail = getTrimmedString(customerEmail) ?? undefined;
  const normalizedCustomerName = getTrimmedString(customerName);
  const normalizedDescription = getTrimmedString(description);
  const normalizedIdempotencyKey =
    getTrimmedString(idempotencyKey) ?? undefined;
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

  return {
    appUserId: normalizedAppUserId,
    amountMinor: toMinorUnits(normalizedAmount),
    currency,
    customerEmail: normalizedCustomerEmail,
    customerName: normalizedCustomerName,
    description: normalizedDescription,
    idempotencyKey: normalizedIdempotencyKey,
    output,
    validitySeconds: normalizedValiditySeconds,
  };
}

function getIdempotencyKey(request: Request, bodyIdempotencyKey?: string) {
  return (
    request.headers.get("idempotency-key")?.trim() ||
    bodyIdempotencyKey ||
    undefined
  );
}

function buildInvoiceResponse({
  expiresAt,
  invoiceId,
  pageUrl,
  paymentId,
  qrCodeDataUrl,
}: {
  expiresAt?: string | null;
  invoiceId?: string | null;
  pageUrl: string;
  paymentId: string;
  qrCodeDataUrl?: string;
}) {
  return json({
    expiresAt,
    paymentId,
    invoiceId,
    pageUrl,
    qrCodeDataUrl,
  });
}

export function createPostHandler({
  completePaymentCreationFn = completePaymentCreation,
  createInvoiceFn = createInvoice,
  createPaymentDraftFn = createPaymentDraft,
  markPaymentCreationFailedFn = markPaymentCreationFailed,
  qrcodeToDataUrl = QRCode.toDataURL,
  requireTrustedInternalAdminFn = requireTrustedInternalAdmin,
  reservePaymentForInvoiceCreationFn = reservePaymentForInvoiceCreation,
}: {
  completePaymentCreationFn?: typeof completePaymentCreation;
  createInvoiceFn?: typeof createInvoice;
  createPaymentDraftFn?: typeof createPaymentDraft;
  markPaymentCreationFailedFn?: typeof markPaymentCreationFailed;
  qrcodeToDataUrl?: typeof QRCode.toDataURL;
  requireTrustedInternalAdminFn?: typeof requireTrustedInternalAdmin;
  reservePaymentForInvoiceCreationFn?: typeof reservePaymentForInvoiceCreation;
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

      const input = {
        ...parsedInput,
        authUserId: access.admin.userId,
        customerEmail:
          parsedInput.customerEmail ?? access.admin.email ?? undefined,
        idempotencyKey: getIdempotencyKey(request, parsedInput.idempotencyKey),
      };

      const paymentDraft = await createPaymentDraftFn({
        appUserId: input.appUserId,
        amountMinor: input.amountMinor,
        authUserId: input.authUserId,
        currency: input.currency,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      });
      paymentId = paymentDraft.paymentId;

      if (paymentDraft.pageUrl) {
        const qrCodeDataUrl =
          input.output === "qr"
            ? await qrcodeToDataUrl(paymentDraft.pageUrl, {
                width: 320,
                margin: 1,
              })
            : undefined;

        return buildInvoiceResponse({
          expiresAt: paymentDraft.expiresAt,
          invoiceId: paymentDraft.invoiceId,
          pageUrl: paymentDraft.pageUrl,
          paymentId,
          qrCodeDataUrl,
        });
      }

      const reservedPayment =
        await reservePaymentForInvoiceCreationFn(paymentId);

      if (!reservedPayment) {
        return json(
          {
            error:
              "A request with this idempotency key is already creating an invoice. Retry shortly.",
            paymentId,
          },
          { status: 409 },
        );
      }

      let invoice: MonobankInvoiceResponse;

      try {
        invoice = await createInvoiceFn({
          amountMinor: input.amountMinor,
          currency: input.currency,
          customerName: input.customerName,
          description: input.description,
          reference: reservedPayment.reference,
          validitySeconds: input.validitySeconds,
          webHookUrl: getWebhookUrl(request),
        });
      } catch (error) {
        const message = getErrorMessage(error);

        await persistPaymentFailure(
          paymentId,
          message,
          undefined,
          markPaymentCreationFailedFn,
        );

        return json({ error: message }, { status: 502 });
      }

      if (!invoice.pageUrl) {
        await persistPaymentFailure(
          paymentId,
          "Monobank response did not include pageUrl.",
          invoice,
          markPaymentCreationFailedFn,
        );

        return json(
          { error: "Monobank response did not include pageUrl." },
          { status: 502 },
        );
      }

      const expiresAt = getInvoiceExpirationTimestamp(input.validitySeconds);

      await completePaymentCreationFn({
        expiresAt,
        invoiceId: invoice.invoiceId,
        pageUrl: invoice.pageUrl,
        paymentId,
        providerPayload: invoice,
      });

      const qrCodeDataUrl =
        input.output === "qr"
          ? await qrcodeToDataUrl(invoice.pageUrl, {
              width: 320,
              margin: 1,
            })
          : undefined;

      return buildInvoiceResponse({
        expiresAt,
        invoiceId: invoice.invoiceId,
        pageUrl: invoice.pageUrl,
        paymentId,
        qrCodeDataUrl,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      await persistPaymentFailure(
        paymentId,
        message,
        undefined,
        markPaymentCreationFailedFn,
      );

      return json(
        { error: `Failed to create invoice: ${message}` },
        { status: 500 },
      );
    }
  };
}

async function persistPaymentFailure(
  paymentId: string | null,
  errorMessage: string,
  providerPayload?: unknown,
  markPaymentCreationFailedFn: typeof markPaymentCreationFailed = markPaymentCreationFailed,
) {
  if (!paymentId) {
    return;
  }

  try {
    await markPaymentCreationFailedFn({
      errorMessage,
      paymentId,
      providerPayload,
    });
  } catch {
    // Ignore persistence follow-up failures and return the primary API error.
  }
}

export const POST = createPostHandler();
