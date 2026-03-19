import QRCode from "qrcode";
import { requireAuthenticatedAdmin } from "../../src/lib/auth";
import { getErrorMessage } from "../../src/lib/errors";
import {
  createInvoice,
  type MonobankInvoiceResponse,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank";
import {
  completePaymentCreation,
  createPaymentDraft,
  markPaymentCreationFailed,
  reservePaymentForInvoiceCreation,
} from "../../src/lib/persistence";
import { json } from "../../src/lib/response";

type OutputMode = "link" | "qr";

interface CreateInvoiceRequestBody {
  amount?: unknown;
  clerkUserId?: unknown;
  currency?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  description?: unknown;
  idempotencyKey?: unknown;
  output?: unknown;
}

interface CreateInvoiceInput {
  amountMinor: number;
  clerkUserId: string;
  currency: SupportedCurrency;
  customerEmail?: string;
  customerName: string;
  description: string;
  idempotencyKey?: string;
  output: OutputMode;
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function parseCreateInvoiceInput(body: unknown): CreateInvoiceInput | Response {
  if (!body || typeof body !== "object") {
    return badRequest("Request body must be a JSON object.");
  }

  const {
    amount,
    clerkUserId,
    currency,
    customerEmail,
    customerName,
    description,
    idempotencyKey,
    output,
  } = body as CreateInvoiceRequestBody;
  const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
  const normalizedClerkUserId = getTrimmedString(clerkUserId);
  const normalizedCustomerEmail = getTrimmedString(customerEmail) ?? undefined;
  const normalizedCustomerName = getTrimmedString(customerName);
  const normalizedDescription = getTrimmedString(description);
  const normalizedIdempotencyKey =
    getTrimmedString(idempotencyKey) ?? undefined;

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return badRequest("Amount must be greater than 0.");
  }

  if (currency !== "UAH" && currency !== "USD") {
    return badRequest("Currency must be UAH or USD.");
  }

  if (!normalizedClerkUserId) {
    return badRequest("clerkUserId is required.");
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

  return {
    amountMinor: toMinorUnits(normalizedAmount),
    clerkUserId: normalizedClerkUserId,
    currency,
    customerEmail: normalizedCustomerEmail,
    customerName: normalizedCustomerName,
    description: normalizedDescription,
    idempotencyKey: normalizedIdempotencyKey,
    output,
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
  invoiceId,
  pageUrl,
  paymentId,
  qrCodeDataUrl,
}: {
  invoiceId?: string | null;
  pageUrl: string;
  paymentId: string;
  qrCodeDataUrl?: string;
}) {
  return json({
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
  requireAuthenticatedAdminFn = requireAuthenticatedAdmin,
  reservePaymentForInvoiceCreationFn = reservePaymentForInvoiceCreation,
}: {
  completePaymentCreationFn?: typeof completePaymentCreation;
  createInvoiceFn?: typeof createInvoice;
  createPaymentDraftFn?: typeof createPaymentDraft;
  markPaymentCreationFailedFn?: typeof markPaymentCreationFailed;
  qrcodeToDataUrl?: typeof QRCode.toDataURL;
  requireAuthenticatedAdminFn?: typeof requireAuthenticatedAdmin;
  reservePaymentForInvoiceCreationFn?: typeof reservePaymentForInvoiceCreation;
} = {}) {
  return async function POST(request: Request) {
    const unauthorizedResponse = await requireAuthenticatedAdminFn(request);

    if (unauthorizedResponse) {
      return unauthorizedResponse;
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
        idempotencyKey: getIdempotencyKey(request, parsedInput.idempotencyKey),
      };

      const paymentDraft = await createPaymentDraftFn({
        amountMinor: input.amountMinor,
        clerkUserId: input.clerkUserId,
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

      await completePaymentCreationFn({
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
