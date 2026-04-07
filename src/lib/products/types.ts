export type PricingType = "fixed" | "on_request";

export interface ProductRow {
  id: string;
  slug: string;
  name_uk: string;
  name_en: string;
  description_uk: string | null;
  description_en: string | null;
  pricing_type: PricingType;
  price_uah_minor: number | string | null;
  price_usd_minor: number | string | null;
  image_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductRecord {
  id: string;
  slug: string;
  nameUk: string;
  nameEn: string;
  descriptionUk: string | null;
  descriptionEn: string | null;
  pricingType: PricingType;
  priceUahMinor: number | null;
  priceUsdMinor: number | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  slug: string;
  nameUk: string;
  nameEn: string;
  descriptionUk?: string | null;
  descriptionEn?: string | null;
  pricingType: PricingType;
  priceUahMinor?: number | null;
  priceUsdMinor?: number | null;
  imageUrl?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface UpdateProductInput {
  slug?: string;
  nameUk?: string;
  nameEn?: string;
  descriptionUk?: string | null;
  descriptionEn?: string | null;
  pricingType?: PricingType;
  priceUahMinor?: number | null;
  priceUsdMinor?: number | null;
  imageUrl?: string | null;
  active?: boolean;
  sortOrder?: number;
}
