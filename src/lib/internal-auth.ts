import { env } from "./env.js";
import { json } from "./response.js";

export interface TrustedAdmin {
  email: string | null;
  name: string | null;
  role: "admin";
  userId: string;
}

type RequireTrustedInternalAdminResult =
  | {
      admin: TrustedAdmin;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

type TrustedInternalAdminHandler = (
  request: Request,
  admin: TrustedAdmin,
) => Response | Promise<Response>;

function getTrimmedHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

function resolveTrustedAdmin(headers: Headers) {
  const userId = getTrimmedHeader(headers, "x-admin-user-id");

  if (!userId) {
    return null;
  }

  return {
    email: getTrimmedHeader(headers, "x-admin-email"),
    name: getTrimmedHeader(headers, "x-admin-name"),
    role: "admin" as const,
    userId,
  };
}

export function createRequireTrustedInternalAdmin(
  getInternalApiKey: () => string = () => env.internalApiKey,
) {
  return async function requireTrustedInternalAdmin(
    request: Request,
  ): Promise<RequireTrustedInternalAdminResult> {
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

    const admin = resolveTrustedAdmin(request.headers);

    if (!admin) {
      return {
        ok: false,
        response: json(
          { error: "Trusted admin headers are missing." },
          { status: 400 },
        ),
      };
    }

    return {
      admin,
      ok: true,
    };
  };
}

export const requireTrustedInternalAdmin = createRequireTrustedInternalAdmin();

export function withTrustedInternalAdmin(handler: TrustedInternalAdminHandler) {
  return async function handleTrustedInternalAdminRequest(request: Request) {
    const access = await requireTrustedInternalAdmin(request);
    if (!access.ok) return access.response;
    return handler(request, access.admin);
  };
}
