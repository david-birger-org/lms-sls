import { env } from "./env.js";
import { json } from "./response.js";

export interface TrustedUser {
  email: string | null;
  name: string | null;
  role: string;
  userId: string;
}

type RequireTrustedInternalUserResult =
  | {
      ok: true;
      user: TrustedUser;
    }
  | {
      ok: false;
      response: Response;
    };

function getTrimmedHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

function resolveTrustedUser(headers: Headers): TrustedUser | null {
  const userId = getTrimmedHeader(headers, "x-user-id");
  if (!userId) return null;

  return {
    email: getTrimmedHeader(headers, "x-user-email"),
    name: getTrimmedHeader(headers, "x-user-name"),
    role: getTrimmedHeader(headers, "x-user-role") ?? "user",
    userId,
  };
}

export async function requireTrustedInternalUser(
  request: Request,
): Promise<RequireTrustedInternalUserResult> {
  const internalApiKey = getTrimmedHeader(
    request.headers,
    "x-internal-api-key",
  );

  if (!internalApiKey || internalApiKey !== env.internalApiKey)
    return {
      ok: false,
      response: json({ error: "Unauthorized." }, { status: 401 }),
    };

  const user = resolveTrustedUser(request.headers);

  if (!user)
    return {
      ok: false,
      response: json(
        { error: "Trusted user headers are missing." },
        { status: 400 },
      ),
    };

  return { ok: true, user };
}
