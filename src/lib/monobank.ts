import { env } from "./env";

export interface MonobankStatementItem {
  invoiceId?: string;
  status?: string;
  maskedPan?: string;
  date?: string;
  paymentScheme?: string;
  amount?: number;
  profitAmount?: number;
  ccy?: number;
  rrn?: string;
  reference?: string;
  destination?: string;
}

export interface MonobankStatementResponse {
  list?: MonobankStatementItem[];
}

export interface MonobankPaymentInfo {
  maskedPan?: string;
  approvalCode?: string;
  rrn?: string;
  tranId?: string;
  terminal?: string;
  bank?: string;
  paymentSystem?: string;
  paymentMethod?: string;
  fee?: number;
  country?: string;
  agentFee?: number;
}

export interface MonobankCancelItem {
  amount?: number;
  ccy?: number;
  date?: string;
  approvalCode?: string;
  rrn?: string;
  maskedPan?: string;
}

export interface MonobankInvoiceStatusResponse {
  invoiceId?: string;
  status?: string;
  failureReason?: string;
  errCode?: string;
  amount?: number;
  ccy?: number;
  finalAmount?: number;
  createdDate?: string;
  modifiedDate?: string;
  reference?: string;
  destination?: string;
  paymentInfo?: MonobankPaymentInfo;
  cancelList?: MonobankCancelItem[];
}

export interface MonobankInvoiceResponse {
  invoiceId?: string;
  pageUrl?: string;
}

export type SupportedCurrency = "UAH" | "USD";

const CURRENCY_CODE: Record<SupportedCurrency, number> = {
  UAH: 980,
  USD: 840,
};

const MAX_RANGE_SECONDS = 31 * 24 * 60 * 60;

function getMonobankBaseUrl() {
  return "https://api.monobank.ua/api/merchant/";
}

function getMonobankHeaders(token: string, includeJsonContentType = false) {
  return {
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
    "X-Token": token,
  };
}

async function requestMonobank<T>({
  body,
  method,
  path,
  searchParams,
  token = env.monobankToken,
}: {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  searchParams?: Record<string, number | string>;
  token?: string;
}) {
  const url = new URL(path, getMonobankBaseUrl());

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const monobankResponse = await fetch(url, {
    method,
    headers: getMonobankHeaders(token, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!monobankResponse.ok) {
    const errorText = await monobankResponse.text();
    throw new Error(`Monobank API error: ${errorText}`);
  }

  return (await monobankResponse.json()) as T;
}

export function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

export function getCurrencyCode(currency: SupportedCurrency) {
  return CURRENCY_CODE[currency];
}

export function getRangeDays(searchParams: URLSearchParams) {
  const daysParam = Number(searchParams.get("days") ?? "30");

  return Number.isFinite(daysParam)
    ? Math.min(Math.max(daysParam, 1), 365)
    : 30;
}

export function getUnixTimestamp(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export async function fetchStatementChunk({
  token,
  from,
  to,
}: {
  token: string;
  from: number;
  to: number;
}) {
  const response = await requestMonobank<MonobankStatementResponse>({
    method: "GET",
    path: "statement",
    searchParams: { from, to },
    token,
  });

  return response.list ?? [];
}

export async function fetchStatement(days: number) {
  const token = env.monobankToken;
  const to = getUnixTimestamp(new Date());
  const from = to - days * 24 * 60 * 60;
  const items: MonobankStatementItem[] = [];

  let chunkFrom = from;

  while (chunkFrom < to) {
    const chunkTo = Math.min(chunkFrom + MAX_RANGE_SECONDS - 1, to);
    const chunkItems = await fetchStatementChunk({
      token,
      from: chunkFrom,
      to: chunkTo,
    });

    items.push(...chunkItems);
    chunkFrom = chunkTo + 1;
  }

  return items;
}

export async function createInvoice({
  amountMinor,
  currency,
  customerName,
  description,
  reference,
}: {
  amountMinor: number;
  currency: SupportedCurrency;
  customerName: string;
  description: string;
  reference: string;
}) {
  return requestMonobank<MonobankInvoiceResponse>({
    method: "POST",
    path: "invoice/create",
    body: {
      amount: amountMinor,
      ccy: getCurrencyCode(currency),
      merchantPaymInfo: {
        reference,
        destination: description,
        comment: `${customerName}: ${description}`,
      },
    },
  });
}

export async function fetchInvoiceStatus(invoiceId: string) {
  return requestMonobank<MonobankInvoiceStatusResponse>({
    method: "GET",
    path: "invoice/status",
    searchParams: { invoiceId },
  });
}
