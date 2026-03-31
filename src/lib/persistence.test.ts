import { describe, expect, it } from "bun:test";

import {
  cleanNullableText,
  shouldBootstrapAppUserByEmail,
} from "./persistence.js";

describe("shouldBootstrapAppUserByEmail", () => {
  it("allows email bootstrap before a canonical app user id exists", () => {
    expect(
      shouldBootstrapAppUserByEmail({
        appUserId: null,
        email: "admin@example.com",
      }),
    ).toBe(true);
  });

  it("disables email bootstrap once the canonical app user id exists", () => {
    expect(
      shouldBootstrapAppUserByEmail({
        appUserId: "app_user_1",
        email: "admin@example.com",
      }),
    ).toBe(false);
  });
});

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
