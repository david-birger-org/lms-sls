import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalUser } from "../../src/lib/internal-auth-user.js";
import { createStoredMonobankInvoice } from "../../src/lib/invoice-creation.js";
import {
  createPendingInvoice,
  getAppUserIdByAuthUserId,
  markInvoiceCreationFailed,
} from "../../src/lib/invoice-store.js";
import { type SupportedCurrency } from "../../src/lib/monobank.js";
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
    const appUserId = await getAppUserIdByAuthUserId(access.user.userId);

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

    const invoiceResult = await createStoredMonobankInvoice({
      amountMinor,
      currency,
      customerName,
      description: product.nameEn,
      pendingInvoice,
      redirectUrl: redirectUrl ?? undefined,
      request,
      validitySeconds: DEFAULT_INVOICE_VALIDITY_SECONDS,
    });

    if (!invoiceResult.ok)
      return json(
        { error: invoiceResult.errorMessage },
        { status: invoiceResult.status },
      );

    paymentId = null;

    return json({
      expiresAt: invoiceResult.value.expiresAt,
      invoiceId: invoiceResult.value.invoiceId,
      pageUrl: invoiceResult.value.pageUrl,
      paymentId: invoiceResult.value.paymentId,
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
