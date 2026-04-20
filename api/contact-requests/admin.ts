import {
  selectContactRequests,
  toContactRequestRecord,
  updateContactRequestProcessed,
} from "../../src/lib/contact-requests/index.js";
import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import { getAppUserIdByAuthUserId } from "../../src/lib/invoice-store.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async () => {
  try {
    const rows = await selectContactRequests();
    return json({ requests: rows.map(toContactRequestRecord) });
  } catch (error) {
    return json(
      { error: `Failed to fetch contact requests: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});

export const PUT = withTrustedInternalAdmin(async (request, admin) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id)
    return json({ error: "Missing contact request id." }, { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as {
      processed?: unknown;
    } | null;

    if (typeof body?.processed !== "boolean")
      return json({ error: "processed must be a boolean." }, { status: 400 });

    const processedBy = body.processed
      ? await getAppUserIdByAuthUserId(admin.userId)
      : null;

    const row = await updateContactRequestProcessed({
      id,
      processed: body.processed,
      processedBy,
    });

    if (!row)
      return json({ error: "Contact request not found." }, { status: 404 });

    return json({ request: toContactRequestRecord(row) });
  } catch (error) {
    return json(
      { error: `Failed to update contact request: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});
