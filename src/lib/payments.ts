export const PAYMENT_STATUSES = [
  "draft",
  "creating_invoice",
  "creation_failed",
  "invoice_created",
  "processing",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "reversed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const MONOBANK_STATUS_MAP = {
  created: "invoice_created",
  expired: "expired",
  failure: "failed",
  hold: "processing",
  processing: "processing",
  refunded: "reversed",
  reversed: "reversed",
  success: "paid",
  cancelled: "cancelled",
} as const satisfies Record<string, PaymentStatus>;

export function normalizeMonobankStatus(
  status?: string | null,
): PaymentStatus | null {
  const normalizedStatus = status?.trim().toLowerCase();

  if (!normalizedStatus) {
    return null;
  }

  return (
    MONOBANK_STATUS_MAP[normalizedStatus as keyof typeof MONOBANK_STATUS_MAP] ??
    null
  );
}
