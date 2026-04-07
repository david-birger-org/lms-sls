import {
  selectActiveProducts,
  selectProductBySlug,
  toProductRecord,
} from "../../src/lib/products/index.js";
import { json } from "../../src/lib/response.js";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim();

    if (slug) {
      const row = await selectProductBySlug(slug);
      if (!row || !row.active) return json({ product: null }, { status: 404 });
      return json({ product: toProductRecord(row) });
    }

    const rows = await selectActiveProducts();
    return json({ products: rows.map(toProductRecord) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: `Failed to fetch products: ${message}` },
      { status: 500 },
    );
  }
}
