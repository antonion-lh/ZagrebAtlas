import { Pool } from "pg";

const globalForPg = globalThis as unknown as { atlasPool?: Pool };

export function pool(): Pool {
  if (!globalForPg.atlasPool) {
    globalForPg.atlasPool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://atlas:atlas@127.0.0.1:5434/atlas",
      max: Number(process.env.PGPOOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Sve što Atlas radi su čitanja; upit koji traje > 20 s je greška, ne čekanje.
      statement_timeout: 20_000,
      application_name: "atlas-web",
    });
  }
  return globalForPg.atlasPool;
}
