import { describe, expect, it, mock } from "bun:test";
import type { PaymentCreationState } from "../../src/lib/persistence.js";
import { createPostHandler } from "./invoice.js";

const baseRequestBody = {
  amount: 125,
  currency: "USD",
  customerEmail: "person@example.com",
  customerName: "Ada Lovelace",
  description: "Expert matching",
  output: "link",
} as const;

function createRequest(init?: {
  headers?: Record<string, string>;
  body?: unknown;
}) {
  return new Request("https://example.com/api/monobank/invoice", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(init?.body ?? baseRequestBody),
  });
}

function createPaymentState(
  overrides: Partial<PaymentCreationState>,
): PaymentCreationState {
  return {
    invoiceId: null,
    pageUrl: null,
    paymentId: "payment_123",
    reference: "mb-payment_123",
    reused: false,
    status: "draft",
    userId: "app_user_1",
    ...overrides,
  };
}

function createReservedPaymentState() {
  return {
    ...createPaymentState({ reused: true, status: "creating_invoice" }),
    reused: true as const,
  };
}

describe("POST /api/monobank/invoice", () => {
  it("returns an existing invoice for the same idempotency key", async () => {
    const createInvoiceFn = mock(async () => ({
      invoiceId: "invoice_new",
      pageUrl: "https://mono/new",
    }));
    const handler = createPostHandler({
      completePaymentCreationFn: async () => undefined,
      createInvoiceFn,
      createPaymentDraftFn: async () => ({
        ...createPaymentState({
          invoiceId: "invoice_existing",
          pageUrl: "https://mono/existing",
          paymentId: "payment_existing",
          reference: "mb-existing",
          reused: true,
          status: "invoice_created",
        }),
      }),
      markPaymentCreationFailedFn: async () => undefined,
      requireTrustedInternalAdminFn: async () => ({
        admin: {
          email: "person@example.com",
          name: "Ada Lovelace",
          role: "admin",
          userId: "user_123",
        },
        ok: true,
      }),
      reservePaymentForInvoiceCreationFn: async () => null,
    });

    const response = await handler(
      createRequest({ headers: { "idempotency-key": "idem-123" } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      invoiceId: "invoice_existing",
      pageUrl: "https://mono/existing",
      paymentId: "payment_existing",
      qrCodeDataUrl: undefined,
    });
    expect(createInvoiceFn).not.toHaveBeenCalled();
  });

  it("creates an invoice once and persists the result", async () => {
    const completePaymentCreationFn = mock(async () => undefined);
    const createInvoiceFn = mock(async () => ({
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
    }));
    const createPaymentDraftFn = mock(async () => createPaymentState({}));
    const reservePaymentForInvoiceCreationFn = mock(async () =>
      createReservedPaymentState(),
    );
    const handler = createPostHandler({
      completePaymentCreationFn,
      createInvoiceFn,
      createPaymentDraftFn,
      markPaymentCreationFailedFn: async () => undefined,
      requireTrustedInternalAdminFn: async () => ({
        admin: {
          email: "person@example.com",
          name: "Ada Lovelace",
          role: "admin",
          userId: "user_123",
        },
        ok: true,
      }),
      reservePaymentForInvoiceCreationFn,
    });

    const response = await handler(
      createRequest({ headers: { "idempotency-key": "idem-123" } }),
    );

    expect(response.status).toBe(200);
    expect(createPaymentDraftFn).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-123" }),
    );
    expect(reservePaymentForInvoiceCreationFn).toHaveBeenCalledWith(
      "payment_123",
    );
    expect(createInvoiceFn).toHaveBeenCalledWith({
      amountMinor: 12500,
      currency: "USD",
      customerName: "Ada Lovelace",
      description: "Expert matching",
      reference: "mb-payment_123",
    });
    expect(completePaymentCreationFn).toHaveBeenCalledWith({
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
      providerPayload: {
        invoiceId: "invoice_123",
        pageUrl: "https://mono/pay/123",
      },
    });
  });

  it("returns 409 while an idempotent request is already in flight", async () => {
    const createInvoiceFn = mock(async () => ({
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
    }));
    const handler = createPostHandler({
      completePaymentCreationFn: async () => undefined,
      createInvoiceFn,
      createPaymentDraftFn: async () => ({
        ...createPaymentState({
          reused: true,
          status: "creating_invoice",
        }),
      }),
      markPaymentCreationFailedFn: async () => undefined,
      requireTrustedInternalAdminFn: async () => ({
        admin: {
          email: "person@example.com",
          name: "Ada Lovelace",
          role: "admin",
          userId: "user_123",
        },
        ok: true,
      }),
      reservePaymentForInvoiceCreationFn: async () => null,
    });

    const response = await handler(
      createRequest({ headers: { "idempotency-key": "idem-123" } }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "A request with this idempotency key is already creating an invoice. Retry shortly.",
      paymentId: "payment_123",
    });
    expect(createInvoiceFn).not.toHaveBeenCalled();
  });
});
