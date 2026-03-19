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

export type SupportedCurrency = "UAH" | "USD";

const CURRENCY_CODE: Record<SupportedCurrency, number> = {
  UAH: 980,
  USD: 840,
};

const MAX_RANGE_SECONDS = 31 * 24 * 60 * 60;

export function getMonobankToken() {
  const token = process.env.MONOBANK_TOKEN?.trim();

  if (!token) {
    throw new Error("MONOBANK_TOKEN is missing in environment variables.");
  }

  return token;
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
  const statementUrl = new URL(
    "https://api.monobank.ua/api/merchant/statement",
  );
  statementUrl.searchParams.set("from", String(from));
  statementUrl.searchParams.set("to", String(to));

  const monobankResponse = await fetch(statementUrl, {
    method: "GET",
    headers: {
      "X-Token": token,
    },
    cache: "no-store",
  });

  if (!monobankResponse.ok) {
    const errorText = await monobankResponse.text();
    throw new Error(`Monobank API error: ${errorText}`);
  }

  const response = (await monobankResponse.json()) as MonobankStatementResponse;
  return response.list ?? [];
}

export async function fetchStatement(days: number) {
  const token = getMonobankToken();
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

export async function fetchInvoiceStatus(invoiceId: string) {
  const token = getMonobankToken();
  const statusUrl = new URL(
    "https://api.monobank.ua/api/merchant/invoice/status",
  );
  statusUrl.searchParams.set("invoiceId", invoiceId);

  const monobankResponse = await fetch(statusUrl, {
    method: "GET",
    headers: {
      "X-Token": token,
    },
    cache: "no-store",
  });

  if (!monobankResponse.ok) {
    const errorText = await monobankResponse.text();
    throw new Error(`Monobank API error: ${errorText}`);
  }

  return (await monobankResponse.json()) as MonobankInvoiceStatusResponse;
}
