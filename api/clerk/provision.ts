import { requireAuthenticatedAdmin } from "../../src/lib/auth";
import { getClerkUserById } from "../../src/lib/clerk";
import { getErrorMessage } from "../../src/lib/errors";
import { upsertClerkUser } from "../../src/lib/persistence";
import { json } from "../../src/lib/response";

interface ProvisionRequestBody {
  clerkUserId?: unknown;
}

function parseClerkUserId(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const clerkUserId = (body as ProvisionRequestBody).clerkUserId;

  if (typeof clerkUserId !== "string") {
    return null;
  }

  const normalized = clerkUserId.trim();

  return normalized.length > 0 ? normalized : null;
}

export async function POST(request: Request) {
  const unauthorizedResponse = await requireAuthenticatedAdmin(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const body = (await request.json()) as unknown;
    const clerkUserId = parseClerkUserId(body);

    if (!clerkUserId) {
      return json({ error: "clerkUserId is required." }, { status: 400 });
    }

    const clerkUser = await getClerkUserById(clerkUserId);
    const appUser = await upsertClerkUser(clerkUser);

    return json({ appUserId: appUser.id, clerkUserId: appUser.clerk_user_id });
  } catch (error) {
    return json(
      { error: `Failed to provision Clerk user: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
