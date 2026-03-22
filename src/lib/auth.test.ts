import { describe, expect, it } from "bun:test";
import { createRequireAuthenticatedAdmin } from "./auth.js";

function createAuthModuleStub(
  session: {
    session: {
      id: string;
      userId: string;
    };
    user: {
      email: string;
      id: string;
      name: string;
      role?: string | null;
    };
  } | null,
) {
  return {
    api: {
      getSession: async (_context: { headers: Headers }) => session,
    },
  };
}

describe("createRequireAuthenticatedAdmin", () => {
  it("allows trusted admin requests", async () => {
    const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin(
      () => "internal-key",
      () =>
        createAuthModuleStub({
          session: {
            id: "session_123",
            userId: "user_123",
          },
          user: {
            email: "admin@example.com",
            id: "user_123",
            name: "Admin",
            role: "admin",
          },
        }),
    );

    const response = await requireAuthenticatedAdmin(
      new Request("https://example.com", {
        headers: {
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

  it("rejects non-admin requests", async () => {
    const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin(
      () => "internal-key",
      () =>
        createAuthModuleStub({
          session: {
            id: "session_123",
            userId: "user_123",
          },
          user: {
            email: "user@example.com",
            id: "user_123",
            name: "User",
            role: "user",
          },
        }),
    );

    const response = await requireAuthenticatedAdmin(
      new Request("https://example.com", {
        headers: {
          "x-internal-api-key": "internal-key",
        },
      }),
    );

    expect(response.ok).toBe(false);

    if (response.ok) {
      throw new Error("Expected forbidden response.");
    }

    expect(response.response.status).toBe(403);
    expect(await response.response.json()).toEqual({ error: "Forbidden." });
  });

  it("rejects requests without the trusted internal key", async () => {
    const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin(
      () => "internal-key",
      () => createAuthModuleStub(null),
    );

    const response = await requireAuthenticatedAdmin(
      new Request("https://example.com", {
        headers: {},
      }),
    );

    expect(response.ok).toBe(false);

    if (response.ok) {
      throw new Error("Expected unauthorized response.");
    }

    expect(response.response.status).toBe(401);
    expect(await response.response.json()).toEqual({ error: "Unauthorized." });
  });
});
