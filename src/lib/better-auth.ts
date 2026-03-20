import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

import { isAdminEmail } from "./admin";
import { env } from "./env";

declare global {
  var __lmsSlsAuthPool: Pool | undefined;
}

function readCsvEnv(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function shouldUseSsl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return !["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getTrustedOrigins() {
  return Array.from(
    new Set([
      env.betterAuthUrl,
      "http://localhost:3000",
      "http://localhost:3001",
      ...readCsvEnv(env.betterAuthTrustedOrigins),
    ]),
  );
}

function getCrossSubDomainCookies() {
  const domain = env.betterAuthCookieDomain;

  if (!domain) {
    return undefined;
  }

  return {
    enabled: true,
    domain,
  } as const;
}

function getPool() {
  if (!globalThis.__lmsSlsAuthPool) {
    const connectionString = env.databaseUrl;

    globalThis.__lmsSlsAuthPool = new Pool({
      connectionString,
      max: 10,
      ssl: shouldUseSsl(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return globalThis.__lmsSlsAuthPool;
}

export const auth = betterAuth({
  advanced: {
    ...(getCrossSubDomainCookies()
      ? {
          crossSubDomainCookies: getCrossSubDomainCookies(),
        }
      : {}),
    database: {
      generateId: () => crypto.randomUUID(),
    },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  appName: "LMS Admin",
  baseURL: env.betterAuthUrl,
  database: getPool(),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: isAdminEmail(user.email) ? "admin" : "user",
          },
        }),
      },
      update: {
        before: async (user) => {
          if (typeof user.email !== "string") {
            return { data: user };
          }

          return {
            data: {
              ...user,
              role: isAdminEmail(user.email) ? "admin" : "user",
            },
          };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [dash()],
  secret: env.betterAuthSecret,
  trustedOrigins: getTrustedOrigins(),
  account: {
    fields: {
      accessToken: "access_token",
      accessTokenExpiresAt: "access_token_expires_at",
      accountId: "account_id",
      createdAt: "created_at",
      idToken: "id_token",
      providerId: "provider_id",
      refreshToken: "refresh_token",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      updatedAt: "updated_at",
      userId: "user_id",
    },
    modelName: "auth_accounts",
  },
  session: {
    fields: {
      createdAt: "created_at",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      updatedAt: "updated_at",
      userAgent: "user_agent",
      userId: "user_id",
    },
    modelName: "auth_sessions",
  },
  user: {
    additionalFields: {
      role: {
        defaultValue: "user",
        input: false,
        required: false,
        type: ["user", "admin"],
      },
    },
    fields: {
      createdAt: "created_at",
      emailVerified: "email_verified",
      updatedAt: "updated_at",
    },
    modelName: "auth_users",
  },
  verification: {
    fields: {
      createdAt: "created_at",
      expiresAt: "expires_at",
      updatedAt: "updated_at",
    },
    modelName: "auth_verifications",
  },
});

export type AuthSession = typeof auth.$Infer.Session;
