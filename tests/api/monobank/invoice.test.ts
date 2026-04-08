import { describe, expect, it, mock } from "bun:test";

import { createPostHandler } from "../../../api/monobank/invoice.js";

const baseRequestBody = {
  amount: 125,
  currency: "USD",
  customerEmail: "person@example.com",
  customerName: "Ada Lovelace",
  description: "Expert matching",
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
    const createStoredMonobankInvoiceFn = mock(async () => ({
      ok: true as const,
      value: {
        expiresAt: "2026-04-08T10:00:00.000Z",
        invoiceId: "invoice_123",
        pageUrl: "https://mono/pay/123",
        paymentId: "payment_123",
      },
    }));
    const handler = createPostHandler({
      createPendingInvoiceFn,
      createStoredMonobankInvoiceFn,
      ensureAppUserFn,
      markInvoiceCreationFailedFn: async () => undefined,
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
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
      createdByAdminUserId: "app_user_1",
      currency: "USD",
      customerEmail: "person@example.com",
      customerName: "Ada Lovelace",
      description: "Expert matching",
      idempotencyKey: null,
      userId: null,
    });
    expect(createStoredMonobankInvoiceFn).toHaveBeenCalledWith({
      amountMinor: 12500,
      currency: "USD",
      customerName: "Ada Lovelace",
      description: "Expert matching",
      markInvoiceCreationFailedFn: expect.any(Function),
      pendingInvoice: {
        paymentId: "payment_123",
        reference: "mb-payment_123",
      },
      request: expect.any(Request),
      validitySeconds: 86400,
    });
    expect(await response.json()).toEqual({
      expiresAt: "2026-04-08T10:00:00.000Z",
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
    });
  });

  it("marks the stored invoice as failed when Monobank create fails", async () => {
    const handler = createPostHandler({
      createPendingInvoiceFn: async () => ({
        paymentId: "payment_123",
        reference: "mb-payment_123",
      }),
      createStoredMonobankInvoiceFn: async () => ({
        errorMessage: "Monobank is unavailable",
        ok: false as const,
        status: 502 as const,
      }),
      ensureAppUserFn: async () => "app_user_1",
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Monobank is unavailable" });
  });

  it("does not mark the invoice as failed after it was persisted", async () => {
    const markInvoiceCreationFailedFn = mock(async () => undefined);
    const handler = createPostHandler({
      createPendingInvoiceFn: async () => ({
        paymentId: "payment_123",
        reference: "mb-payment_123",
      }),
      createStoredMonobankInvoiceFn: async () => ({
        ok: true,
        value: {
          expiresAt: "2026-04-08T10:00:00.000Z",
          invoiceId: "invoice_123",
          pageUrl: "https://mono/pay/123",
          paymentId: "payment_123",
        },
      }),
      ensureAppUserFn: async () => "app_user_1",
      markInvoiceCreationFailedFn,
      requireTrustedInternalAdminFn: async () => createAdminAccess(),
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      expiresAt: "2026-04-08T10:00:00.000Z",
      invoiceId: "invoice_123",
      pageUrl: "https://mono/pay/123",
      paymentId: "payment_123",
    });
    expect(markInvoiceCreationFailedFn).not.toHaveBeenCalled();
  });
});
