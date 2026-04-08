import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalUser } from "../../src/lib/internal-auth-user.js";
import {
  createPendingInvoice,
  ensureAppUser,
  markInvoiceCreationFailed,
  storeCreatedInvoice,
} from "../../src/lib/invoice-store.js";
import {
  createInvoice,
  type MonobankInvoiceResponse,
  type SupportedCurrency,
} from "../../src/lib/monobank.js";
import {
  selectProductBySlug,
  toProductRecord,
} from "../../src/lib/products/index.js";
import { json } from "../../src/lib/response.js";

const DEFAULT_INVOICE_VALIDITY_SECONDS = 24 * 60 * 60;

interface CheckoutRequestBody {
  productSlug?: unknown;
  currency?: unknown;
  redirectUrl?: unknown;
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function getWebhookUrl(request: Request) {
  return new URL("/api/monobank/webhook", request.url).toString();
}

function expirationTimestamp(validitySeconds: number) {
  return new Date(Date.now() + validitySeconds * 1000).toISOString();
}

export async function POST(request: Request) {
  const access = await requireTrustedInternalUser(request);
  if (!access.ok) return access.response;

  let body: CheckoutRequestBody;
  try {
    body = (await request.json()) as CheckoutRequestBody;
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const productSlug =
    typeof body.productSlug === "string" ? body.productSlug.trim() : "";
  if (!productSlug) return badRequest("productSlug is required.");

  const currency: SupportedCurrency | null =
    body.currency === "UAH" || body.currency === "USD" ? body.currency : null;
  if (!currency) return badRequest("currency must be 'UAH' or 'USD'.");

  const redirectUrl =
    typeof body.redirectUrl === "string"
      ? body.redirectUrl.trim() || null
      : null;

  const productRow = await selectProductBySlug(productSlug);
  if (!productRow?.active)
    return json({ error: "Product not found." }, { status: 404 });

  const product = toProductRecord(productRow);

  if (product.pricingType !== "fixed")
    return badRequest("This product is not available for direct checkout.");

  const amountMinor =
    currency === "UAH" ? product.priceUahMinor : product.priceUsdMinor;
  if (amountMinor === null || amountMinor <= 0)
    return badRequest(`Product has no price set for ${currency}.`);

  const customerName =
    access.user.name?.trim() ||
    (access.user.email?.split("@")[0] ?? "Customer");
  const customerEmail = access.user.email ?? null;

  let paymentId: string | null = null;

  try {
    const appUserId = await ensureAppUser({
      authUserId: access.user.userId,
      email: customerEmail,
      fullName: customerName,
    });

    const pendingInvoice = await createPendingInvoice({
      amountMinor,
      currency,
      customerEmail,
      customerName,
      description: product.nameEn,
      productId: product.id,
      productSlug: product.slug,
      userId: appUserId,
    });
    paymentId = pendingInvoice.paymentId;

    let invoice: MonobankInvoiceResponse;
    try {
      invoice = await createInvoice({
        amountMinor,
        currency,
        customerName,
        description: product.nameEn,
        redirectUrl: redirectUrl ?? undefined,
        reference: pendingInvoice.reference,
        validitySeconds: DEFAULT_INVOICE_VALIDITY_SECONDS,
        webHookUrl: getWebhookUrl(request),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (paymentId)
        await markInvoiceCreationFailed({
          errorMessage: message,
          paymentId,
          providerPayload: undefined,
        }).catch(() => undefined);
      return json({ error: message }, { status: 502 });
    }

    const invoiceId = invoice.invoiceId?.trim();
    const pageUrl = invoice.pageUrl?.trim();

    if (!invoiceId || !pageUrl) {
      const message = "Monobank response did not include invoiceId or pageUrl.";
      if (paymentId)
        await markInvoiceCreationFailed({
          errorMessage: message,
          paymentId,
          providerPayload: invoice,
        }).catch(() => undefined);
      return json({ error: message }, { status: 502 });
    }

    const expiresAt = expirationTimestamp(DEFAULT_INVOICE_VALIDITY_SECONDS);

    await storeCreatedInvoice({
      expiresAt,
      invoiceId,
      pageUrl,
      paymentId: pendingInvoice.paymentId,
      providerPayload: invoice,
    });

    return json({
      expiresAt,
      invoiceId,
      pageUrl,
      paymentId: pendingInvoice.paymentId,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (paymentId)
      await markInvoiceCreationFailed({
        errorMessage: message,
        paymentId,
        providerPayload: undefined,
      }).catch(() => undefined);
    return json(
      { error: `Failed to create checkout: ${message}` },
      { status: 500 },
    );
  }
}
