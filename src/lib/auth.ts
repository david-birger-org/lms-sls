import { isAdminUser } from "./admin";
import { auth } from "./better-auth";
import { env } from "./env";
import { getErrorMessage } from "./errors";
import { json } from "./response";

export interface AuthenticatedAdmin {
  email: string | null;
  name: string | null;
  role: "admin";
  userId: string;
}

type AuthSessionRecord = {
  id: string;
  userId: string;
  [key: string]: unknown;
};

type AuthUser = {
  email: string;
  id: string;
  name: string;
  role?: string | null;
  [key: string]: unknown;
};

type AuthSessionPayload = {
  session: AuthSessionRecord;
  user: AuthUser;
};

type AuthApi = {
  api: {
    getSession: (context: {
      headers: Headers;
    }) => Promise<AuthSessionPayload | null>;
  };
};

type ResolvedAdminSessionResult =
  | {
      admin: AuthenticatedAdmin;
      ok: true;
      session: AuthSessionRecord;
      user: AuthUser;
    }
  | {
      ok: false;
      response: Response;
    };

type RequireAuthenticatedAdminResult =
  | {
      admin: AuthenticatedAdmin;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function getTrimmedHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

export async function resolveAdminSession(
  request: Request,
  authInstance: AuthApi = auth,
): Promise<ResolvedAdminSessionResult> {
  try {
    const session = await authInstance.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return {
        ok: false,
        response: json({ error: "Unauthorized." }, { status: 401 }),
      };
    }

    if (!isAdminUser(session.user)) {
      return {
        ok: false,
        response: json({ error: "Forbidden." }, { status: 403 }),
      };
    }

    return {
      admin: {
        email: session.user.email,
        name: session.user.name,
        role: "admin",
        userId: session.user.id,
      },
      ok: true,
      session: session.session,
      user: session.user,
    };
  } catch (error) {
    return {
      ok: false,
      response: json(
        { error: `Failed to authorize request: ${getErrorMessage(error)}` },
        { status: 500 },
      ),
    };
  }
}

export function createRequireAuthenticatedAdmin(
  getInternalApiKey: () => string = () => env.internalApiKey,
  getAuthInstance: () => AuthApi = () => auth,
) {
  return async function requireAuthenticatedAdmin(
    request: Request,
  ): Promise<RequireAuthenticatedAdminResult> {
    try {
      const internalApiKey = getTrimmedHeader(
        request.headers,
        "x-internal-api-key",
      );

      if (!internalApiKey || internalApiKey !== getInternalApiKey()) {
        return {
          ok: false,
          response: json({ error: "Unauthorized." }, { status: 401 }),
        };
      }
      const access = await resolveAdminSession(request, getAuthInstance());

      if (!access.ok) {
        return access;
      }

      return {
        admin: access.admin,
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        response: json(
          { error: `Failed to authorize request: ${getErrorMessage(error)}` },
          { status: 500 },
        ),
      };
    }
  };
}

export const requireAuthenticatedAdmin = createRequireAuthenticatedAdmin();
