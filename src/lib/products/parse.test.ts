import { describe, expect, it } from "bun:test";

import { parseCreateProductInput } from "./parse.js";

describe("parseCreateProductInput", () => {
  it("accepts on-request products without explicit prices", () => {
    expect(
      parseCreateProductInput({
        nameEn: "Audit",
        nameUk: "Аудит",
        pricingType: "on_request",
        slug: "audit",
      }),
    ).toEqual({
      active: true,
      descriptionEn: null,
      descriptionUk: null,
      imageUrl: null,
      nameEn: "Audit",
      nameUk: "Аудит",
      priceUahMinor: null,
      priceUsdMinor: null,
      pricingType: "on_request",
      slug: "audit",
      sortOrder: 0,
    });
  });

  it("still requires both prices for fixed products", () => {
    expect(
      parseCreateProductInput({
        nameEn: "Audit",
        nameUk: "Аудит",
        pricingType: "fixed",
        priceUahMinor: 1000,
        slug: "audit",
      }),
    ).toBeNull();
  });
});
