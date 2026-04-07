import type { ProductRecord, ProductRow } from "./types.js";

export { parseCreateProductInput, parseUpdateProductInput } from "./parse.js";
export {
  deleteProductById,
  insertProduct,
  selectActiveProducts,
  selectAllProducts,
  selectProductById,
  selectProductBySlug,
  updateProductById,
} from "./queries.js";
export type {
  CreateProductInput,
  PricingType,
  ProductRecord,
  UpdateProductInput,
} from "./types.js";

function toNullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

export function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    slug: row.slug,
    nameUk: row.name_uk,
    nameEn: row.name_en,
    descriptionUk: row.description_uk,
    descriptionEn: row.description_en,
    pricingType: row.pricing_type,
    priceUahMinor: toNullableNumber(row.price_uah_minor),
    priceUsdMinor: toNullableNumber(row.price_usd_minor),
    imageUrl: row.image_url,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
