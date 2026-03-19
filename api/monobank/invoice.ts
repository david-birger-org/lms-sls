import QRCode from "qrcode";
import { requireInternalApiKey } from "../../src/lib/auth";
import {
  getCurrencyCode,
  getMonobankToken,
  type SupportedCurrency,
  toMinorUnits,
} from "../../src/lib/monobank";
import { json } from "../../src/lib/response";

type OutputMode = "link" | "qr";

export async function POST(request: Request) {
  const unauthorizedResponse = requireInternalApiKey(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const body = (await request.json()) as {
      amount?: number;
      currency?: SupportedCurrency;
      customerName?: string;
      description?: string;
      output?: OutputMode;
    };

    const amount = Number(body.amount);
    const currency = body.currency;
    const customerName = body.customerName?.trim();
    const description = body.description?.trim();
    const output = body.output;

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Amount must be greater than 0." }, { status: 400 });
    }

    if (currency !== "UAH" && currency !== "USD") {
      return json({ error: "Currency must be UAH or USD." }, { status: 400 });
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

    const monobankResponse = await fetch(
      "https://api.monobank.ua/api/merchant/invoice/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Token": getMonobankToken(),
        },
        body: JSON.stringify({
          amount: toMinorUnits(amount),
          ccy: getCurrencyCode(currency),
          merchantPaymInfo: {
            reference: `poc-${Date.now()}`,
            destination: description,
            comment: `${customerName}: ${description}`,
          },
        }),
      },
    );

    if (!monobankResponse.ok) {
      const errorText = await monobankResponse.text();
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
      return json(
        { error: "Monobank response did not include pageUrl." },
        { status: 502 },
      );
    }

    let qrCodeDataUrl: string | undefined;

    if (output === "qr") {
      qrCodeDataUrl = await QRCode.toDataURL(invoice.pageUrl, {
        width: 320,
        margin: 1,
      });
    }

    return json({
      invoiceId: invoice.invoiceId,
      pageUrl: invoice.pageUrl,
      qrCodeDataUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return json(
      { error: `Failed to create invoice: ${message}` },
      { status: 500 },
    );
  }
}
