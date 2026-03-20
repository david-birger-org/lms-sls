import { env } from "./env";

export type AppUserRole = "admin" | "user";

interface ClerkMetadata {
  [key: string]: unknown;
}

interface ClerkPrivateMetadata extends ClerkMetadata {
  role?: unknown;
  userId?: unknown;
}

export interface ClerkEmailAddress {
  email_address?: string | null;
  id?: string | null;
}

export interface ClerkUser {
  created_at?: number | null;
  email_addresses?: ClerkEmailAddress[];
  first_name?: string | null;
  id?: string | null;
  image_url?: string | null;
  last_name?: string | null;
  private_metadata?: ClerkPrivateMetadata | null;
  primary_email_address_id?: string | null;
  public_metadata?: ClerkMetadata | null;
  updated_at?: number | null;
  username?: string | null;
}

function getClerkBackendApiBaseUrl() {
  return "https://api.clerk.com/v1";
}

function getClerkPrivateMetadata(user: ClerkUser) {
  return user.private_metadata && typeof user.private_metadata === "object"
    ? { ...user.private_metadata }
    : {};
}

export function cleanNullableText(value?: string | null) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function getClerkMetadataValue(
  metadata: ClerkMetadata | null | undefined,
  key: string,
) {
  return metadata && typeof metadata === "object" ? metadata[key] : undefined;
}

export function getClerkUserRole(user: ClerkUser): AppUserRole | null {
  const role = getClerkMetadataValue(user.private_metadata, "role");

  if (role === "admin" || role === "user") {
    return role;
  }

  return null;
}

export function getClerkDatabaseUserId(user: ClerkUser) {
  const userId = getClerkMetadataValue(user.private_metadata, "userId");

  if (typeof userId !== "string") {
    return null;
  }

  return cleanNullableText(userId);
}

export function buildFullName(
  firstName?: string | null,
  lastName?: string | null,
) {
  const fullName = [cleanNullableText(firstName), cleanNullableText(lastName)]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  return fullName || null;
}

export function getClerkPrimaryEmail(user: ClerkUser) {
  const primaryEmailAddressId = cleanNullableText(
    user.primary_email_address_id,
  );
  const emailAddresses = user.email_addresses ?? [];

  if (primaryEmailAddressId) {
    const primaryEmail = emailAddresses.find(
      (emailAddress) => emailAddress.id === primaryEmailAddressId,
    );

    if (primaryEmail?.email_address) {
      return cleanNullableText(primaryEmail.email_address);
    }
  }

  for (const emailAddress of emailAddresses) {
    if (emailAddress.email_address) {
      return cleanNullableText(emailAddress.email_address);
    }
  }

  return null;
}

export function toDateFromClerkTimestamp(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

export async function getClerkUserById(
  clerkUserId: string,
): Promise<ClerkUser> {
  const normalizedClerkUserId = cleanNullableText(clerkUserId);

  if (!normalizedClerkUserId) {
    throw new Error("Clerk user id is required.");
  }

  const response = await fetch(
    `${getClerkBackendApiBaseUrl()}/users/${encodeURIComponent(normalizedClerkUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.clerkSecretKey}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Clerk user ${normalizedClerkUserId}: ${errorText}`,
    );
  }

  return (await response.json()) as ClerkUser;
}

export async function syncClerkUserMetadata({
  appUserId,
  role,
  user,
}: {
  appUserId: string;
  role: AppUserRole;
  user: ClerkUser;
}) {
  const clerkUserId = cleanNullableText(user.id);

  if (!clerkUserId) {
    throw new Error("Clerk user payload is missing id.");
  }

  const currentRole = getClerkUserRole(user);
  const currentDatabaseUserId = getClerkDatabaseUserId(user);
  const desiredRole = role;

  if (currentRole === desiredRole && currentDatabaseUserId === appUserId) {
    return { role: desiredRole, updated: false };
  }

  const response = await fetch(
    `${getClerkBackendApiBaseUrl()}/users/${encodeURIComponent(clerkUserId)}/metadata`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        private_metadata: {
          ...getClerkPrivateMetadata(user),
          role: desiredRole,
          userId: appUserId,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to update Clerk metadata for ${clerkUserId}: ${errorText}`,
    );
  }

  return { role: desiredRole, updated: true };
}
