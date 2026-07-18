import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (process.env.DEV_DATABASE_URL) {
  console.log("[db] Using DEV_DATABASE_URL (development database)");
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
