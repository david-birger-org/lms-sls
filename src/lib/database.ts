import { SQL } from "bun";
import { env } from "./env.js";

const DATABASE_POOL_MAX = 5;
const DATABASE_IDLE_TIMEOUT_SECONDS = 5;
const DATABASE_CONNECTION_TIMEOUT_SECONDS = 30;

let database: SQL | null = null;

function getDatabaseUrl() {
  const connectionString = env.databaseUrl;

  try {
    const url = new URL(connectionString);

    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
      throw new Error(
        "DATABASE_URL must use the Supabase transaction pooler (port 6543) for lms-sls.",
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "DATABASE_URL must be a valid Postgres connection string.",
      );
    }

    throw error;
  }

  return connectionString;
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
