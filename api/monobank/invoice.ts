import QRCode from "qrcode";
import { requireAuthenticatedAdmin } from "../../src/lib/auth";
import {
  getCurrencyCode,
  getMonobankToken,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank";
import {
  completePaymentCreation,
  createPaymentDraft,
  markPaymentCreationFailed,
} from "../../src/lib/persistence";
import { json } from "../../src/lib/response";

type OutputMode = "link" | "qr";

async function persistPaymentFailure(
  paymentId: string | null,
  errorMessage: string,
  providerPayload?: unknown,
) {
  if (!paymentId) {
    return;
  }

  try {
    await markPaymentCreationFailed({
      errorMessage,
      paymentId,
      providerPayload,
    });
  } catch {
    // Ignore persistence follow-up failures and return the primary API error.
  }
}

export async function POST(request: Request) {
  const unauthorizedResponse = await requireAuthenticatedAdmin(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  let paymentId: string | null = null;

  try {
    const body = (await request.json()) as {
      amount?: number;
      clerkUserId?: string;
      currency?: SupportedCurrency;
      customerEmail?: string;
      customerName?: string;
      description?: string;
      output?: OutputMode;
    };

    const amount = Number(body.amount);
    const clerkUserId = body.clerkUserId?.trim();
    const currency = body.currency;
    const customerEmail = body.customerEmail?.trim();
    const customerName = body.customerName?.trim();
    const description = body.description?.trim();
    const output = body.output;

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Amount must be greater than 0." }, { status: 400 });
    }

    if (currency !== "UAH" && currency !== "USD") {
      return json({ error: "Currency must be UAH or USD." }, { status: 400 });
    }

    if (!clerkUserId) {
      return json({ error: "clerkUserId is required." }, { status: 400 });
    }

    if (!customerName) {
      return json({ error: "Customer name is required." }, { status: 400 });
    }

    if (!description) {
      return json({ error: "Description is required." }, { status: 400 });
    }

    if (output !== "link" && output !== "qr") {
      return json(
        { error: "Output mode must be link or qr." },
        { status: 400 },
      );
    }

    const amountMinor = toMinorUnits(amount);
    const paymentDraft = await createPaymentDraft({
      amountMinor,
      clerkUserId,
      currency,
      customerEmail,
      customerName,
      description,
    });
    paymentId = paymentDraft.paymentId;

    const monobankResponse = await fetch(
      "https://api.monobank.ua/api/merchant/invoice/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Token": getMonobankToken(),
        },
        body: JSON.stringify({
          amount: amountMinor,
          ccy: getCurrencyCode(currency),
          merchantPaymInfo: {
            reference: paymentDraft.reference,
            destination: description,
            comment: `${customerName}: ${description}`,
          },
        }),
      },
    );

    if (!monobankResponse.ok) {
      const errorText = await monobankResponse.text();

      await persistPaymentFailure(
        paymentId,
        `Monobank API error: ${errorText}`,
      );

      return json(
        { error: `Monobank API error: ${errorText}` },
        { status: 502 },
      );
    }

    const invoice = (await monobankResponse.json()) as {
      invoiceId?: string;
      pageUrl?: string;
    };

    if (!invoice.pageUrl) {
      await persistPaymentFailure(
        paymentId,
        "Monobank response did not include pageUrl.",
        invoice,
      );

      return json(
        { error: "Monobank response did not include pageUrl." },
        { status: 502 },
      );
    }

    await completePaymentCreation({
      invoiceId: invoice.invoiceId,
      pageUrl: invoice.pageUrl,
      paymentId,
      providerPayload: invoice,
    });

    let qrCodeDataUrl: string | undefined;

    if (output === "qr") {
      qrCodeDataUrl = await QRCode.toDataURL(invoice.pageUrl, {
        width: 320,
        margin: 1,
      });
    }

    return json({
      paymentId,
      invoiceId: invoice.invoiceId,
      pageUrl: invoice.pageUrl,
      qrCodeDataUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    await persistPaymentFailure(paymentId, message);

    return json(
      { error: `Failed to create invoice: ${message}` },
      { status: 500 },
    );
  }
}
