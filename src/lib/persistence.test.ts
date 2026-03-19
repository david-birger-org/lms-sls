import { describe, expect, it } from "bun:test";
import {
  getPreferredClerkRole,
  shouldBootstrapAppUserByEmail,
} from "./persistence";

describe("getPreferredClerkRole", () => {
  it("prefers the current Clerk role when it exists", () => {
    expect(
      getPreferredClerkRole({
        currentRole: "admin",
        matchedAppUser: {
          clerk_user_id: "user_old",
          email: "admin@example.com",
          id: "app_user_1",
          raw_clerk_data: {
            private_metadata: {
              role: "user",
            },
          },
        },
      }),
    ).toBe("admin");
  });

  it("reuses the matched app user's stored role when a new Clerk user has none", () => {
    expect(
      getPreferredClerkRole({
        currentRole: null,
        matchedAppUser: {
          clerk_user_id: "user_old",
          email: "admin@example.com",
          id: "app_user_1",
          raw_clerk_data: {
            private_metadata: {
              role: "admin",
            },
          },
        },
      }),
    ).toBe("admin");
  });

  it("falls back to user when no role is available", () => {
    expect(
      getPreferredClerkRole({
        currentRole: null,
        matchedAppUser: null,
      }),
    ).toBe("user");
  });
});

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
