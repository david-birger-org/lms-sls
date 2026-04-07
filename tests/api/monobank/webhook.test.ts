import { describe, expect, it, mock } from "bun:test";
import { createPostHandler } from "../../../api/monobank/webhook.js";

function createRequest(body: unknown, headers?: Record<string, string>) {
  return new Request("https://example.com/api/monobank/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/monobank/webhook", () => {
  it("rejects missing signatures", async () => {
    const handler = createPostHandler({
      getMonobankPublicKeyFn: async () => "public-key",
      syncMonobankPaymentStatusFn: async () => undefined,
      verifyMonobankWebhookSignatureFn: () => true,
    });

    const response = await handler(createRequest({ invoiceId: "invoice_123" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "X-Sign header is required.",
    });
  });

  it("refreshes the Monobank public key when cached verification fails", async () => {
    const getMonobankPublicKeyFn = mock(
      async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) =>
        forceRefresh ? "fresh-key" : "cached-key",
    );
    const syncMonobankPaymentStatusFn = mock(async () => undefined);
    const verifyMonobankWebhookSignatureFn = mock(
      ({ publicKey }: { publicKey: string }) => publicKey === "fresh-key",
    );
    const handler = createPostHandler({
      getMonobankPublicKeyFn,
      syncMonobankPaymentStatusFn,
      verifyMonobankWebhookSignatureFn,
    });

    const payload = {
      invoiceId: "invoice_123",
      modifiedDate: "2026-03-30T12:00:00Z",
      status: "success",
    };
    const response = await handler(
      createRequest(payload, { "x-sign": "valid-signature" }),
    );

    expect(response.status).toBe(200);
    expect(getMonobankPublicKeyFn).toHaveBeenCalledTimes(2);
    expect(verifyMonobankWebhookSignatureFn).toHaveBeenCalledTimes(2);
    expect(syncMonobankPaymentStatusFn).toHaveBeenCalledWith(payload);
  });

  it("rejects invalid signatures after a forced refresh", async () => {
    const handler = createPostHandler({
      getMonobankPublicKeyFn: async () => "public-key",
      syncMonobankPaymentStatusFn: async () => undefined,
      verifyMonobankWebhookSignatureFn: () => false,
    });

    const response = await handler(
      createRequest(
        { invoiceId: "invoice_123", status: "processing" },
        { "x-sign": "bad-signature" },
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Invalid webhook signature.",
    });
  });
});
