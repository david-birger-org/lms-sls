import { env } from "../../../src/lib/env.js";
import { getErrorMessage } from "../../../src/lib/errors.js";
import { requireTrustedInternalAdmin } from "../../../src/lib/internal-auth.js";
import { mirrorAuthUserToAppUsers } from "../../../src/lib/invoice-store.js";
import { json } from "../../../src/lib/response.js";
import {
  grantUserFeature,
  revokeUserFeature,
  selectActiveFeatures,
} from "../../../src/lib/user-features/queries.js";

interface RequestBody {
  action?: unknown;
  authUserId?: unknown;
  email?: unknown;
  feature?: unknown;
  fullName?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function handleUpsert(body: RequestBody) {
  if (!isNonEmptyString(body.authUserId))
    return json({ error: "authUserId is required." }, { status: 400 });

  const email = isNonEmptyString(body.email) ? body.email : null;
  const fullName = isNonEmptyString(body.fullName)
    ? body.fullName
    : email?.split("@")[0] || body.authUserId;

  const appUserId = await mirrorAuthUserToAppUsers({
    authUserId: body.authUserId,
    email,
    fullName,
  });

  return json({ appUserId });
}

async function handleFeatureAction(
  body: RequestBody,
  action: "grant-feature" | "revoke-feature",
  request: Request,
) {
  const adminAccess = await requireTrustedInternalAdmin(request);
  if (!adminAccess.ok) return adminAccess.response;

  if (!isNonEmptyString(body.authUserId))
    return json({ error: "authUserId is required." }, { status: 400 });

  if (!isNonEmptyString(body.feature))
    return json({ error: "feature is required." }, { status: 400 });

  const { getAppUserIdByAuthUserId } = await import(
    "../../../src/lib/invoice-store.js"
  );
  const grantedByAppUserId = await getAppUserIdByAuthUserId(
    adminAccess.admin.userId,
  );

  if (action === "grant-feature")
    await grantUserFeature({
      authUserId: body.authUserId,
      feature: body.feature,
      grantedByAppUserId,
    });
  else
    await revokeUserFeature({
      authUserId: body.authUserId,
      feature: body.feature,
    });

  const features = await selectActiveFeatures(body.authUserId);

  return json({
    features: features.map((f) => ({
      feature: f.feature,
      grantedAt: f.granted_at,
    })),
  });
}

export async function POST(request: Request) {
  const internalApiKey = request.headers.get("x-internal-api-key")?.trim();
  if (!internalApiKey || internalApiKey !== env.internalApiKey)
    return json({ error: "Unauthorized." }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action =
    typeof body.action === "string" ? body.action.trim() : undefined;

  try {
    if (action === "grant-feature" || action === "revoke-feature")
      return await handleFeatureAction(body, action, request);

    return await handleUpsert(body);
  } catch (error) {
    return json(
      { error: `Failed to process request: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
