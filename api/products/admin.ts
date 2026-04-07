import { getErrorMessage } from "../../src/lib/errors.js";
import { withTrustedInternalAdmin } from "../../src/lib/internal-auth.js";
import {
  deleteProductById,
  insertProduct,
  parseCreateProductInput,
  parseUpdateProductInput,
  selectAllProducts,
  selectProductById,
  toProductRecord,
  updateProductById,
} from "../../src/lib/products/index.js";
import { json } from "../../src/lib/response.js";

export const GET = withTrustedInternalAdmin(async () => {
  try {
    const rows = await selectAllProducts();
    return json({ products: rows.map(toProductRecord) });
  } catch (error) {
    return json(
      { error: `Failed to fetch products: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
});

export const POST = withTrustedInternalAdmin(async (request) => {
  try {
    const body = await request.json();
    const input = parseCreateProductInput(body);

    if (!input)
      return json(
        {
          error:
            "Invalid product data. Required: slug, nameUk, nameEn, pricingType ('fixed'|'on_request'); fixed products require priceUahMinor and priceUsdMinor.",
        },
        { status: 400 },
      );

    const row = await insertProduct(input);
    return json({ product: toProductRecord(row) }, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("unique") || message.includes("duplicate"))
      return json(
        { error: "A product with this slug already exists." },
        { status: 409 },
      );

    return json(
      { error: `Failed to create product: ${message}` },
      { status: 500 },
    );
  }
});

export const PUT = withTrustedInternalAdmin(async (request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "Missing product id." }, { status: 400 });

  try {
    const body = await request.json();
    const input = parseUpdateProductInput(body);

    if (!input) return json({ error: "Invalid update data." }, { status: 400 });

    const row = await updateProductById(id, input);
    if (!row) return json({ error: "Product not found." }, { status: 404 });

    return json({ product: toProductRecord(row) });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("unique") || message.includes("duplicate"))
      return json(
        { error: "A product with this slug already exists." },
        { status: 409 },
      );
    if (message.includes("products_fixed_prices_required"))
      return json(
        {
          error:
            "Fixed-price products require both priceUahMinor and priceUsdMinor.",
        },
        { status: 400 },
      );

    return json(
      { error: `Failed to update product: ${message}` },
      { status: 500 },
    );
  }
});

export const DELETE = withTrustedInternalAdmin(async (request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "Missing product id." }, { status: 400 });

  try {
    const existing = await selectProductById(id);
    if (!existing)
      return json({ error: "Product not found." }, { status: 404 });

    await deleteProductById(id);
    return json({ ok: true });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("foreign key") || message.includes("referenced"))
      return json(
        { error: "Cannot delete product: it has associated payments." },
        { status: 409 },
      );

    return json(
      { error: `Failed to delete product: ${message}` },
      { status: 500 },
    );
  }
});
