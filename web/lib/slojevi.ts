import { pool } from "@/lib/db";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { TEME, bojaSloja, type CetvrtKratko, type SlojMeta } from "@/lib/slojevi-ui";

export * from "@/lib/slojevi-ui";

export async function ucitajMetaSlojeva(opts?: { sveTablice?: boolean }): Promise<SlojMeta[]> {
  const { rows } = await pool().query<{
    sifra: string;
    naziv: string;
    tema: string | null;
    tip: string | null;
    azurnost: string;
    ckan_url: string | null;
    broj_zapisa: number | null;
    zadnja_sinkronizacija: Date | null;
    napomena: string | null;
    geometrija: string | null;
  }>(
    `SELECT sifra, naziv, tema, tip, azurnost, ckan_url, broj_zapisa,
            zadnja_sinkronizacija, napomena, geometrija
     FROM meta.skup
     WHERE aktivan AND zadnja_sinkronizacija IS NOT NULL`
  );

  const redTema = new Map(TEME.map((t, i) => [t.sifra, i]));
  return rows
    .filter((r) => opts?.sveTablice || (r.geometrija || "tocka") !== "tablica")
    .map((r) => {
      const tema = r.tema || "meta";
      const g = r.geometrija || "tocka";
      const vrsta: SlojMeta["vrsta"] =
        g === "poligon" ? "poligon" : g === "linija" ? "linija" : g === "tablica" ? "tablica" : "tocka";
      return {
        sifra: r.sifra,
        naziv: r.naziv,
        tema,
        tip: r.tip,
        azurnost: r.azurnost,
        ckan_url: r.ckan_url,
        broj: r.broj_zapisa ?? 0,
        sink: r.zadnja_sinkronizacija ? r.zadnja_sinkronizacija.toISOString() : null,
        napomena: r.napomena,
        vrsta,
        boja: bojaSloja(r.sifra, tema),
      };
    })
    .sort((a, b) => {
      const ta = redTema.get(a.tema) ?? 99;
      const tb = redTema.get(b.tema) ?? 99;
      if (ta !== tb) return ta - tb;
      return a.naziv.localeCompare(b.naziv, "hr");
    });
}

export async function ucitajSloj(sifra: string): Promise<FeatureCollection | null> {
  if (sifra === "cetvrti") {
    const { rows } = await pool().query<{
      id: number;
      naziv: string;
      slug: string;
      geojson: string;
    }>(`SELECT id, naziv, slug, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00005)) AS geojson
        FROM geo.cetvrt ORDER BY naziv`);
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        properties: { id: r.id, naziv: r.naziv, slug: r.slug, skup: "cetvrti", cetvrt_id: r.id },
        geometry: JSON.parse(r.geojson) as Geometry,
      })),
    };
  }
  if (sifra === "mo") {
    const { rows } = await pool().query<{
      id: number;
      naziv: string;
      slug: string | null;
      cetvrt_id: number | null;
      cetvrt: string | null;
      cetvrt_slug: string | null;
      geojson: string;
    }>(`SELECT m.id, m.naziv, m.slug, m.cetvrt_id, c.naziv AS cetvrt, c.slug AS cetvrt_slug,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(m.geom, 0.00005)) AS geojson
        FROM geo.mo m LEFT JOIN geo.cetvrt c ON c.id = m.cetvrt_id
        ORDER BY m.naziv`);
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        properties: {
          id: r.id,
          naziv: r.naziv,
          slug: r.slug,
          skup: "mo",
          cetvrt_id: r.cetvrt_id,
          cetvrt: r.cetvrt,
          cetvrt_slug: r.cetvrt_slug,
        },
        geometry: JSON.parse(r.geojson) as Geometry,
      })),
    };
  }

  const { rows: meta } = await pool().query<{ sifra: string }>(
    `SELECT sifra FROM meta.skup WHERE sifra = $1 AND aktivan`,
    [sifra]
  );
  if (!meta.length) return null;

  const { rows } = await pool().query<{
    id: string;
    naziv: string | null;
    adresa: string | null;
    tip: string;
    cetvrt_id: number | null;
    cetvrt: string | null;
    cetvrt_slug: string | null;
    mo: string | null;
    attrs: Record<string, unknown>;
    geojson: string;
    energy_id: string | null;
  }>(
    `SELECT o.id::text, o.naziv, o.adresa, o.tip, o.cetvrt_id,
            c.naziv AS cetvrt, c.slug AS cetvrt_slug, m.naziv AS mo,
            o.attrs,
            ST_AsGeoJSON(
              CASE WHEN GeometryType(o.geom) IN ('POINT', 'MULTIPOINT') THEN o.geom
                   ELSE ST_SimplifyPreserveTopology(o.geom, 0.00002) END,
              6
            ) AS geojson,
            e.id::text AS energy_id
     FROM geo.objekt o
     LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id
     LEFT JOIN geo.mo m ON m.id = o.mo_id
     LEFT JOIN LATERAL (
       SELECT id FROM energy.objekt WHERE geo_objekt_id = o.id ORDER BY id LIMIT 1
     ) e ON true
     WHERE o.skup_sifra = $1`,
    [sifra]
  );

  const features: Feature[] = rows.map((r) => {
    const { ostalo, ...ravno } = r.attrs || {};
    return {
      type: "Feature",
      id: r.id,
      properties: {
        id: r.id,
        skup: sifra,
        naziv: r.naziv,
        adresa: r.adresa,
        tip: r.tip,
        cetvrt_id: r.cetvrt_id,
        cetvrt: r.cetvrt,
        cetvrt_slug: r.cetvrt_slug,
        mo: r.mo,
        energy_id: r.energy_id,
        ...ravno,
        ostalo: ostalo ? JSON.stringify(ostalo) : null,
      },
      geometry: JSON.parse(r.geojson) as Geometry,
    };
  });

  return { type: "FeatureCollection", features };
}

export async function ucitajCetvrtiKratko(): Promise<CetvrtKratko[]> {
  const { rows } = await pool().query<{
    id: number;
    naziv: string;
    slug: string;
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  }>(
    `SELECT id, naziv, slug,
            ST_XMin(geom) AS xmin, ST_YMin(geom) AS ymin,
            ST_XMax(geom) AS xmax, ST_YMax(geom) AS ymax
     FROM geo.cetvrt ORDER BY naziv`
  );
  return rows.map((r) => ({
    id: r.id,
    naziv: r.naziv,
    slug: r.slug,
    bbox: [r.xmin, r.ymin, r.xmax, r.ymax],
  }));
}
