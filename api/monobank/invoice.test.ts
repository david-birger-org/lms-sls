import { describe, expect, it, mock } from "bun:test";

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

function createAdminAccess() {
  return {
    admin: {
      email: "person@example.com",
      name: "Ada Lovelace",
      role: "admin" as const,
      userId: "user_123",
    },
    ok: true as const,
  };
}

describe("POST /api/monobank/invoice", () => {
  it("creates a Monobank invoice and persists it", async () => {
    const ensureAppUserFn = mock(async () => "app_user_1");
    const createPendingInvoiceFn = mock(async () => ({
      paymentId: "payment_123",
      reference: "mb-payment_123",
    }));
    const createInvoiceFn = mock(async () => ({
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
    }));
    const storeCreatedInvoiceFn = mock(async () => undefined);
    const handler = createPostHandler({
      createInvoiceFn,
      createPendingInvoiceFn,
      ensureAppUserFn,
      markInvoiceCreationFailedFn: async () => undefined,
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
      storeCreatedInvoiceFn,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(ensureAppUserFn).toHaveBeenCalledWith({
      authUserId: "user_123",
      email: "person@example.com",
      fullName: "Ada Lovelace",
    });
    expect(createPendingInvoiceFn).toHaveBeenCalledWith({
      amountMinor: 12500,
      currency: "USD",
      customerEmail: "person@example.com",
      customerName: "Ada Lovelace",
      description: "Expert matching",
      idempotencyKey: null,
      userId: "app_user_1",
    });
    expect(createInvoiceFn).toHaveBeenCalledWith({
      amountMinor: 12500,
      currency: "USD",
      customerName: "Ada Lovelace",
      description: "Expert matching",
      reference: "mb-payment_123",
      validitySeconds: 86400,
      webHookUrl: "https://example.com/api/monobank/webhook",
    });
    expect(storeCreatedInvoiceFn).toHaveBeenCalledWith({
      expiresAt: expect.any(String),
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
      providerPayload: {
        invoiceId: "invoice_123",
        pageUrl: "https://mono/pay/123",
      },
    });
    expect(await response.json()).toEqual({
      expiresAt: expect.any(String),
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
      qrCodeDataUrl: undefined,
    });
  });

  it("marks the stored invoice as failed when Monobank create fails", async () => {
    const markInvoiceCreationFailedFn = mock(async () => undefined);
    const handler = createPostHandler({
      createInvoiceFn: async () => {
        throw new Error("Monobank is unavailable");
      },
      createPendingInvoiceFn: async () => ({
        paymentId: "payment_123",
        reference: "mb-payment_123",
      }),
      ensureAppUserFn: async () => "app_user_1",
      markInvoiceCreationFailedFn,
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
      storeCreatedInvoiceFn: async () => undefined,
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Monobank is unavailable" });
    expect(markInvoiceCreationFailedFn).toHaveBeenCalledWith({
      errorMessage: "Monobank is unavailable",
      paymentId: "payment_123",
      providerPayload: undefined,
    });
  });

  it("does not mark the invoice as failed after it was persisted", async () => {
    const markInvoiceCreationFailedFn = mock(async () => undefined);
    const storeCreatedInvoiceFn = mock(async () => undefined);
    const handler = createPostHandler({
      createInvoiceFn: async () => ({
        invoiceId: "invoice_123",
        pageUrl: "https://mono/pay/123",
      }),
      createPendingInvoiceFn: async () => ({
        paymentId: "payment_123",
        reference: "mb-payment_123",
      }),
      ensureAppUserFn: async () => "app_user_1",
      markInvoiceCreationFailedFn,
      qrcodeToDataUrl: mock(async () => {
        throw new Error("QR generation failed");
      }),
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
      storeCreatedInvoiceFn,
    });

    const response = await handler(
      createRequest({ body: { ...baseRequestBody, output: "qr" } }),
    );

    expect(response.status).toBe(500);
    expect(storeCreatedInvoiceFn).toHaveBeenCalledWith({
      expiresAt: expect.any(String),
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
      providerPayload: {
        invoiceId: "invoice_123",
        pageUrl: "https://mono/pay/123",
      },
    });
    expect(markInvoiceCreationFailedFn).not.toHaveBeenCalled();
  });
});
