import { describe, expect, it } from "bun:test";
import {
  isPendingMonobankPayment,
  normalizeMonobankStatus,
  resolveMonobankPaymentStatus,
} from "./payments.js";

describe("normalizeMonobankStatus", () => {
  it("maps external Monobank statuses to internal statuses", () => {
    expect(normalizeMonobankStatus("created")).toBe("invoice_created");
    expect(normalizeMonobankStatus("success")).toBe("paid");
    expect(normalizeMonobankStatus("failure")).toBe("failed");
    expect(normalizeMonobankStatus("expired")).toBe("expired");
    expect(normalizeMonobankStatus("refunded")).toBe("reversed");
  });

  it("returns null for empty or unknown statuses", () => {
    expect(normalizeMonobankStatus(undefined)).toBeNull();
    expect(normalizeMonobankStatus("unknown")).toBeNull();
  });
});

describe("resolveMonobankPaymentStatus", () => {
  it("prefers the latest provider status when it is recognized", () => {
    expect(resolveMonobankPaymentStatus("creation_failed", "created")).toBe(
      "invoice_created",
    );
    expect(resolveMonobankPaymentStatus("invoice_created", "hold")).toBe(
      "processing",
    );
  });

  it("falls back to the stored payment status when provider status is missing", () => {
    expect(resolveMonobankPaymentStatus("invoice_created", undefined)).toBe(
      "invoice_created",
    );
    expect(resolveMonobankPaymentStatus("processing", "unknown")).toBe(
      "processing",
    );
  });
});

describe("isPendingMonobankPayment", () => {
  it("treats provider-created invoices as pending even when stored status drifted", () => {
    expect(isPendingMonobankPayment("creation_failed", "created")).toBe(true);
    expect(isPendingMonobankPayment("draft", "hold")).toBe(true);
  });

  it("returns false for terminal payment states", () => {
    expect(isPendingMonobankPayment("paid", "success")).toBe(false);
    expect(isPendingMonobankPayment("expired", "expired")).toBe(false);
    expect(isPendingMonobankPayment("cancelled", "cancelled")).toBe(false);
  });
});
