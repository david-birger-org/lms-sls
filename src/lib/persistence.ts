import { getDatabase } from "./database.js";
import type {
  MonobankInvoiceStatusResponse,
  SupportedCurrency,
} from "./monobank.js";
import { normalizeMonobankStatus, type PaymentStatus } from "./payments.js";

interface AppUserRow {
  auth_user_id: string;
  email: string | null;
  id: string;
}

interface PaymentDraftRow {
  id: string;
  expires_at: string | null;
  invoice_id: string | null;
  page_url: string | null;
  reference: string;
  status: PaymentStatus;
  user_id: string;
}

interface PendingPaymentRow {
  amount_minor: number;
  created_at: string;
  currency: SupportedCurrency;
  customer_name: string;
  description: string;
  expires_at: string | null;
  failure_reason: string | null;
  invoice_id: string;
  page_url: string | null;
  provider_status: string | null;
  reference: string;
  status: PaymentStatus;
}

export interface CreatePaymentDraftInput {
  appUserId?: string | null;
  amountMinor: number;
  authUserId: string;
  currency: SupportedCurrency;
  customerEmail?: string | null;
  customerName: string;
  description: string;
  idempotencyKey?: string | null;
}

function cleanNullableText(value?: string | null) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

export interface PaymentCreationState {
  expiresAt: string | null;
  invoiceId: string | null;
  pageUrl: string | null;
  paymentId: string;
  reference: string;
  reused: boolean;
  status: PaymentStatus;
  userId: string;
}

function toJsonbValue(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function getRequiredRow<T>(rows: T[], errorMessage: string) {
  const row = rows[0];

  if (!row) {
    throw new Error(errorMessage);
  }

  return row;
}

export function shouldBootstrapAppUserByEmail({
  appUserId,
  email,
}: {
  appUserId?: string | null;
  email?: string | null;
}) {
  return !appUserId && Boolean(email);
}

export async function createPaymentDraft(
  input: CreatePaymentDraftInput,
): Promise<PaymentCreationState> {
  const database = getDatabase();
  const paymentId = crypto.randomUUID();
  const reference = `mb-${paymentId}`;
  const appUserId = cleanNullableText(input.appUserId);
  const customerEmail = cleanNullableText(input.customerEmail);
  const customerName = cleanNullableText(input.customerName);
  const idempotencyKey = cleanNullableText(input.idempotencyKey);

  if (!customerName) {
    throw new Error("Customer name is required to create a payment record.");
  }

  const payment = await database.begin(async (sql) => {
    const matchedByAppUserId = appUserId
      ? await sql<AppUserRow[]>`
          select id, auth_user_id, email
          from app_users
          where id = ${appUserId}
          limit 1
          for update
        `
      : [];
    const matchedByAuthUserId = matchedByAppUserId[0]
      ? []
      : await sql<AppUserRow[]>`
          select id, auth_user_id, email
          from app_users
          where auth_user_id = ${input.authUserId}
          limit 1
          for update
        `;
    const emailMatches = shouldBootstrapAppUserByEmail({
      appUserId,
      email: customerEmail,
    })
      ? await sql<AppUserRow[]>`
          select id, auth_user_id, email
          from app_users
          where email = ${customerEmail}
            and deleted_at is null
          order by updated_at desc, created_at desc
          limit 2
          for update
        `
      : [];
    const matchedAppUser =
      matchedByAppUserId[0] ??
      matchedByAuthUserId[0] ??
      (emailMatches.length === 1 ? emailMatches[0] : null);
    const appUsers = matchedAppUser
      ? await sql<AppUserRow[]>`
          update app_users
          set
            auth_user_id = ${input.authUserId},
            email = coalesce(${customerEmail}, app_users.email),
            full_name = coalesce(${customerName}, app_users.full_name),
            deleted_at = null,
            updated_at = timezone('utc', now())
          where id = ${matchedAppUser.id}
          returning id, auth_user_id, email
        `
      : await sql<AppUserRow[]>`
          insert into app_users (
            auth_user_id,
            email,
            full_name
          )
          values (
            ${input.authUserId},
            ${customerEmail},
            ${customerName}
          )
          on conflict (auth_user_id) do update
          set
            email = coalesce(excluded.email, app_users.email),
            full_name = coalesce(excluded.full_name, app_users.full_name),
            deleted_at = null,
            updated_at = timezone('utc', now())
          returning id, auth_user_id, email
        `;

    const appUser = getRequiredRow(
      appUsers,
      `Failed to create or load app user ${input.authUserId}.`,
    );

    if (idempotencyKey) {
      const existingPayments = await sql<PaymentDraftRow[]>`
        select
          id,
          expires_at,
          invoice_id,
          page_url,
          reference,
          status,
          user_id
        from payments
        where idempotency_key = ${idempotencyKey}
        limit 1
        for update
      `;

      const existingPayment = existingPayments[0];

      if (existingPayment) {
        return {
          expiresAt: existingPayment.expires_at,
          invoiceId: existingPayment.invoice_id,
          pageUrl: existingPayment.page_url,
          paymentId: existingPayment.id,
          reference: existingPayment.reference,
          reused: true,
          status: existingPayment.status,
          userId: existingPayment.user_id,
        };
      }
    }

    const paymentRows = await sql<PaymentDraftRow[]>`
      insert into payments (
        id,
        user_id,
        idempotency_key,
        provider,
        reference,
        status,
        amount_minor,
        currency,
        customer_name,
        customer_email,
        description
      )
      values (
        ${paymentId},
        ${appUser.id},
        ${idempotencyKey},
        ${"monobank"},
        ${reference},
        ${"draft"},
        ${input.amountMinor},
        ${input.currency},
        ${customerName},
        ${customerEmail},
        ${input.description}
      )
      returning id, expires_at, invoice_id, page_url, reference, status, user_id
    `;

    const payment = getRequiredRow(
      paymentRows,
      `Failed to create payment draft ${paymentId}.`,
    );

    return {
      expiresAt: payment.expires_at,
      invoiceId: payment.invoice_id,
      pageUrl: payment.page_url,
      paymentId: payment.id,
      reference: payment.reference,
      reused: false,
      status: payment.status,
      userId: payment.user_id,
    };
  });

  return payment;
}

export async function reservePaymentForInvoiceCreation(paymentId: string) {
  const database = getDatabase();

  const paymentRows = await database<PaymentDraftRow[]>`
    update payments
    set
      status = ${"creating_invoice"},
      updated_at = timezone('utc', now())
    where id = ${paymentId}
      and status in (${"draft"}, ${"creation_failed"})
    returning id, expires_at, invoice_id, page_url, reference, status, user_id
  `;

  const payment = paymentRows[0];

  if (!payment) {
    return null;
  }

  return {
    expiresAt: payment.expires_at,
    invoiceId: payment.invoice_id,
    pageUrl: payment.page_url,
    paymentId: payment.id,
    reference: payment.reference,
    reused: true,
    status: payment.status,
    userId: payment.user_id,
  } satisfies PaymentCreationState;
}

export async function completePaymentCreation({
  expiresAt,
  invoiceId,
  pageUrl,
  paymentId,
  providerPayload,
}: {
  expiresAt?: string | null;
  invoiceId?: string | null;
  pageUrl?: string | null;
  paymentId: string;
  providerPayload: unknown;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      invoice_id = ${cleanNullableText(invoiceId)},
      page_url = ${cleanNullableText(pageUrl)},
      expires_at = ${cleanNullableText(expiresAt)},
      status = ${"invoice_created"},
      failure_reason = null,
      provider_payload = ${toJsonbValue(providerPayload)}::jsonb,
      updated_at = timezone('utc', now())
    where id = ${paymentId}
  `;
}

export async function markPaymentCreationFailed({
  errorMessage,
  paymentId,
  providerPayload,
}: {
  errorMessage: string;
  paymentId: string;
  providerPayload?: unknown;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      status = ${"creation_failed"},
      failure_reason = ${cleanNullableText(errorMessage) ?? errorMessage},
      provider_payload = coalesce(${toJsonbValue(providerPayload)}::jsonb, provider_payload),
      updated_at = timezone('utc', now())
    where id = ${paymentId}
  `;
}

export interface PendingInvoiceRecord {
  amount: number;
  createdDate: string;
  currency: SupportedCurrency;
  customerName: string;
  description: string;
  error?: string;
  expiresAt?: string;
  invoiceId: string;
  pageUrl?: string;
  reference: string;
  status: PaymentStatus;
}

export async function listPendingInvoices(limit = 50) {
  const database = getDatabase();

  const rows = await database<PendingPaymentRow[]>`
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
      provider_status,
      reference,
      status
    from payments
    where invoice_id is not null
      and status in (${"invoice_created"}, ${"processing"})
    order by created_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    amount: row.amount_minor,
    createdDate: row.created_at,
    currency: row.currency,
    customerName: row.customer_name,
    description: row.description,
    error: row.failure_reason ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    invoiceId: row.invoice_id,
    pageUrl: row.page_url ?? undefined,
    reference: row.reference,
    status: row.provider_status === "created" ? "invoice_created" : row.status,
  })) satisfies PendingInvoiceRecord[];
}

export async function markInvoiceCancelled({
  invoiceId,
  providerPayload,
}: {
  invoiceId: string;
  providerPayload?: unknown;
}) {
  const database = getDatabase();

  await database`
    update payments
    set
      provider_status = ${"cancelled"},
      status = ${"cancelled"},
      provider_payload = coalesce(${toJsonbValue(providerPayload)}::jsonb, provider_payload),
      updated_at = timezone('utc', now())
    where invoice_id = ${invoiceId}
      and status in (${"invoice_created"}, ${"processing"})
  `;
}

export async function syncMonobankPaymentStatus(
  invoiceStatus: MonobankInvoiceStatusResponse,
) {
  const invoiceId = cleanNullableText(invoiceStatus.invoiceId);

  if (!invoiceId) {
    return;
  }

  const database = getDatabase();
  const reference = cleanNullableText(invoiceStatus.reference);
  const hasReference = reference !== null;
  const providerStatus = cleanNullableText(invoiceStatus.status);
  const normalizedStatus = normalizeMonobankStatus(providerStatus);

  await database`
    update payments
    set
      invoice_id = coalesce(payments.invoice_id, ${invoiceId}),
      provider_status = coalesce(${providerStatus}, payments.provider_status),
      status = coalesce(${normalizedStatus}, payments.status),
      failure_reason = coalesce(
        ${cleanNullableText(invoiceStatus.failureReason)},
        ${cleanNullableText(invoiceStatus.errCode)},
        payments.failure_reason
      ),
      final_amount_minor = coalesce(${invoiceStatus.finalAmount ?? null}, payments.final_amount_minor),
      payment_info = coalesce(${toJsonbValue(invoiceStatus.paymentInfo)}::jsonb, payments.payment_info),
      provider_payload = ${JSON.stringify(invoiceStatus)}::jsonb,
      updated_at = timezone('utc', now())
    where payments.invoice_id = ${invoiceId}
      or (${hasReference} and payments.reference = ${reference})
  `;
}
