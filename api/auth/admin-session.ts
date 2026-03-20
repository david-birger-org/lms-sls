import { resolveAdminSession } from "../../src/lib/auth";

export async function GET(request: Request) {
  const access = await resolveAdminSession(request);

  if (!access.ok) {
    return access.response;
  }

  return Response.json({
    role: access.admin.role,
    session: access.session,
    user: access.user,
  });
}
