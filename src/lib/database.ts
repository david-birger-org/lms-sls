import { SQL } from "bun";
import { env } from "./env.js";

const DATABASE_POOL_MAX = 5;
const DATABASE_IDLE_TIMEOUT_SECONDS = 30;
const DATABASE_CONNECTION_TIMEOUT_SECONDS = 30;

let database: SQL | null = null;

export function getDatabase() {
  if (!database) {
    database = new SQL(env.databaseUrl, {
      connectionTimeout: DATABASE_CONNECTION_TIMEOUT_SECONDS,
      idleTimeout: DATABASE_IDLE_TIMEOUT_SECONDS,
      max: DATABASE_POOL_MAX,
      prepare: false,
    });
  }

  return database;
}
