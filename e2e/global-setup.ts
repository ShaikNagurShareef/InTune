import { Pool } from "pg";

/** Each e2e run starts with empty rate-limit windows so repeated local runs don't trip signup limits. */
export default async function globalSetup(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/intune_e2e` });
  await pool.query("delete from rate_limits");
  await pool.end();
}
