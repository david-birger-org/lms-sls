import { getDatabase } from "../database.js";
import type {
  CreateProductInput,
  ProductRow,
  UpdateProductInput,
} from "./types.js";

const PRODUCT_COLUMNS = [
  "id",
  "slug",
  "name_uk",
  "name_en",
  "description_uk",
  "description_en",
  "pricing_type",
  "price_uah_minor",
  "price_usd_minor",
  "image_url",
  "active",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

const PRODUCT_ORDER_BY = "sort_order asc, created_at asc";

function buildProductCaseUpdate(
  column: string,
  enabled: boolean,
  value: unknown,
) {
  return {
    sql: `${column} = case when ? then ? else ${column} end`,
    values: [enabled, enabled ? value : null],
  };
}

export async function selectActiveProducts() {
  const database = getDatabase();

  return database.unsafe<ProductRow[]>(
    `select ${PRODUCT_COLUMNS} from products where active = true order by ${PRODUCT_ORDER_BY}`,
  );
}

export async function selectAllProducts() {
  const database = getDatabase();

  return database.unsafe<ProductRow[]>(
    `select ${PRODUCT_COLUMNS} from products order by ${PRODUCT_ORDER_BY}`,
  );
}

export async function selectProductById(id: string) {
  const database = getDatabase();
  const rows = await database.unsafe<ProductRow[]>(
    `select ${PRODUCT_COLUMNS} from products where id = ? limit 1`,
    [id],
  );

  return rows[0] ?? null;
}

export async function selectProductBySlug(slug: string) {
  const database = getDatabase();
  const rows = await database.unsafe<ProductRow[]>(
    `select ${PRODUCT_COLUMNS} from products where slug = ? limit 1`,
    [slug],
  );

  return rows[0] ?? null;
}

export async function insertProduct(input: CreateProductInput) {
  const database = getDatabase();
  const rows = await database.unsafe<ProductRow[]>(
    `
      insert into products (
        slug, name_uk, name_en, description_uk, description_en,
        pricing_type, price_uah_minor, price_usd_minor,
        image_url, active, sort_order
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      returning ${PRODUCT_COLUMNS}
    `,
    [
      input.slug,
      input.nameUk,
      input.nameEn,
      input.descriptionUk ?? null,
      input.descriptionEn ?? null,
      input.pricingType,
      input.priceUahMinor ?? null,
      input.priceUsdMinor ?? null,
      input.imageUrl ?? null,
      input.active ?? true,
      input.sortOrder ?? 0,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("Failed to insert product.");
  return row;
}

export async function updateProductById(id: string, input: UpdateProductInput) {
  const database = getDatabase();
  const hasImage = "imageUrl" in input;
  const hasDescUk = "descriptionUk" in input;
  const hasDescEn = "descriptionEn" in input;
  const hasUah = "priceUahMinor" in input;
  const hasUsd = "priceUsdMinor" in input;

  const descriptionUkUpdate = buildProductCaseUpdate(
    "description_uk",
    hasDescUk,
    input.descriptionUk ?? null,
  );
  const descriptionEnUpdate = buildProductCaseUpdate(
    "description_en",
    hasDescEn,
    input.descriptionEn ?? null,
  );
  const priceUahUpdate = buildProductCaseUpdate(
    "price_uah_minor",
    hasUah,
    input.priceUahMinor ?? null,
  );
  const priceUsdUpdate = buildProductCaseUpdate(
    "price_usd_minor",
    hasUsd,
    input.priceUsdMinor ?? null,
  );
  const imageUpdate = buildProductCaseUpdate(
    "image_url",
    hasImage,
    input.imageUrl ?? null,
  );

  const rows = await database.unsafe<ProductRow[]>(
    `
      update products
      set
        slug = coalesce(?, slug),
        name_uk = coalesce(?, name_uk),
        name_en = coalesce(?, name_en),
        ${descriptionUkUpdate.sql},
        ${descriptionEnUpdate.sql},
        pricing_type = coalesce(?, pricing_type),
        ${priceUahUpdate.sql},
        ${priceUsdUpdate.sql},
        ${imageUpdate.sql},
        active = coalesce(?, active),
        sort_order = coalesce(?, sort_order),
        updated_at = timezone('utc', now())
      where id = ?
      returning ${PRODUCT_COLUMNS}
    `,
    [
      input.slug ?? null,
      input.nameUk ?? null,
      input.nameEn ?? null,
      ...descriptionUkUpdate.values,
      ...descriptionEnUpdate.values,
      input.pricingType ?? null,
      ...priceUahUpdate.values,
      ...priceUsdUpdate.values,
      ...imageUpdate.values,
      input.active ?? null,
      input.sortOrder ?? null,
      id,
    ],
  );

  return rows[0] ?? null;
}

export async function deleteProductById(id: string) {
  const database = getDatabase();
  const rows = await database<{ id: string }[]>`
    delete from products
    where id = ${id}
    returning id
  `;

  return rows[0] ?? null;
}
