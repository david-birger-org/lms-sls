import {
  insertPendingInvoiceRow,
  selectLatestProviderStateRow,
  selectPaymentHistoryRowByInvoiceId,
  selectPaymentHistoryRows,
  selectPendingPaymentRows,
  updateCreatedInvoiceRow,
  updateInvoiceCancelledRow,
  updateInvoiceCreationFailedRow,
  updatePaymentProviderStateRow,
  upsertAppUserRow,
} from "./invoice-store/queries.js";
import type {
  CreatePendingInvoiceInput,
  EnsureAppUserInput,
  MarkInvoiceCreationFailedInput,
  PaymentDetailsRecord,
  PaymentHistoryRecord,
  PaymentHistoryRow,
  PendingInvoiceRecord,
  PendingPaymentRow,
  StoreCreatedInvoiceInput,
} from "./invoice-store/types.js";
import type {
  MonobankInvoiceStatusResponse,
  MonobankPaymentInfo,
} from "./monobank.js";
import {
  normalizeMonobankStatus,
  type PaymentStatus,
  PENDING_MONOBANK_PROVIDER_STATUSES,
  PENDING_PAYMENT_STATUSES,
  resolveMonobankPaymentStatus,
} from "./payments.js";

export type {
  CreatePendingInvoiceInput,
  EnsureAppUserInput,
  MarkInvoiceCreationFailedInput,
  PaymentDetailsRecord,
  PaymentHistoryRecord,
  PendingInvoiceCreation,
  PendingInvoiceRecord,
  StoreCreatedInvoiceInput,
} from "./invoice-store/types.js";

const creatingInvoiceStatus =
  "creating_invoice" as const satisfies PaymentStatus;
const failedInvoiceStatus = "failed" as const satisfies PaymentStatus;
const createdInvoiceStatus = "invoice_created" as const satisfies PaymentStatus;
const cancelledInvoiceStatus = "cancelled" as const satisfies PaymentStatus;

const pendingInvoiceStatuses = PENDING_PAYMENT_STATUSES;
const pendingProviderStatuses = PENDING_MONOBANK_PROVIDER_STATUSES;

export function cleanNullableText(value?: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProviderTimestamp(value?: string | null) {
  const normalizedValue = cleanNullableText(value);

  if (!normalizedValue) {
    return null;
  }

  const timestamp = new Date(normalizedValue);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function normalizeMinorAmount(value: number | string) {
  if (typeof value === "number") {
    return value;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function normalizeOptionalMinorAmount(value: number | string | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsedValue = normalizeMinorAmount(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function normalizePaymentInfo(value: unknown): MonobankPaymentInfo | undefined {
  let rawValue: unknown = value;

  if (typeof value === "string") {
    try {
      rawValue = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  if (!isObjectRecord(rawValue)) {
    return undefined;
  }

  return {
    approvalCode: cleanNullableText(rawValue.approvalCode) ?? undefined,
    bank: cleanNullableText(rawValue.bank) ?? undefined,
    country: cleanNullableText(rawValue.country) ?? undefined,
    maskedPan: cleanNullableText(rawValue.maskedPan) ?? undefined,
    paymentMethod: cleanNullableText(rawValue.paymentMethod) ?? undefined,
    paymentSystem: cleanNullableText(rawValue.paymentSystem) ?? undefined,
    rrn: cleanNullableText(rawValue.rrn) ?? undefined,
    terminal: cleanNullableText(rawValue.terminal) ?? undefined,
    tranId: cleanNullableText(rawValue.tranId) ?? undefined,
  };
}

function resolveStoredPaymentStatus(row: {
  provider_status?: string | null;
  status?: PaymentStatus | null;
}) {
  return (
    resolveMonobankPaymentStatus(row.status, row.provider_status) ?? row.status
  );
}

function resolvePaymentHistoryDate(row: {
  created_at: string;
  provider_modified_at?: string | null;
}) {
  return row.provider_modified_at ?? row.created_at;
}

function toPendingInvoiceRecord(row: PendingPaymentRow): PendingInvoiceRecord {
  return {
    amount: normalizeMinorAmount(row.amount_minor),
    createdDate: row.created_at,
    currency: row.currency,
    customerName: row.customer_name,
    description: row.description,
    error: row.failure_reason ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    invoiceId: row.invoice_id,
    pageUrl: row.page_url ?? undefined,
    reference: row.reference,
    status: resolveStoredPaymentStatus(row) ?? row.status,
  };
}

function toPaymentHistoryRecord(row: PaymentHistoryRow): PaymentHistoryRecord {
  const paymentInfo = normalizePaymentInfo(row.payment_info);

  return {
    amount:
      normalizeOptionalMinorAmount(row.final_amount_minor) ??
      normalizeMinorAmount(row.amount_minor),
    ccy: row.currency,
    customerName: row.customer_name,
    date: resolvePaymentHistoryDate(row),
    destination: row.description,
    error: row.failure_reason ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    maskedPan: paymentInfo?.maskedPan,
    pageUrl: row.page_url ?? undefined,
    reference: row.reference,
    status: resolveStoredPaymentStatus(row) ?? undefined,
  };
}

function toPaymentDetailsRecord(row: PaymentHistoryRow): PaymentDetailsRecord {
  const paymentInfo = normalizePaymentInfo(row.payment_info);

  return {
    amount: normalizeMinorAmount(row.amount_minor),
    createdDate: row.created_at,
    ccy: row.currency,
    customerName: row.customer_name,
    destination: row.description,
    expiresAt: row.expires_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    finalAmount: normalizeOptionalMinorAmount(row.final_amount_minor),
    invoiceId: row.invoice_id ?? undefined,
    modifiedDate: row.provider_modified_at ?? undefined,
    pageUrl: row.page_url ?? undefined,
    paymentInfo,
    reference: row.reference,
    status: resolveStoredPaymentStatus(row) ?? undefined,
  };
}

export async function ensureAppUser(input: EnsureAppUserInput) {
  const email = cleanNullableText(input.email);
  const fullName = cleanNullableText(input.fullName) ?? input.authUserId;

  return upsertAppUserRow({
    authUserId: input.authUserId,
    email,
    fullName,
  });
}

export async function createPendingInvoice(input: CreatePendingInvoiceInput) {
  const paymentId = input.paymentId ?? crypto.randomUUID();
  const customerEmail = cleanNullableText(input.customerEmail);
  const customerName = cleanNullableText(input.customerName);

  if (!customerName) {
    throw new Error("Customer name is required to create an invoice record.");
  }

  return insertPendingInvoiceRow({
    amountMinor: input.amountMinor,
    currency: input.currency,
    customerEmail,
    customerName,
    description: input.description,
    paymentId,
    reference: `mb-${paymentId}`,
    status: creatingInvoiceStatus,
    userId: input.userId,
  });
}

export async function storeCreatedInvoice(input: StoreCreatedInvoiceInput) {
  await updateCreatedInvoiceRow({
    expiresAt: input.expiresAt,
    invoiceId: input.invoiceId,
    pageUrl: input.pageUrl,
    paymentId: input.paymentId,
    providerPayload: input.providerPayload,
    providerStatus: pendingProviderStatuses[0],
    status: createdInvoiceStatus,
  });
}

export async function markInvoiceCreationFailed(
  input: MarkInvoiceCreationFailedInput,
) {
  await updateInvoiceCreationFailedRow({
    errorMessage: cleanNullableText(input.errorMessage) ?? input.errorMessage,
    paymentId: input.paymentId,
    providerPayload: input.providerPayload,
    status: failedInvoiceStatus,
  });
}

export async function listPendingInvoices(limit = 50) {
  const rows = await selectPendingPaymentRows({
    limit,
    pendingProviderStatuses,
    pendingStatuses: pendingInvoiceStatuses,
  });

  return rows.map(toPendingInvoiceRecord);
}

export async function listPaymentHistory(days: number) {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await selectPaymentHistoryRows(fromDate.toISOString());

  return rows.map(toPaymentHistoryRecord);
}

export async function getPaymentDetailsByInvoiceId(invoiceId: string) {
  const row = await selectPaymentHistoryRowByInvoiceId(invoiceId);
  return row ? toPaymentDetailsRecord(row) : null;
}

export async function markInvoiceCancelled({
  invoiceId,
  providerPayload,
}: {
  invoiceId: string;
  providerPayload?: unknown;
}) {
  await updateInvoiceCancelledRow({
    invoiceId,
    providerPayload,
    status: cancelledInvoiceStatus,
  });
}

export async function syncMonobankPaymentStatus(
  invoiceStatus: MonobankInvoiceStatusResponse,
) {
  const invoiceId = cleanNullableText(invoiceStatus.invoiceId);
  const reference = cleanNullableText(invoiceStatus.reference);

  if (!invoiceId && !reference) {
    return;
  }

  const providerStatus = cleanNullableText(invoiceStatus.status);
  const normalizedStatus = normalizeMonobankStatus(providerStatus);
  const providerModifiedAt = normalizeProviderTimestamp(
    invoiceStatus.modifiedDate,
  );
  const existingProviderModifiedAt = normalizeProviderTimestamp(
    (
      await selectLatestProviderStateRow({
        invoiceId,
        reference,
      })
    )?.provider_modified_at,
  );

  if (
    providerModifiedAt &&
    existingProviderModifiedAt &&
    providerModifiedAt < existingProviderModifiedAt
  ) {
    return;
  }

  await updatePaymentProviderStateRow({
    failureReason:
      cleanNullableText(invoiceStatus.failureReason) ??
      cleanNullableText(invoiceStatus.errCode),
    finalAmountMinor: invoiceStatus.finalAmount ?? null,
    invoiceId,
    paymentInfo: invoiceStatus.paymentInfo,
    providerModifiedAt,
    providerPayload: invoiceStatus,
    providerStatus,
    reference,
    status: normalizedStatus,
  });
}
