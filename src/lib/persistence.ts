import {
  buildFullName,
  type ClerkUser,
  cleanNullableText,
  getClerkPrimaryEmail,
  syncClerkUserMetadata,
  toDateFromClerkTimestamp,
} from "./clerk";
import { getDatabase } from "./database";
import type {
  MonobankInvoiceStatusResponse,
  SupportedCurrency,
} from "./monobank";

interface AppUserRow {
  clerk_user_id: string;
  email: string | null;
  id: string;
}

interface PaymentDraftRow {
  id: string;
  reference: string;
  user_id: string;
}

export interface CreatePaymentDraftInput {
  amountMinor: number;
  clerkUserId: string;
  currency: SupportedCurrency;
  customerEmail?: string | null;
  customerName: string;
  description: string;
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

export async function upsertClerkUser(user: ClerkUser) {
  const clerkUserId = cleanNullableText(user.id);

  if (!clerkUserId) {
    throw new Error("Clerk user payload is missing id.");
  }

  const database = getDatabase();
  const email = getClerkPrimaryEmail(user);
  const firstName = cleanNullableText(user.first_name);
  const lastName = cleanNullableText(user.last_name);
  const fullName = buildFullName(firstName, lastName);
  const imageUrl = cleanNullableText(user.image_url);

  const appUsers = await database<AppUserRow[]>`
    insert into app_users (
      clerk_user_id,
      email,
      first_name,
      last_name,
      full_name,
      image_url,
      clerk_created_at,
      clerk_updated_at,
      raw_clerk_data
    )
    values (
      ${clerkUserId},
      ${email},
      ${firstName},
      ${lastName},
      ${fullName},
      ${imageUrl},
      ${toDateFromClerkTimestamp(user.created_at)},
      ${toDateFromClerkTimestamp(user.updated_at)},
      ${JSON.stringify(user)}::jsonb
    )
    on conflict (clerk_user_id) do update
    set
      email = excluded.email,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      image_url = excluded.image_url,
      clerk_created_at = excluded.clerk_created_at,
      clerk_updated_at = excluded.clerk_updated_at,
      raw_clerk_data = excluded.raw_clerk_data,
      deleted_at = null,
      updated_at = timezone('utc', now())
    returning id, clerk_user_id, email
  `;

  const appUser = getRequiredRow(
    appUsers,
    `Failed to upsert Clerk user ${clerkUserId}.`,
  );

  await syncClerkUserMetadata({
    appUserId: appUser.id,
    role: "user",
    user,
  });

  return appUser;
}

export async function markClerkUserDeleted(
  clerkUserId: string,
  rawPayload: unknown,
) {
  const database = getDatabase();

  await database`
    insert into app_users (
      clerk_user_id,
      raw_clerk_data,
      deleted_at
    )
    values (
      ${clerkUserId},
      ${toJsonbValue(rawPayload)}::jsonb,
      timezone('utc', now())
    )
    on conflict (clerk_user_id) do update
    set
      raw_clerk_data = excluded.raw_clerk_data,
      deleted_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  `;
}

export async function createPaymentDraft(input: CreatePaymentDraftInput) {
  const database = getDatabase();
  const paymentId = crypto.randomUUID();
  const reference = `mb-${paymentId}`;
  const customerEmail = cleanNullableText(input.customerEmail);
  const customerName = cleanNullableText(input.customerName);

  if (!customerName) {
    throw new Error("Customer name is required to create a payment record.");
  }

  const payment = await database.begin(async (sql) => {
    const appUsers = await sql<AppUserRow[]>`
      insert into app_users (
        clerk_user_id,
        email,
        full_name
      )
      values (
        ${input.clerkUserId},
        ${customerEmail},
        ${customerName}
      )
      on conflict (clerk_user_id) do update
      set
        email = coalesce(excluded.email, app_users.email),
        full_name = coalesce(excluded.full_name, app_users.full_name),
        deleted_at = null,
        updated_at = timezone('utc', now())
      returning id, clerk_user_id, email
    `;

    const appUser = getRequiredRow(
      appUsers,
      `Failed to create or load app user ${input.clerkUserId}.`,
    );

    const paymentRows = await sql<PaymentDraftRow[]>`
      insert into payments (
        id,
        user_id,
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
        ${"monobank"},
        ${reference},
        ${"pending_creation"},
        ${input.amountMinor},
        ${input.currency},
        ${customerName},
        ${customerEmail},
        ${input.description}
      )
      returning id, reference, user_id
    `;

    return getRequiredRow(
      paymentRows,
      `Failed to create payment draft ${paymentId}.`,
    );
  });

  return {
    paymentId: payment.id,
    reference: payment.reference,
    userId: payment.user_id,
  };
}

export async function completePaymentCreation({
  invoiceId,
  pageUrl,
  paymentId,
  providerPayload,
}: {
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
      status = ${"created"},
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

  await database`
    update payments
    set
      invoice_id = coalesce(payments.invoice_id, ${invoiceId}),
      status = coalesce(${cleanNullableText(invoiceStatus.status)}, payments.status),
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
