import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is missing; set it in .env or export it.");
  process.exit(1);
}

const [filePath, slug, title, description] = process.argv.slice(2);

if (!filePath || !slug || !title) {
  console.error(
    "Usage: bun run scripts/upload-lecture.ts <pdf-path> <slug> <title> [description]",
  );
  process.exit(1);
}

const pdfBuffer = readFileSync(resolve(filePath));

const db = new SQL(databaseUrl, { prepare: false });

const rows = await db`
  insert into lectures (slug, title, description, pdf_data)
  values (${slug}, ${title}, ${description ?? null}, ${pdfBuffer})
  on conflict (slug) do update
    set title = excluded.title,
        description = excluded.description,
        pdf_data = excluded.pdf_data,
        updated_at = timezone('utc', now())
  returning id, slug
`;

console.log(`lecture uploaded: ${rows[0].slug} (${rows[0].id})`);
process.exit(0);
