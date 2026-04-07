import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is missing; set it in .env or export it.");
  process.exit(1);
}

const result = spawnSync(
  "bunx",
  ["supabase", "db", "push", "--db-url", databaseUrl],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
