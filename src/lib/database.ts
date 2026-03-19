import { SQL } from "bun";

const DATABASE_POOL_MAX = 5;
const DATABASE_IDLE_TIMEOUT_SECONDS = 30;
const DATABASE_CONNECTION_TIMEOUT_SECONDS = 30;

let database: SQL | null = null;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing in environment variables.");
  }

  return databaseUrl;
}

export function getDatabase() {
  if (!database) {
    database = new SQL(getDatabaseUrl(), {
      connectionTimeout: DATABASE_CONNECTION_TIMEOUT_SECONDS,
      idleTimeout: DATABASE_IDLE_TIMEOUT_SECONDS,
      max: DATABASE_POOL_MAX,
      prepare: false,
    });
  }

  return database;
}
