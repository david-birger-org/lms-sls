import { describe, expect, it } from "bun:test";

import { createRequireTrustedInternalAdmin } from "./internal-auth.js";

describe("createRequireTrustedInternalAdmin", () => {
  it("allows trusted admin requests", async () => {
    const requireTrustedInternalAdmin = createRequireTrustedInternalAdmin(
      () => "internal-key",
    );

    const response = await requireTrustedInternalAdmin(
      new Request("https://example.com", {
        headers: {
          "x-admin-email": "admin@example.com",
          "x-admin-name": "Admin",
          "x-admin-user-id": "user_123",
          "x-internal-api-key": "internal-key",
        },
      }),
    );

    expect(response).toEqual({
      admin: {
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        userId: "user_123",
      },
      ok: true,
    });
  });

  it("rejects requests without the trusted internal key", async () => {
    const requireTrustedInternalAdmin = createRequireTrustedInternalAdmin(
      () => "internal-key",
    );

    const response = await requireTrustedInternalAdmin(
      new Request("https://example.com", {
        headers: {
          "x-admin-user-id": "user_123",
        },
      }),
    );

    expect(response.ok).toBe(false);

    if (response.ok) {
      throw new Error("Expected unauthorized response.");
    }

    expect(response.response.status).toBe(401);
    expect(await response.response.json()).toEqual({ error: "Unauthorized." });
  });

  it("rejects requests without trusted admin headers", async () => {
    const requireTrustedInternalAdmin = createRequireTrustedInternalAdmin(
      () => "internal-key",
    );

    const response = await requireTrustedInternalAdmin(
      new Request("https://example.com", {
        headers: {
          "x-internal-api-key": "internal-key",
        },
      }),
    );

    expect(response.ok).toBe(false);

    if (response.ok) {
      throw new Error("Expected bad request response.");
    }

    expect(response.response.status).toBe(400);
    expect(await response.response.json()).toEqual({
      error: "Trusted admin headers are missing.",
    });
  });
});
