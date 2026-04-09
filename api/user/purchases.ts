import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalUser } from "../../src/lib/internal-auth-user.js";
import { json } from "../../src/lib/response.js";
import { selectActiveFeatures } from "../../src/lib/user-features/queries.js";
import {
  selectInvoicesCreatedByAdmin,
  selectUserPurchases,
} from "../../src/lib/user-purchases/queries.js";

const DEFAULT_PURCHASES_LIMIT = 100;
const MAX_PURCHASES_LIMIT = 100;
const DEFAULT_PURCHASES_RANGE_DAYS = 180;

function getPurchasesLimit(searchParams: URLSearchParams) {
  const parsedLimit = Number(
    searchParams.get("limit") ?? DEFAULT_PURCHASES_LIMIT,
  );

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return DEFAULT_PURCHASES_LIMIT;
  }

  return Math.min(parsedLimit, MAX_PURCHASES_LIMIT);
}

function normalizeIsoDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime())
    ? fallback
    : parsedDate.toISOString();
}

function getPurchasesDateRange(searchParams: URLSearchParams) {
  const defaultTo = new Date().toISOString();
  const defaultFrom = new Date(
    Date.now() - DEFAULT_PURCHASES_RANGE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const to = normalizeIsoDate(
    searchParams.get("to")?.trim() ?? null,
    defaultTo,
  );
  const from = normalizeIsoDate(
    searchParams.get("from")?.trim() ?? null,
    defaultFrom,
  );

  return { from, to };
}

export async function GET(request: Request) {
  const auth = await requireTrustedInternalUser(request);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = new URL(request.url).searchParams;
    const scope = searchParams.get("scope");
    const limit = getPurchasesLimit(searchParams);
    const { from, to } = getPurchasesDateRange(searchParams);
    const rows =
      scope === "created"
        ? await selectInvoicesCreatedByAdmin(auth.user.userId, {
            from,
            limit,
            to,
          })
        : await selectUserPurchases(auth.user.userId, { from, limit, to });

    const purchases = rows.map((row) => ({
      id: row.id,
      status: row.status,
      amountMinor: Number(row.amount_minor),
      profitAmountMinor:
        row.profit_amount_minor === null
          ? null
          : Number(row.profit_amount_minor),
      currency: row.currency,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      productId: row.product_id,
      productSlug: row.product_slug,
      productNameUk: row.product_name_uk,
      productNameEn: row.product_name_en,
      productImageUrl: row.product_image_url,
    }));

    const featureRows = await selectActiveFeatures(auth.user.userId);
    const features = featureRows.map((f) => ({
      feature: f.feature,
      grantedAt: f.granted_at,
    }));

    return json({ features, purchases, range: { from, to } });
  } catch (error) {
    return json(
      { error: `Failed to fetch purchases: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
