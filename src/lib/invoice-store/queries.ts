import { getDatabase } from "../database.js";
import type { PaymentStatus } from "../payments.js";
import type {
  AppUserRow,
  PaymentHistoryRow,
  PaymentProviderStateRow,
  PendingInvoiceCreation,
  PendingInvoiceRow,
  PendingPaymentRow,
  ProviderStateUpdateInput,
} from "./types.js";

function getRequiredRow<T>(rows: T[], errorMessage: string) {
  const row = rows[0];

  if (!row) {
    throw new Error(errorMessage);
  }

  return row;
}

function toJsonbValue(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export async function selectAppUserIdByAuthUserId(authUserId: string) {
  const database = getDatabase();
  const rows = await database<{ id: string }[]>`
    select id
    from app_users
    where auth_user_id = ${authUserId}
      and deleted_at is null
    limit 1
  `;

  return rows[0]?.id ?? null;
}

export async function mirrorAuthUserToAppUsersRow({
  authUserId,
  email,
  fullName,
}: {
  authUserId: string;
  email: string | null;
  fullName: string;
}) {
  const database = getDatabase();
  const rows = await database<AppUserRow[]>`
    insert into app_users (
      auth_user_id,
      email,
      full_name,
      deleted_at
    )
    values (
      ${authUserId},
      ${email},
      ${fullName},
      ${null}
    )
    on conflict (auth_user_id) do update
    set
      email = excluded.email,
      full_name = excluded.full_name,
      deleted_at = null,
      updated_at = timezone('utc', now())
    returning id
  `;

  return getRequiredRow(rows, `Failed to resolve app user ${authUserId}.`).id;
}

export async function selectPaymentByIdempotencyKey(idempotencyKey: string) {
  const database = getDatabase();
  const rows = await database<
    {
      expires_at: string | null;
      invoice_id: string | null;
      page_url: string | null;
      id: string;
      status: PaymentStatus;
    }[]
  >`
    select id, invoice_id, page_url, expires_at, status
    from payments
    where idempotency_key = ${idempotencyKey}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function insertPendingInvoiceRow({
  amountMinor,
  createdByAdminUserId,
  currency,
  customerEmail,
  customerName,
  description,
  idempotencyKey,
  paymentId,
  productId,
  productSlug,
  reference,
  status,
  userId,
}: {
  amountMinor: number;
  createdByAdminUserId: string | null;
  currency: string;
  customerEmail: string | null;
  customerName: string;
  description: string;
  idempotencyKey: string | null;
  paymentId: string;
  productId: string | null;
  productSlug: string | null;
  reference: string;
  status: PaymentStatus;
  userId: string | null;
}): Promise<PendingInvoiceCreation> {
  const database = getDatabase();
  const rows = await database<PendingInvoiceRow[]>`
    insert into payments (
      id,
      user_id,
      created_by_admin_user_id,
      provider,
      reference,
      status,
      amount_minor,
      currency,
      customer_name,
      customer_email,
      description,
      idempotency_key,
      product_id,
      product_slug
    )
    values (
      ${paymentId},
      ${userId},
      ${createdByAdminUserId},
      ${"monobank"},
      ${reference},
      ${status},
      ${amountMinor},
      ${currency},
      ${customerName},
      ${customerEmail},
      ${description},
      ${idempotencyKey},
      ${productId},
      ${productSlug}
    )
    returning id, reference
  `;

  const row = getRequiredRow(
    rows,
    `Failed to create pending invoice record ${paymentId}.`,
  );

  return {
    paymentId: row.id,
    reference: row.reference,
  };
}

export async function updateCreatedInvoiceRow({
  expiresAt,
  invoiceId,
  pageUrl,
  paymentId,
  providerPayload,
  providerStatus,
  status,
}: {
  expiresAt: string;
  invoiceId: string;
  pageUrl: string;
  paymentId: string;
  providerPayload?: unknown;
  providerStatus: string;
  status: PaymentStatus;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      invoice_id = ${invoiceId},
      page_url = ${pageUrl},
      expires_at = ${expiresAt},
      provider_status = ${providerStatus},
      status = ${status},
      failure_reason = null,
      provider_payload = coalesce(${toJsonbValue(providerPayload)}::jsonb, provider_payload),
      updated_at = timezone('utc', now())
    where id = ${paymentId}
  `;
}

export async function updateInvoiceCreationFailedRow({
  errorMessage,
  paymentId,
  providerPayload,
  status,
}: {
  errorMessage: string;
  paymentId: string;
  providerPayload?: unknown;
  status: PaymentStatus;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      status = case
        when payments.invoice_id is null then ${status}
        else payments.status
      end,
      failure_reason = case
        when payments.invoice_id is null then ${errorMessage}
        else payments.failure_reason
      end,
      provider_payload = coalesce(${toJsonbValue(providerPayload)}::jsonb, provider_payload),
      updated_at = timezone('utc', now())
    where id = ${paymentId}
  `;
}

export async function selectPendingPaymentRows({
  limit,
  pendingProviderStatuses,
  pendingStatuses,
}: {
  limit: number;
  pendingProviderStatuses: readonly [string, string, string];
  pendingStatuses: readonly [PaymentStatus, PaymentStatus];
}) {
  const database = getDatabase();
  const [pendingInvoiceCreatedStatus, pendingProcessingStatus] =
    pendingStatuses;
  const [
    pendingProviderCreatedStatus,
    pendingProviderProcessingStatus,
    pendingProviderHoldStatus,
  ] = pendingProviderStatuses;

  return database<PendingPaymentRow[]>`
    select
      amount_minor,
      created_at,
      currency,
      customer_name,
      description,
      expires_at,
      failure_reason,
      invoice_id,
      page_url,
      product_slug,
      provider_status,
      reference,
      status
    from payments
    where invoice_id is not null
      and (
        status in (${pendingInvoiceCreatedStatus}, ${pendingProcessingStatus})
        or provider_status in (
          ${pendingProviderCreatedStatus},
          ${pendingProviderProcessingStatus},
          ${pendingProviderHoldStatus}
        )
      )
    order by created_at desc
    limit ${limit}
  `;
}

export async function selectPaymentHistoryRows({
  fromDateIso,
  toDateIso,
}: {
  fromDateIso: string;
  toDateIso: string;
}) {
  const database = getDatabase();

  return database<PaymentHistoryRow[]>`
    select
      amount_minor,
      created_at,
      currency,
      customer_name,
      description,
      expires_at,
      failure_reason,
      profit_amount_minor,
      invoice_id,
      page_url,
      payment_info,
      product_slug,
      provider_modified_at,
      provider_status,
      reference,
      status
    from payments
    where provider = ${"monobank"}
      and invoice_id is not null
      and coalesce(provider_modified_at, created_at) >= ${fromDateIso}
      and coalesce(provider_modified_at, created_at) <= ${toDateIso}
    order by coalesce(provider_modified_at, created_at) desc, created_at desc
  `;
}

export async function selectRecentPaymentsByCustomerName(customerName: string) {
  const database = getDatabase();

  return database<PaymentHistoryRow[]>`
    select
      amount_minor,
      created_at,
      currency,
      customer_name,
      description,
      expires_at,
      failure_reason,
      profit_amount_minor,
      invoice_id,
      page_url,
      payment_info,
      product_slug,
      provider_modified_at,
      provider_status,
      reference,
      status
    from payments
    where provider = ${"monobank"}
      and invoice_id is not null
      and lower(customer_name) = lower(${customerName})
      and created_at >= now() - interval '30 days'
    order by created_at desc
  `;
}

export async function selectPaymentHistoryRowByInvoiceId(invoiceId: string) {
  const database = getDatabase();
  const rows = await database<PaymentHistoryRow[]>`
    select
      amount_minor,
      created_at,
      currency,
      customer_name,
      description,
      expires_at,
      failure_reason,
      profit_amount_minor,
      invoice_id,
      page_url,
      payment_info,
      product_slug,
      provider_modified_at,
      provider_status,
      reference,
      status
    from payments
    where provider = ${"monobank"}
      and invoice_id = ${invoiceId}
    order by updated_at desc, created_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

export async function updateInvoiceCancelledRow({
  invoiceId,
  providerPayload,
  status,
}: {
  invoiceId: string;
  providerPayload?: unknown;
  status: PaymentStatus;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      provider_status = ${status},
      status = ${status},
      provider_payload = coalesce(${toJsonbValue(providerPayload)}::jsonb, provider_payload),
      updated_at = timezone('utc', now())
    where invoice_id = ${invoiceId}
  `;
}

export async function selectLatestProviderStateRow({
  invoiceId,
  reference,
}: {
  invoiceId?: string | null;
  reference?: string | null;
}) {
  const database = getDatabase();

  if (invoiceId && reference) {
    const rows = await database<PaymentProviderStateRow[]>`
      select provider_modified_at
      from payments
      where invoice_id = ${invoiceId}
        or reference = ${reference}
      order by provider_modified_at desc nulls last, updated_at desc, created_at desc
      limit 1
    `;

    return rows[0] ?? null;
  }

  if (invoiceId) {
    const rows = await database<PaymentProviderStateRow[]>`
      select provider_modified_at
      from payments
      where invoice_id = ${invoiceId}
      order by provider_modified_at desc nulls last, updated_at desc, created_at desc
      limit 1
    `;

    return rows[0] ?? null;
  }

  const rows = await database<PaymentProviderStateRow[]>`
    select provider_modified_at
    from payments
    where reference = ${reference}
    order by provider_modified_at desc nulls last, updated_at desc, created_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

export async function updatePaymentProviderStateRow(
  input: ProviderStateUpdateInput,
) {
  const database = getDatabase();

  if (input.invoiceId && input.reference) {
    await database`
      update payments
      set
        invoice_id = coalesce(payments.invoice_id, ${input.invoiceId}),
        provider_status = coalesce(${input.providerStatus ?? null}, payments.provider_status),
        provider_modified_at = coalesce(${input.providerModifiedAt ?? null}, payments.provider_modified_at),
        status = coalesce(${input.status ?? null}, payments.status),
        failure_reason = coalesce(${input.failureReason ?? null}, payments.failure_reason),
        amount_minor = coalesce(${input.amountMinor ?? null}, payments.amount_minor),
        profit_amount_minor = coalesce(${input.profitAmountMinor ?? null}, payments.profit_amount_minor),
        currency = coalesce(${input.currency ?? null}, payments.currency),
        payment_info = coalesce(${toJsonbValue(input.paymentInfo)}::jsonb, payments.payment_info),
        provider_payload = ${JSON.stringify(input.providerPayload)}::jsonb,
        updated_at = timezone('utc', now())
      where payments.invoice_id = ${input.invoiceId}
        or payments.reference = ${input.reference}
    `;

    return;
  }

  if (input.invoiceId) {
    await database`
      update payments
      set
        invoice_id = coalesce(payments.invoice_id, ${input.invoiceId}),
        provider_status = coalesce(${input.providerStatus ?? null}, payments.provider_status),
        provider_modified_at = coalesce(${input.providerModifiedAt ?? null}, payments.provider_modified_at),
        status = coalesce(${input.status ?? null}, payments.status),
        failure_reason = coalesce(${input.failureReason ?? null}, payments.failure_reason),
        amount_minor = coalesce(${input.amountMinor ?? null}, payments.amount_minor),
        profit_amount_minor = coalesce(${input.profitAmountMinor ?? null}, payments.profit_amount_minor),
        currency = coalesce(${input.currency ?? null}, payments.currency),
        payment_info = coalesce(${toJsonbValue(input.paymentInfo)}::jsonb, payments.payment_info),
        provider_payload = ${JSON.stringify(input.providerPayload)}::jsonb,
        updated_at = timezone('utc', now())
      where payments.invoice_id = ${input.invoiceId}
    `;

    return;
  }

  await database`
    update payments
    set
      provider_status = coalesce(${input.providerStatus ?? null}, payments.provider_status),
      provider_modified_at = coalesce(${input.providerModifiedAt ?? null}, payments.provider_modified_at),
      status = coalesce(${input.status ?? null}, payments.status),
      failure_reason = coalesce(${input.failureReason ?? null}, payments.failure_reason),
      amount_minor = coalesce(${input.amountMinor ?? null}, payments.amount_minor),
      profit_amount_minor = coalesce(${input.profitAmountMinor ?? null}, payments.profit_amount_minor),
      currency = coalesce(${input.currency ?? null}, payments.currency),
      payment_info = coalesce(${toJsonbValue(input.paymentInfo)}::jsonb, payments.payment_info),
      provider_payload = ${JSON.stringify(input.providerPayload)}::jsonb,
      updated_at = timezone('utc', now())
    where payments.reference = ${input.reference}
  `;
}

interface PaymentFeatureGrantRow {
  id: string;
  user_id: string;
  product_slug: string | null;
}

export async function selectPaymentForFeatureGrant({
  invoiceId,
  reference,
}: {
  invoiceId: string | null;
  reference: string | null;
}) {
  if (!invoiceId && !reference) return null;

  const database = getDatabase();

  const rows = invoiceId
    ? await database<PaymentFeatureGrantRow[]>`
        select id, user_id, product_slug
        from payments
        where invoice_id = ${invoiceId}
        limit 1
      `
    : await database<PaymentFeatureGrantRow[]>`
        select id, user_id, product_slug
        from payments
        where reference = ${reference}
        limit 1
      `;

  return rows[0] ?? null;
}
