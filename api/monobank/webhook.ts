import { getErrorMessage } from "../../src/lib/errors.js";
import {
  getMonobankPublicKey,
  type MonobankInvoiceStatusResponse,
  verifyMonobankWebhookSignature,
} from "../../src/lib/monobank.js";
import { syncMonobankPaymentStatus } from "../../src/lib/persistence.js";
import { json } from "../../src/lib/response.js";

function getWebhookSignature(request: Request) {
  const signature = request.headers.get("x-sign")?.trim();
  return signature ? signature : null;
}

export function createPostHandler({
  getMonobankPublicKeyFn = getMonobankPublicKey,
  syncMonobankPaymentStatusFn = syncMonobankPaymentStatus,
  verifyMonobankWebhookSignatureFn = verifyMonobankWebhookSignature,
}: {
  getMonobankPublicKeyFn?: typeof getMonobankPublicKey;
  syncMonobankPaymentStatusFn?: typeof syncMonobankPaymentStatus;
  verifyMonobankWebhookSignatureFn?: typeof verifyMonobankWebhookSignature;
} = {}) {
  return async function POST(request: Request) {
    try {
      const signature = getWebhookSignature(request);

      if (!signature) {
        return json({ error: "X-Sign header is required." }, { status: 401 });
      }

      const body = await request.text();

      if (!body.trim()) {
        return json({ error: "Webhook body is required." }, { status: 400 });
      }

      let publicKey = await getMonobankPublicKeyFn();
      let isValidSignature = verifyMonobankWebhookSignatureFn({
        body,
        publicKey,
        signature,
      });

      if (!isValidSignature) {
        publicKey = await getMonobankPublicKeyFn({ forceRefresh: true });
        isValidSignature = verifyMonobankWebhookSignatureFn({
          body,
          publicKey,
          signature,
        });
      }

      if (!isValidSignature) {
        return json({ error: "Invalid webhook signature." }, { status: 401 });
      }

      const payload = JSON.parse(body) as MonobankInvoiceStatusResponse;
      await syncMonobankPaymentStatusFn(payload);

      return json({ ok: true });
    } catch (error) {
      return json(
        {
          error: `Failed to process Monobank webhook: ${getErrorMessage(error)}`,
        },
        { status: 500 },
      );
    }
  };
}

export const POST = createPostHandler();
