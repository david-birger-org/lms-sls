import type {
  CreateProductInput,
  PricingType,
  UpdateProductInput,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePricingType(value: unknown): PricingType | null {
  return value === "fixed" || value === "on_request" ? value : null;
}

function parseRequiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalMinor(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return undefined;

  return Math.round(value);
}

function parseOptionalSortOrder(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

export function parseCreateProductInput(
  body: unknown,
): CreateProductInput | null {
  const input = asRecord(body);
  if (!input) return null;

  const slug = parseRequiredString(input.slug);
  const nameUk = parseRequiredString(input.nameUk);
  const nameEn = parseRequiredString(input.nameEn);
  const pricingType = parsePricingType(input.pricingType);

  if (!slug || !nameUk || !nameEn || !pricingType) return null;

  const priceUahMinor = parseOptionalMinor(input.priceUahMinor);
  const priceUsdMinor = parseOptionalMinor(input.priceUsdMinor);
  if (
    pricingType === "fixed" &&
    (priceUahMinor === undefined || priceUsdMinor === undefined)
  )
    return null;

  if (
    pricingType === "fixed" &&
    (priceUahMinor === null || priceUsdMinor === null)
  )
    return null;

  const descriptionUk = parseOptionalString(input.descriptionUk);
  const descriptionEn = parseOptionalString(input.descriptionEn);
  const imageUrl = parseOptionalString(input.imageUrl);
  const sortOrder = parseOptionalSortOrder(input.sortOrder);

  if (
    (input.descriptionUk !== undefined && descriptionUk === undefined) ||
    (input.descriptionEn !== undefined && descriptionEn === undefined) ||
    (input.imageUrl !== undefined && imageUrl === undefined) ||
    (input.sortOrder !== undefined && sortOrder === undefined)
  )
    return null;

  return {
    slug,
    nameUk,
    nameEn,
    descriptionUk: descriptionUk ?? null,
    descriptionEn: descriptionEn ?? null,
    pricingType,
    priceUahMinor: priceUahMinor ?? null,
    priceUsdMinor: priceUsdMinor ?? null,
    imageUrl: imageUrl ?? null,
    active: typeof input.active === "boolean" ? input.active : true,
    sortOrder: sortOrder ?? 0,
  };
}

export function parseUpdateProductInput(
  body: unknown,
): UpdateProductInput | null {
  const input = asRecord(body);
  if (!input) return null;

  const update: UpdateProductInput = {};

  if (input.slug !== undefined) {
    const slug = parseRequiredString(input.slug);
    if (!slug) return null;
    update.slug = slug;
  }

  if (input.nameUk !== undefined) {
    const nameUk = parseRequiredString(input.nameUk);
    if (!nameUk) return null;
    update.nameUk = nameUk;
  }

  if (input.nameEn !== undefined) {
    const nameEn = parseRequiredString(input.nameEn);
    if (!nameEn) return null;
    update.nameEn = nameEn;
  }

  if (input.descriptionUk !== undefined) {
    const descriptionUk = parseOptionalString(input.descriptionUk);
    if (descriptionUk === undefined) return null;
    update.descriptionUk = descriptionUk;
  }

  if (input.descriptionEn !== undefined) {
    const descriptionEn = parseOptionalString(input.descriptionEn);
    if (descriptionEn === undefined) return null;
    update.descriptionEn = descriptionEn;
  }

  if (input.pricingType !== undefined) {
    const pricingType = parsePricingType(input.pricingType);
    if (!pricingType) return null;
    update.pricingType = pricingType;
  }

  if (input.priceUahMinor !== undefined) {
    const priceUahMinor = parseOptionalMinor(input.priceUahMinor);
    if (priceUahMinor === undefined) return null;
    update.priceUahMinor = priceUahMinor;
  }

  if (input.priceUsdMinor !== undefined) {
    const priceUsdMinor = parseOptionalMinor(input.priceUsdMinor);
    if (priceUsdMinor === undefined) return null;
    update.priceUsdMinor = priceUsdMinor;
  }

  if (input.imageUrl !== undefined) {
    const imageUrl = parseOptionalString(input.imageUrl);
    if (imageUrl === undefined) return null;
    update.imageUrl = imageUrl;
  }

  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return null;
    update.active = input.active;
  }

  if (input.sortOrder !== undefined) {
    const sortOrder = parseOptionalSortOrder(input.sortOrder);
    if (sortOrder === undefined) return null;
    update.sortOrder = sortOrder;
  }

  return update;
}
