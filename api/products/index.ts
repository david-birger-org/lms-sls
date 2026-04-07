import {
  selectActiveProducts,
  toProductRecord,
} from "../../src/lib/products/index.js";
import { json } from "../../src/lib/response.js";

export async function GET() {
  try {
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
