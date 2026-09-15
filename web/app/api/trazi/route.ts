import { pool } from "@/lib/db";
import { greskaPosluzitelja, ocistiUpit } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

export type Pogodak = {
  vrsta: "cetvrt" | "mo" | "objekt";
  id: string;
  naziv: string;
  adresa: string | null;
  skup: string;
  tip: string | null;
  cetvrt: string | null;
  cetvrt_slug: string | null;
  lon: number;
  lat: number;
};

/**
 * GET /api/trazi?q=ljekarna+Dubrava[&cetvrt=maksimir]
 * Lokalna pretraga (nema vanjskih geokodera): četvrti, mjesni odbori, točke/linije s geometrijom.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = ocistiUpit(sp.get("q") || "");
  if (q.length < 2) {
    return Response.json({ q, pogoci: [] as Pogodak[] }, { headers: { "Cache-Control": "no-store" } });
  }
  const cetvrt = ocistiUpit(sp.get("cetvrt") || "", 80).toLowerCase();
  const uzorak = `%${q.replace(/[%_\\]/g, "")}%`;
  const prefiks = `${q.replace(/[%_\\]/g, "")}%`;

  try {
    const [{ rows: cetvrti }, { rows: mo }, { rows: objekti }] = await Promise.all([
      pool().query<Pogodak>(
        `SELECT 'cetvrt' AS vrsta, id::text AS id, naziv, NULL::text AS adresa,
                'cetvrti' AS skup, NULL::text AS tip, naziv AS cetvrt, slug AS cetvrt_slug,
                ST_X(ST_PointOnSurface(geom)) AS lon, ST_Y(ST_PointOnSurface(geom)) AS lat
         FROM geo.cetvrt
         WHERE unaccent(naziv) ILIKE unaccent($1)
         ORDER BY naziv
         LIMIT 4`,
        [uzorak]
      ),
      pool().query<Pogodak>(
        `SELECT 'mo' AS vrsta, m.id::text AS id, m.naziv, NULL::text AS adresa,
                'mo' AS skup, NULL::text AS tip, c.naziv AS cetvrt, c.slug AS cetvrt_slug,
                ST_X(ST_PointOnSurface(m.geom)) AS lon, ST_Y(ST_PointOnSurface(m.geom)) AS lat
         FROM geo.mo m
         LEFT JOIN geo.cetvrt c ON c.id = m.cetvrt_id
         WHERE unaccent(m.naziv) ILIKE unaccent($1)
         ORDER BY m.naziv
         LIMIT 4`,
        [uzorak]
      ),
      pool().query<Pogodak>(
        `SELECT 'objekt' AS vrsta, o.id::text AS id, o.naziv, o.adresa,
                o.skup_sifra AS skup, o.tip, c.naziv AS cetvrt, c.slug AS cetvrt_slug,
                ST_X(ST_PointOnSurface(o.geom)) AS lon, ST_Y(ST_PointOnSurface(o.geom)) AS lat
         FROM geo.objekt o
         LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id
         WHERE o.geom IS NOT NULL
           AND (
             unaccent(coalesce(o.naziv, '')) ILIKE unaccent($1)
             OR unaccent(coalesce(o.adresa, '')) ILIKE unaccent($1)
             OR unaccent(coalesce(o.attrs->>'vrsta', '')) ILIKE unaccent($1)
           )
           AND ($2 = '' OR c.slug = $2)
         ORDER BY
           CASE WHEN $2 <> '' AND c.slug = $2 THEN 0 ELSE 1 END,
           CASE WHEN unaccent(coalesce(o.naziv, '')) ILIKE unaccent($3) THEN 0 ELSE 1 END,
           o.naziv NULLS LAST
         LIMIT 10`,
        [uzorak, cetvrt, prefiks]
      ),
    ]);

    const pogoci = [...cetvrti, ...mo, ...objekti]
      .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
      .slice(0, 12);

    return Response.json(
      { q, pogoci },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    // unaccent možda nije uključen — pad na ILIKE bez njega
    if (e instanceof Error && /unaccent/i.test(e.message)) {
      try {
        return await traziBezUnaccent(uzorak, prefiks, cetvrt, q);
      } catch (e2) {
        return greskaPosluzitelja(e2);
      }
    }
    return greskaPosluzitelja(e);
  }
}

async function traziBezUnaccent(uzorak: string, prefiks: string, cetvrt: string, q: string) {
  const [{ rows: cetvrti }, { rows: mo }, { rows: objekti }] = await Promise.all([
    pool().query<Pogodak>(
      `SELECT 'cetvrt' AS vrsta, id::text AS id, naziv, NULL::text AS adresa,
              'cetvrti' AS skup, NULL::text AS tip, naziv AS cetvrt, slug AS cetvrt_slug,
              ST_X(ST_PointOnSurface(geom)) AS lon, ST_Y(ST_PointOnSurface(geom)) AS lat
       FROM geo.cetvrt WHERE naziv ILIKE $1 ORDER BY naziv LIMIT 4`,
      [uzorak]
    ),
    pool().query<Pogodak>(
      `SELECT 'mo' AS vrsta, m.id::text AS id, m.naziv, NULL::text AS adresa,
              'mo' AS skup, NULL::text AS tip, c.naziv AS cetvrt, c.slug AS cetvrt_slug,
              ST_X(ST_PointOnSurface(m.geom)) AS lon, ST_Y(ST_PointOnSurface(m.geom)) AS lat
       FROM geo.mo m LEFT JOIN geo.cetvrt c ON c.id = m.cetvrt_id
       WHERE m.naziv ILIKE $1 ORDER BY m.naziv LIMIT 4`,
      [uzorak]
    ),
    pool().query<Pogodak>(
      `SELECT 'objekt' AS vrsta, o.id::text AS id, o.naziv, o.adresa,
              o.skup_sifra AS skup, o.tip, c.naziv AS cetvrt, c.slug AS cetvrt_slug,
              ST_X(ST_PointOnSurface(o.geom)) AS lon, ST_Y(ST_PointOnSurface(o.geom)) AS lat
       FROM geo.objekt o LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id
       WHERE o.geom IS NOT NULL
         AND (o.naziv ILIKE $1 OR o.adresa ILIKE $1 OR o.attrs->>'vrsta' ILIKE $1)
         AND ($2 = '' OR c.slug = $2)
       ORDER BY
         CASE WHEN $2 <> '' AND c.slug = $2 THEN 0 ELSE 1 END,
         CASE WHEN o.naziv ILIKE $3 THEN 0 ELSE 1 END,
         o.naziv NULLS LAST
       LIMIT 10`,
      [uzorak, cetvrt, prefiks]
    ),
  ]);
  const pogoci = [...cetvrti, ...mo, ...objekti]
    .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
    .slice(0, 12);
  return Response.json({ q, pogoci }, { headers: { "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
