import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { uCsv } from "@/lib/izvoz";
import type { Feature, Geometry } from "geojson";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "geojson" ? "geojson" : "csv";

  const { rows: cetvrti } = await pool().query<{ id: number; naziv: string }>(
    `SELECT id, naziv FROM geo.cetvrt WHERE slug = $1`,
    [slug]
  );
  const cetvrt = cetvrti[0];
  if (!cetvrt) notFound();

  const { rows } = await pool().query<{
    id: string;
    skup: string;
    skup_naziv: string;
    azurnost: string;
    tip: string;
    naziv: string | null;
    adresa: string | null;
    mo: string | null;
    telefon: string | null;
    email: string | null;
    web: string | null;
    lon: number | null;
    lat: number | null;
    geojson: string;
  }>(
    `SELECT o.id::text, o.skup_sifra AS skup, s.naziv AS skup_naziv, s.azurnost,
            o.tip, o.naziv, o.adresa, m.naziv AS mo,
            o.attrs->>'telefon' AS telefon, o.attrs->>'email' AS email, o.attrs->>'web' AS web,
            ST_X(ST_PointOnSurface(o.geom)) AS lon, ST_Y(ST_PointOnSurface(o.geom)) AS lat,
            ST_AsGeoJSON(o.geom) AS geojson
     FROM geo.objekt o
     JOIN meta.skup s ON s.sifra = o.skup_sifra
     LEFT JOIN geo.mo m ON m.id = o.mo_id
     WHERE o.cetvrt_id = $1
        OR (o.skup_sifra = 'prometnice'
            AND ST_Intersects(o.geom, (SELECT geom FROM geo.cetvrt WHERE id = $1)))
     ORDER BY o.skup_sifra, o.naziv NULLS LAST`,
    [cetvrt.id]
  );

  if (format === "geojson") {
    const features: Feature[] = rows.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: {
        skup: r.skup,
        skup_naziv: r.skup_naziv,
        azurnost: r.azurnost,
        tip: r.tip,
        naziv: r.naziv,
        adresa: r.adresa,
        cetvrt: cetvrt.naziv,
        mo: r.mo,
        telefon: r.telefon,
        email: r.email,
        web: r.web,
      },
      geometry: JSON.parse(r.geojson) as Geometry,
    }));
    return Response.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Content-Disposition": `attachment; filename="atlas-${slug}.geojson"`,
        },
      }
    );
  }

  const csv = uCsv(
    [
      "skup",
      "skup_naziv",
      "azurnost",
      "tip",
      "naziv",
      "adresa",
      "cetvrt",
      "mjesni_odbor",
      "telefon",
      "email",
      "web",
      "lon",
      "lat",
    ],
    rows.map((r) => [
      r.skup,
      r.skup_naziv,
      r.azurnost,
      r.tip,
      r.naziv,
      r.adresa,
      cetvrt.naziv,
      r.mo,
      r.telefon,
      r.email,
      r.web,
      r.lon?.toFixed(6) ?? "",
      r.lat?.toFixed(6) ?? "",
    ])
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="atlas-${slug}.csv"`,
    },
  });
}
