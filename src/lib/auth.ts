import { createClerkClient } from "@clerk/backend";
import type { AppUserRole } from "./clerk";
import { env } from "./env";
import { getErrorMessage } from "./errors";
import { json } from "./response";

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

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

function getClerkClient() {
  if (!clerkClient) {
    clerkClient = createClerkClient({
      publishableKey: env.clerkPublishableKey,
      secretKey: env.clerkSecretKey,
    });
  }

  return clerkClient;
}

function getRole(value: unknown): AppUserRole | null {
  return value === "admin" || value === "user" ? value : null;
}

export function createRequireAuthenticatedAdmin(
  clerkClientFactory: () => ClerkAuthClient = () =>
    getClerkClient() as unknown as ClerkAuthClient,
) {
  return async function requireAuthenticatedAdmin(request: Request) {
    try {
      const clerkClient = clerkClientFactory();

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
