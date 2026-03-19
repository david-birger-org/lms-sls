import {
  type ClerkDeletedUser,
  type ClerkUser,
  verifyClerkWebhook,
} from "../../src/lib/clerk";
import {
  markClerkUserDeleted,
  upsertClerkUser,
} from "../../src/lib/persistence";
import { json } from "../../src/lib/response";

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
    const message = error instanceof Error ? error.message : "Unexpected error";
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
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("Failed to persist Clerk webhook", {
      clerkEventType: event.type,
      clerkUserId:
        event.type === "user.created" || event.type === "user.updated"
          ? (event.data as ClerkUser | null | undefined)?.id ?? null
          : event.type === "user.deleted"
            ? (event.data as ClerkDeletedUser | null | undefined)?.id ?? null
            : null,
      error,
      payload: event.data,
    });

    return json(
      { error: `Failed to persist Clerk webhook: ${message}` },
      { status: 500 },
    );
  }
}
