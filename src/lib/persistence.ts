import {
  buildFullName,
  type ClerkUser,
  cleanNullableText,
  getClerkDatabaseUserId,
  getClerkPrimaryEmail,
  getClerkUserRole,
  syncClerkUserMetadata,
  toDateFromClerkTimestamp,
} from "./clerk";
import { getDatabase } from "./database";
import type {
  MonobankInvoiceStatusResponse,
  SupportedCurrency,
} from "./monobank";
import { normalizeMonobankStatus, type PaymentStatus } from "./payments";

interface AppUserRow {
  clerk_user_id: string;
  email: string | null;
  id: string;
  raw_clerk_data?: unknown;
}

interface AppUserIdentityInput {
  appUserId?: string | null;
  clerkUserId: string;
  email?: string | null;
}

interface PaymentDraftRow {
  id: string;
  invoice_id: string | null;
  page_url: string | null;
  reference: string;
  status: PaymentStatus;
  user_id: string;
}

export interface CreatePaymentDraftInput {
  appUserId?: string | null;
  amountMinor: number;
  clerkUserId: string;
  currency: SupportedCurrency;
  customerEmail?: string | null;
  customerName: string;
  description: string;
  idempotencyKey?: string | null;
}

export interface PaymentCreationState {
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

function getRoleFromRawClerkData(rawClerkData: unknown) {
  if (!rawClerkData || typeof rawClerkData !== "object") {
    return null;
  }

  const privateMetadata = Reflect.get(rawClerkData, "private_metadata");

  if (!privateMetadata || typeof privateMetadata !== "object") {
    return null;
  }

  const role = Reflect.get(privateMetadata, "role");

  return role === "admin" || role === "user" ? role : null;
}

export function getPreferredClerkRole({
  currentRole,
  matchedAppUser,
}: {
  currentRole: ReturnType<typeof getClerkUserRole>;
  matchedAppUser?: AppUserRow | null;
}) {
  return (
    currentRole ??
    getRoleFromRawClerkData(matchedAppUser?.raw_clerk_data) ??
    "user"
  );
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

async function findExistingAppUser({
  appUserId,
  clerkUserId,
  email,
}: AppUserIdentityInput) {
  const database = getDatabase();

  if (appUserId) {
    const appUsers = await database<AppUserRow[]>`
      select id, clerk_user_id, email, raw_clerk_data
      from app_users
      where id = ${appUserId}
      limit 1
    `;

    return appUsers[0] ?? null;
  }

  const directMatches = await database<AppUserRow[]>`
    select id, clerk_user_id, email, raw_clerk_data
    from app_users
    where clerk_user_id = ${clerkUserId}
    limit 1
  `;

  const directMatch = directMatches[0];

  if (directMatch) {
    return directMatch;
  }

  if (!shouldBootstrapAppUserByEmail({ appUserId, email })) {
    return null;
  }

  const emailMatches = await database<AppUserRow[]>`
    select id, clerk_user_id, email, raw_clerk_data
    from app_users
    where email = ${email}
      and deleted_at is null
    order by updated_at desc, created_at desc
    limit 2
  `;

  return emailMatches.length === 1 ? emailMatches[0] : null;
}

export async function upsertClerkUser(user: ClerkUser) {
  const clerkUserId = cleanNullableText(user.id);

  if (!clerkUserId) {
    throw new Error("Clerk user payload is missing id.");
  }

  const database = getDatabase();
  const email = getClerkPrimaryEmail(user);
  const appUserId = getClerkDatabaseUserId(user);
  const firstName = cleanNullableText(user.first_name);
  const lastName = cleanNullableText(user.last_name);
  const fullName = buildFullName(firstName, lastName);
  const imageUrl = cleanNullableText(user.image_url);
  const matchedAppUser = await findExistingAppUser({
    appUserId,
    clerkUserId,
    email,
  });

  const appUsers = matchedAppUser
    ? await database<AppUserRow[]>`
        update app_users
        set
          clerk_user_id = ${clerkUserId},
          email = ${email},
          first_name = ${firstName},
          last_name = ${lastName},
          full_name = ${fullName},
          image_url = ${imageUrl},
          clerk_created_at = ${toDateFromClerkTimestamp(user.created_at)},
          clerk_updated_at = ${toDateFromClerkTimestamp(user.updated_at)},
          raw_clerk_data = ${JSON.stringify(user)}::jsonb,
          deleted_at = null,
          updated_at = timezone('utc', now())
        where id = ${matchedAppUser.id}
        returning id, clerk_user_id, email
      `
    : await database<AppUserRow[]>`
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
    role: getPreferredClerkRole({
      currentRole: getClerkUserRole(user),
      matchedAppUser,
    }),
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
          select id, clerk_user_id, email
          from app_users
          where id = ${appUserId}
          limit 1
          for update
        `
      : [];
    const matchedByClerkUserId = matchedByAppUserId[0]
      ? []
      : await sql<AppUserRow[]>`
          select id, clerk_user_id, email
          from app_users
          where clerk_user_id = ${input.clerkUserId}
          limit 1
          for update
        `;
    const emailMatches = shouldBootstrapAppUserByEmail({
      appUserId,
      email: customerEmail,
    })
      ? await sql<AppUserRow[]>`
          select id, clerk_user_id, email
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
      matchedByClerkUserId[0] ??
      (emailMatches.length === 1 ? emailMatches[0] : null);
    const appUsers = matchedAppUser
      ? await sql<AppUserRow[]>`
          update app_users
          set
            clerk_user_id = ${input.clerkUserId},
            email = coalesce(${customerEmail}, app_users.email),
            full_name = coalesce(${customerName}, app_users.full_name),
            deleted_at = null,
            updated_at = timezone('utc', now())
          where id = ${matchedAppUser.id}
          returning id, clerk_user_id, email
        `
      : await sql<AppUserRow[]>`
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

    if (idempotencyKey) {
      const existingPayments = await sql<PaymentDraftRow[]>`
        select
          id,
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
      returning id, invoice_id, page_url, reference, status, user_id
    `;

    const payment = getRequiredRow(
      paymentRows,
      `Failed to create payment draft ${paymentId}.`,
    );

    return {
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
    returning id, invoice_id, page_url, reference, status, user_id
  `;

  const payment = paymentRows[0];

  if (!payment) {
    return null;
  }

  return {
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
