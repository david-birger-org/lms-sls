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
  startIndex: number,
) {
  return {
    sql: `${column} = case when $${startIndex}::boolean then $${startIndex + 1} else ${column} end`,
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
  const rows = await database<ProductRow[]>`
    select ${database.unsafe(PRODUCT_COLUMNS)} from products where id = ${id} limit 1
  `;

  return rows[0] ?? null;
}

export async function selectProductBySlug(slug: string) {
  const database = getDatabase();
  const rows = await database<ProductRow[]>`
    select ${database.unsafe(PRODUCT_COLUMNS)} from products where slug = ${slug} limit 1
  `;

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
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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

  // $1 = slug, $2 = name_uk, $3 = name_en
  const descriptionUkUpdate = buildProductCaseUpdate(
    "description_uk",
    hasDescUk,
    input.descriptionUk ?? null,
    4,
  );
  // $4, $5
  const descriptionEnUpdate = buildProductCaseUpdate(
    "description_en",
    hasDescEn,
    input.descriptionEn ?? null,
    6,
  );
  // $6, $7  |  $8 = pricing_type
  const priceUahUpdate = buildProductCaseUpdate(
    "price_uah_minor",
    hasUah,
    input.priceUahMinor ?? null,
    9,
  );
  // $9, $10
  const priceUsdUpdate = buildProductCaseUpdate(
    "price_usd_minor",
    hasUsd,
    input.priceUsdMinor ?? null,
    11,
  );
  // $11, $12
  const imageUpdate = buildProductCaseUpdate(
    "image_url",
    hasImage,
    input.imageUrl ?? null,
    13,
  );
  // $13, $14  |  $15 = active, $16 = sort_order, $17 = id

  const rows = await database.unsafe<ProductRow[]>(
    `
      update products
      set
        slug = coalesce($1, slug),
        name_uk = coalesce($2, name_uk),
        name_en = coalesce($3, name_en),
        ${descriptionUkUpdate.sql},
        ${descriptionEnUpdate.sql},
        pricing_type = coalesce($8, pricing_type),
        ${priceUahUpdate.sql},
        ${priceUsdUpdate.sql},
        ${imageUpdate.sql},
        active = coalesce($15, active),
        sort_order = coalesce($16, sort_order),
        updated_at = timezone('utc', now())
      where id = $17
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
