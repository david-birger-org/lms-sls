import { describe, expect, it } from "bun:test";
import { normalizeMonobankStatus } from "./payments.js";

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
