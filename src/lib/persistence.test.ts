import { describe, expect, it } from "bun:test";
import { shouldBootstrapAppUserByEmail } from "./persistence";

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
