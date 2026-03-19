import { describe, expect, it } from "bun:test";
import { createRequireAuthenticatedAdmin } from "./auth";

describe("createRequireAuthenticatedAdmin", () => {
  it("allows authenticated admins", async () => {
    const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin(() => ({
      authenticateRequest: async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "user_123" }),
      }),
      users: {
        getUser: async () => ({
          privateMetadata: { role: "admin" },
        }),
      },
    }));

    const response = await requireAuthenticatedAdmin(
      new Request("https://example.com"),
    );

    expect(response).toBeNull();
  });

  it("rejects authenticated non-admins", async () => {
    const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin(() => ({
      authenticateRequest: async () => ({
        isAuthenticated: true,
        toAuth: () => ({ userId: "user_123" }),
      }),
      users: {
        getUser: async () => ({
          privateMetadata: { role: "user" },
        }),
      },
    }));

    const response = await requireAuthenticatedAdmin(
      new Request("https://example.com"),
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "Forbidden." });
  });
});
