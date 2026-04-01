import { describe, expect, it } from "bun:test";

import { cleanNullableText } from "./invoice-store.js";

describe("cleanNullableText", () => {
  it("trims string values", () => {
    expect(cleanNullableText("  invoice_123  ")).toBe("invoice_123");
  });

  it("preserves primitive non-string values by stringifying them", () => {
    expect(cleanNullableText(101)).toBe("101");
    expect(cleanNullableText(false)).toBe("false");
  });

  it("returns null for empty strings and unsupported values", () => {
    expect(cleanNullableText("   ")).toBeNull();
    expect(cleanNullableText({ errCode: "INVOICE_EXPIRED" })).toBeNull();
    expect(cleanNullableText(undefined)).toBeNull();
  });
});
