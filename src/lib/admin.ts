const ADMIN_ROLE = "admin";

type RoleValue = string | null | undefined;

type UserLike = {
  email?: string | null;
  role?: RoleValue;
};

function normalizeRole(role: RoleValue) {
  return role?.trim().toLowerCase();
}

function getAdminEmails() {
  const value = process.env.ADMIN_EMAILS?.trim();

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

export function isAdminRole(role: RoleValue) {
  return normalizeRole(role) === ADMIN_ROLE;
}

export function isAdminEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? getAdminEmails().includes(normalizedEmail) : false;
}

export function resolveUserRole(user: UserLike | null | undefined) {
  if (isAdminEmail(user?.email)) {
    return ADMIN_ROLE;
  }

  return typeof user?.role === "string" ? user.role : undefined;
}

export function isAdminUser(user: UserLike | null | undefined) {
  return isAdminRole(resolveUserRole(user));
}
