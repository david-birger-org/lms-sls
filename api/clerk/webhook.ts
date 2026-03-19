import {
  type ClerkDeletedUser,
  type ClerkUser,
  verifyClerkWebhook,
} from "../../src/lib/clerk";
import { getErrorMessage } from "../../src/lib/errors";
import {
  markClerkUserDeleted,
  upsertClerkUser,
} from "../../src/lib/persistence";
import { json } from "../../src/lib/response";

function getWebhookUserId(event: { data: unknown; type: string }) {
  switch (event.type) {
    case "user.created":
    case "user.updated":
      return (event.data as ClerkUser | null | undefined)?.id ?? null;
    case "user.deleted":
      return (event.data as ClerkDeletedUser | null | undefined)?.id ?? null;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  let event:
    | {
        data: unknown;
        type: string;
      }
    | undefined;

  try {
    ({ event } = await verifyClerkWebhook(request));
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message.includes("CLERK_WEBHOOK") ? 500 : 400;

    return json(
      { error: `Failed to verify Clerk webhook: ${message}` },
      { status },
    );
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const user = event.data as ClerkUser;

        if (!user.id) {
          return json(
            { error: "Clerk user payload is missing id." },
            { status: 400 },
          );
        }

        await upsertClerkUser(user);

        return json({ clerkUserId: user.id, received: true, type: event.type });
      }

      case "user.deleted": {
        const user = event.data as ClerkDeletedUser;

        if (!user.id) {
          return json(
            { error: "Clerk delete payload is missing id." },
            { status: 400 },
          );
        }

        await markClerkUserDeleted(user.id, user);

        return json({ clerkUserId: user.id, received: true, type: event.type });
      }

      default:
        return json({ ignored: true, received: true, type: event.type });
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Failed to persist Clerk webhook", {
      clerkEventType: event.type,
      clerkUserId: getWebhookUserId(event),
      error,
      payload: event.data,
    });

    return json(
      { error: `Failed to persist Clerk webhook: ${message}` },
      { status: 500 },
    );
  }
}
