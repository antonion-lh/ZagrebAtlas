import type { MetadataRoute } from "next";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.JAVNI_URL || "https://zg-atlas.lakehouse.hr";
  const staticne: MetadataRoute.Sitemap = ["/", "/cetvrti", "/ustanove", "/energija", "/katalog", "/vodic"].map(
    (p) => ({ url: `${base}${p}`, changeFrequency: p === "/" ? "daily" : "weekly", priority: p === "/" ? 1 : 0.7 })
  );
  try {
    const [{ rows: cetvrti }, { rows: objekti }] = await Promise.all([
      pool().query<{ slug: string }>(`SELECT slug FROM geo.cetvrt ORDER BY slug`),
      pool().query<{ id: number }>(`SELECT id FROM energy.objekt ORDER BY id`),
    ]);
    return [
      ...staticne,
      ...cetvrti.map((c) => ({ url: `${base}/cetvrti/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
      ...objekti.map((o) => ({ url: `${base}/energija/${o.id}`, changeFrequency: "yearly" as const, priority: 0.4 })),
    ];
  } catch {
    return staticne;
  }
}
