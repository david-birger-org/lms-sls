import type { MonobankPaymentInfo, SupportedCurrency } from "../monobank.js";
import type { PaymentStatus } from "../payments.js";

export interface AppUserRow {
  id: string;
}

export interface PendingPaymentRow {
  amount_minor: number | string;
  created_at: string;
  currency: SupportedCurrency;
  customer_name: string;
  description: string;
  expires_at: string | null;
  failure_reason: string | null;
  invoice_id: string;
  page_url: string | null;
  product_slug: string | null;
  provider_status: string | null;
  reference: string;
  status: PaymentStatus;
}

export interface PaymentHistoryRow {
  amount_minor: number | string;
  created_at: string;
  currency: SupportedCurrency;
  customer_name: string;
  description: string;
  expires_at: string | null;
  failure_reason: string | null;
  profit_amount_minor: number | string | null;
  invoice_id: string | null;
  page_url: string | null;
  payment_info: unknown;
  product_slug: string | null;
  provider_modified_at: string | null;
  provider_status: string | null;
  reference: string;
  status: PaymentStatus;
}

export interface PaymentProviderStateRow {
  provider_modified_at: string | null;
}

export interface PendingInvoiceRow {
  id: string;
  reference: string;
}

export interface EnsureAppUserInput {
  authUserId: string;
  email?: string | null;
  fullName: string;
}

export interface CreatePendingInvoiceInput {
  amountMinor: number;
  currency: SupportedCurrency;
  customerEmail?: string | null;
  customerName: string;
  description: string;
  paymentId?: string;
  productId?: string | null;
  productSlug?: string | null;
  userId: string;
}

export interface PendingInvoiceCreation {
  paymentId: string;
  reference: string;
}

export interface StoreCreatedInvoiceInput {
  expiresAt: string;
  invoiceId: string;
  pageUrl: string;
  paymentId: string;
  providerPayload?: unknown;
}

export interface MarkInvoiceCreationFailedInput {
  errorMessage: string;
  paymentId: string;
  providerPayload?: unknown;
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
  productSlug?: string;
  reference: string;
  status: PaymentStatus;
}

export interface PaymentHistoryRecord {
  amount: number;
  ccy: SupportedCurrency;
  customerName: string;
  date: string;
  destination: string;
  error?: string;
  expiresAt?: string;
  invoiceId?: string;
  maskedPan?: string;
  pageUrl?: string;
  productSlug?: string;
  reference: string;
  status?: PaymentStatus;
}

export interface PaymentDetailsRecord {
  amount: number;
  createdDate: string;
  ccy: SupportedCurrency;
  customerName: string;
  destination: string;
  expiresAt?: string;
  failureReason?: string;
  profitAmount?: number;
  invoiceId?: string;
  modifiedDate?: string;
  pageUrl?: string;
  paymentInfo?: MonobankPaymentInfo;
  productSlug?: string;
  reference: string;
  status?: PaymentStatus;
}

export interface ProviderStateUpdateInput {
  amountMinor?: number | null;
  currency?: SupportedCurrency | null;
  failureReason?: string | null;
  profitAmountMinor?: number | null;
  invoiceId?: string | null;
  paymentInfo?: unknown;
  providerModifiedAt?: string | null;
  providerPayload: unknown;
  providerStatus?: string | null;
  reference?: string | null;
  status?: PaymentStatus | null;
}
