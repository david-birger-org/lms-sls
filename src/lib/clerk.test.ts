import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { syncClerkUserMetadata } from "./clerk";

describe("syncClerkUserMetadata", () => {
  const originalSecret = process.env.CLERK_SECRET_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = "sk_test_123";
  });

  afterEach(() => {
    process.env.CLERK_SECRET_KEY = originalSecret;
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("preserves existing private metadata keys", async () => {
    let requestBody = "";
    const fetchMock = mock(async (_input: unknown, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(null, { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncClerkUserMetadata({
      appUserId: "app_user_1",
      role: "admin",
      user: {
        id: "clerk_user_1",
        private_metadata: {
          locale: "uk",
          role: "admin",
        },
      },
    });

    const payload = JSON.parse(requestBody);

    expect(payload).toEqual({
      private_metadata: {
        locale: "uk",
        role: "admin",
        userId: "app_user_1",
      },
    });
  });
});
