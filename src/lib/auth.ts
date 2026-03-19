import { createClerkClient } from "@clerk/backend";
import { json } from "./response";

export function requireInternalApiKey(request: Request) {
  const expectedApiKey = process.env.INTERNAL_API_KEY?.trim();

  if (!expectedApiKey) {
    return json(
      { error: "INTERNAL_API_KEY is missing in environment variables." },
      { status: 500 },
    );
  }

  const providedApiKey = request.headers.get("x-internal-api-key")?.trim();

  if (providedApiKey !== expectedApiKey) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

function getClerkSecretKey() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is missing in environment variables.");
  }

  return secretKey;
}

function getClerkPublishableKey() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    throw new Error(
      "CLERK_PUBLISHABLE_KEY is missing in environment variables.",
    );
  }

  return publishableKey;
}

function getAuthorizedParties() {
  const value = process.env.CLERK_AUTHORIZED_PARTIES?.trim();

  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export async function requireAuthenticatedAdmin(request: Request) {
  try {
    const clerkClient = createClerkClient({
      publishableKey: getClerkPublishableKey(),
      secretKey: getClerkSecretKey(),
    });

    const requestState = await clerkClient.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: getAuthorizedParties(),
    });

    if (!requestState.isAuthenticated) {
      return json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = requestState.toAuth();

    if (!userId) {
      return json({ error: "Unauthorized." }, { status: 401 });
    }

    const user = await clerkClient.users.getUser(userId);
    const role = user.privateMetadata.role;

    if (role !== "admin") {
      return json({ error: "Forbidden." }, { status: 403 });
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return json(
      { error: `Failed to authorize request: ${message}` },
      { status: 500 },
    );
  }
}
