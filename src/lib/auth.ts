import type { AppUserRole } from "./clerk";
import { env } from "./env";
import { getErrorMessage } from "./errors";
import { json } from "./response";

let clerkClient: ClerkAuthClient | null = null;

interface ClerkAuthClient {
  authenticateRequest(
    request: Request,
    options: {
      acceptsToken: "session_token";
      authorizedParties?: string[];
    },
  ): Promise<{
    isAuthenticated: boolean;
    toAuth(): {
      userId?: string | null;
    };
  }>;
  users: {
    getUser(userId: string): Promise<{
      privateMetadata: {
        role?: unknown;
      };
    }>;
  };
}

async function getClerkClient() {
  if (!clerkClient) {
    const { createClerkClient } = await import("@clerk/backend");

    clerkClient = createClerkClient({
      publishableKey: env.clerkPublishableKey,
      secretKey: env.clerkSecretKey,
    }) as unknown as ClerkAuthClient;
  }

  return clerkClient;
}

function getRole(value: unknown): AppUserRole | null {
  return value === "admin" || value === "user" ? value : null;
}

export function createRequireAuthenticatedAdmin(
  clerkClientFactory: () => ClerkAuthClient | Promise<ClerkAuthClient> = () =>
    getClerkClient(),
) {
  return async function requireAuthenticatedAdmin(request: Request) {
    try {
      const clerkClient = await clerkClientFactory();

      const requestState = await clerkClient.authenticateRequest(request, {
        acceptsToken: "session_token",
        authorizedParties: env.clerkAuthorizedParties,
      });

      if (!requestState.isAuthenticated) {
        return json({ error: "Unauthorized." }, { status: 401 });
      }

      const { userId } = requestState.toAuth();

      if (!userId) {
        return json({ error: "Unauthorized." }, { status: 401 });
      }

      const user = await clerkClient.users.getUser(userId);
      const role = getRole(user.privateMetadata.role);

      if (role !== "admin") {
        return json({ error: "Forbidden." }, { status: 403 });
      }

      return null;
    } catch (error) {
      return json(
        { error: `Failed to authorize request: ${getErrorMessage(error)}` },
        { status: 500 },
      );
    }
  };
}

export const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin();
