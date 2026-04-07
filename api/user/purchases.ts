import { getErrorMessage } from "../../src/lib/errors.js";
import { requireTrustedInternalUser } from "../../src/lib/internal-auth-user.js";
import { json } from "../../src/lib/response.js";
import { selectUserPurchases } from "../../src/lib/user-purchases/queries.js";

export async function GET(request: Request) {
  const auth = await requireTrustedInternalUser(request);
  if (!auth.ok) return auth.response;

  try {
    const rows = await selectUserPurchases(auth.user.userId);

    const purchases = rows.map((row) => ({
      id: row.id,
      status: row.status,
      amountMinor: Number(row.amount_minor),
      finalAmountMinor: row.final_amount_minor
        ? Number(row.final_amount_minor)
        : null,
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

    return json({ purchases });
  } catch (error) {
    return json(
      { error: `Failed to fetch purchases: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
