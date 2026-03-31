import { describe, expect, it, mock } from "bun:test";

import { createPostHandler } from "./remove.js";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/monobank/invoice/remove", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/monobank/invoice/remove", () => {
  it("cancels an invoice when Monobank accepts the request", async () => {
    const markInvoiceCancelledFn = mock(async () => undefined);
    const removeInvoiceFn = mock(async () => ({
      invoiceId: "invoice_123",
      status: "cancelled" as const,
    }));
    const handler = createPostHandler({
      markInvoiceCancelledFn,
      removeInvoiceFn,
      requireTrustedInternalAdminFn: async () => ({
        admin: {
          email: "person@example.com",
          name: "Ada Lovelace",
          role: "admin",
          userId: "user_123",
        },
        ok: true,
      }),
    });

    const response = await handler(createRequest({ invoiceId: "invoice_123" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      invoiceId: "invoice_123",
      status: "cancelled",
    });
    expect(markInvoiceCancelledFn).toHaveBeenCalledWith({
      invoiceId: "invoice_123",
      providerPayload: {
        invoiceId: "invoice_123",
        status: "cancelled",
      },
    });
  });

  it("syncs invoice status instead of failing when the invoice already expired", async () => {
    const fetchInvoiceStatusFn = mock(async () => ({
      errCode: 101,
      invoiceId: "invoice_123",
      modifiedDate: "2026-03-31T13:13:16Z",
      status: "expired",
    }));
    const syncMonobankPaymentStatusFn = mock(async () => undefined);
    const handler = createPostHandler({
      fetchInvoiceStatusFn,
      removeInvoiceFn: async () => {
        throw new Error(
          'Monobank API error: {"errCode":"INVOICE_EXPIRED","errText":"expired"}',
        );
      },
      requireTrustedInternalAdminFn: async () => ({
        admin: {
          email: "person@example.com",
          name: "Ada Lovelace",
          role: "admin",
          userId: "user_123",
        },
        ok: true,
      }),
      syncMonobankPaymentStatusFn,
    });

    const response = await handler(createRequest({ invoiceId: "invoice_123" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      errCode: 101,
      invoiceId: "invoice_123",
      modifiedDate: "2026-03-31T13:13:16Z",
      status: "expired",
    });
    expect(syncMonobankPaymentStatusFn).toHaveBeenCalledWith({
      errCode: 101,
      invoiceId: "invoice_123",
      modifiedDate: "2026-03-31T13:13:16Z",
      status: "expired",
    });
  });
});
