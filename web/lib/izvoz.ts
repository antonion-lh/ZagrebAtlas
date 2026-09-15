import type { FeatureCollection, Geometry } from "geojson";
import { pool } from "@/lib/db";

/** CSV s ; separatorom, BOM-om i CRLF (Excel na hrvatskom sustavu). */
export function csvPolje(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function uCsv(zaglavlje: string[], redovi: unknown[][]): string {
  const linije = [zaglavlje.join(";"), ...redovi.map((r) => r.map(csvPolje).join(";"))];
  return "\uFEFF" + linije.join("\r\n");
}

function centroid(g: Geometry | null): [number | null, number | null] {
  if (!g) return [null, null];
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  // za linije/poligone uzmi prvu koordinatu kao reprezentativnu točku
  const prva = (function nadji(c: unknown): number[] | null {
    if (!Array.isArray(c)) return null;
    if (typeof c[0] === "number") return c as number[];
    for (const x of c) {
      const r = nadji(x);
      if (r) return r;
    }
    return null;
  })((g as { coordinates?: unknown }).coordinates);
  return prva ? [prva[0], prva[1]] : [null, null];
}

/** GeoJSON sloj → CSV: kanonska polja + spljošteni attrs (ostalo.* kao zasebni stupci). */
export function slojUCsv(fc: FeatureCollection): string {
  const kanon = ["id", "naziv", "adresa", "tip", "cetvrt", "mo", "telefon", "email", "web", "vrsta"];
  const dodatni = new Set<string>();
  const redoviProps: Record<string, unknown>[] = [];
  for (const f of fc.features) {
    const p: Record<string, unknown> = { ...(f.properties || {}) };
    if (typeof p.ostalo === "string") {
      try {
        const o = JSON.parse(p.ostalo) as Record<string, unknown>;
        for (const [k, v] of Object.entries(o)) p[`ostalo_${k}`] = v;
      } catch {
        /* ostavi kao tekst */
      }
      delete p.ostalo;
    }
    const [lon, lat] = centroid(f.geometry);
    p.lon = lon;
    p.lat = lat;
    for (const k of Object.keys(p)) if (!kanon.includes(k)) dodatni.add(k);
    redoviProps.push(p);
  }
  const skriveni = new Set(["skup", "cetvrt_id", "mo_id", "cetvrt_slug", "slug", "godine"]);
  const stupci = [...kanon, ...Array.from(dodatni).filter((k) => !skriveni.has(k)).sort()];
  return uCsv(stupci, redoviProps.map((p) => stupci.map((k) => p[k])));
}

/** Tablični skupovi (bez geometrije) → stupci + redovi, za CSV/JSON preuzimanje. */
export async function ucitajTablicu(sifra: string): Promise<{ stupci: string[]; redovi: unknown[][] } | null> {
  const upiti: Record<string, string> = {
    ulice: `SELECT ul_jid, ime, naselje, naselje_mb, opis, datum FROM geo.ulica ORDER BY ime`,
    predsjednici_gc: `SELECT cetvrt_naziv, ime, adresa, telefon, email, email_podrucni
                      FROM uprava.predsjednik_gc ORDER BY cetvrt_naziv`,
    predsjednici_mo: `SELECT p.mo_naziv, c.naziv AS cetvrt, p.ime, p.adresa, p.telefon, p.email
                      FROM uprava.predsjednik_mo p LEFT JOIN geo.cetvrt c ON c.id = p.cetvrt_id ORDER BY p.mo_naziv`,
    clanovi_gc: `SELECT jedinica_naziv AS cetvrt, prezime_ime, funkcija, stranka, opis_promjena, aktivan
                 FROM uprava.clan_vijeca WHERE razina = 'gc' ORDER BY jedinica_naziv, prezime_ime`,
    clanovi_mo: `SELECT v.jedinica_naziv AS mo, c.naziv AS cetvrt, v.prezime_ime, v.funkcija, v.stranka, v.opis_promjena, v.aktivan
                 FROM uprava.clan_vijeca v LEFT JOIN geo.cetvrt c ON c.id = v.cetvrt_id
                 WHERE v.razina = 'mo' ORDER BY v.jedinica_naziv, v.prezime_ime`,
    prostori_ms: `SELECT mo_naziv, cetvrt_naziv, prostorija, broj_termina FROM uprava.prostor_ms ORDER BY cetvrt_naziv, mo_naziv`,
    isge: `SELECT e.id, e.naziv, e.adresa, e.mjesto, c.naziv AS cetvrt, e.geo_naziv AS spojen_na, e.geo_skup, e.pouzdanost,
                  array_to_string(e.energenti, ', ') AS energenti, e.broj_mjerila,
                  to_char(e.od, 'YYYY-MM') AS od, to_char(e."do", 'YYYY-MM') AS "do",
                  round(e.kwh_ukupno) AS kwh_ukupno, round(e.eur_ukupno, 2) AS eur_ukupno
           FROM energy.objekt e LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id ORDER BY e.naziv`,
    isge_potrosnja: `SELECT e.id AS objekt_id, e.naziv, c.naziv AS cetvrt, p.godina, p.mjesec, p.energent,
                            p.kolicina, p.kwh, p.eur
                     FROM energy.potrosnja p JOIN energy.objekt e ON e.id = p.objekt_id
                     LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id
                     ORDER BY e.naziv, p.godina, p.mjesec, p.energent`,
    asset_lista: `SELECT naziv, stanje, atlas_sifra, paket_id, poveznica, ucestalost, uvjeti, left(opis, 400) AS opis
                  FROM meta.portal_skup ORDER BY stanje, naziv`,
    zrak_2023: `SELECT postaja, datum, polutant, jedinica, vrijednost
                FROM okolis.zrak_dan ORDER BY postaja, datum, polutant`,
    gold_objekti: `SELECT o.id, o.skup_sifra AS skup, o.tip, o.naziv, o.adresa,
                          c.naziv AS cetvrt, m.naziv AS mo,
                          o.attrs->>'telefon' AS telefon, o.attrs->>'email' AS email, o.attrs->>'web' AS web,
                          round(ST_X(ST_PointOnSurface(o.geom))::numeric, 6) AS lon,
                          round(ST_Y(ST_PointOnSurface(o.geom))::numeric, 6) AS lat,
                          e.id AS energy_id, e.pouzdanost AS isge_pouzdanost
                   FROM geo.objekt o
                   LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id
                   LEFT JOIN geo.mo m ON m.id = o.mo_id
                   LEFT JOIN LATERAL (
                     SELECT id, pouzdanost FROM energy.objekt
                     WHERE geo_objekt_id = o.id
                     ORDER BY CASE pouzdanost WHEN 'visoka' THEN 0 WHEN 'srednja' THEN 1 ELSE 2 END, id
                     LIMIT 1
                   ) e ON true
                   ORDER BY o.skup_sifra, o.naziv NULLS LAST, o.id`,
    gold_isge_godina: `SELECT e.id AS objekt_id, e.naziv, e.adresa, c.naziv AS cetvrt,
                              e.geo_skup AS namjena, e.pouzdanost, p.godina,
                              round(coalesce(sum(p.kwh) FILTER (WHERE p.energent <> 'Voda'), 0)) AS kwh,
                              round(coalesce(sum(p.eur), 0)::numeric, 2) AS eur
                       FROM energy.objekt e
                       JOIN energy.potrosnja p ON p.objekt_id = e.id
                       LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id
                       WHERE p.godina BETWEEN 2019 AND 2023
                       GROUP BY e.id, e.naziv, e.adresa, c.naziv, e.geo_skup, e.pouzdanost, p.godina
                       ORDER BY e.naziv, p.godina`,
    gold_inventar_cetvrt: `SELECT c.naziv AS cetvrt, o.skup_sifra AS skup, o.tip, count(*)::int AS n
                           FROM geo.objekt o
                           JOIN geo.cetvrt c ON c.id = o.cetvrt_id
                           GROUP BY c.naziv, o.skup_sifra, o.tip
                           ORDER BY c.naziv, o.skup_sifra`,
  };
  const sql = upiti[sifra];
  if (!sql) return null;
  const res = await pool().query(sql);
  const stupci = res.fields.map((f) => f.name);
  return { stupci, redovi: res.rows.map((r: Record<string, unknown>) => stupci.map((k) => r[k])) };
}

export const TABLICE_DODATNE: { sifra: string; naziv: string; opis: string }[] = [
  {
    sifra: "isge_potrosnja",
    naziv: "ISGE — mjesečna potrošnja (svi objekti)",
    opis: "Objekt × energent × mjesec, agregirano iz mjernih mjesta; ~190 tisuća redaka. Samo CSV.",
  },
  {
    sifra: "asset_lista",
    naziv: "Asset lista Portala vs. Atlas",
    opis: "Što Grad objavljuje i je li učitano u Atlas.",
  },
  {
    sifra: "zrak_2023",
    naziv: "Kvaliteta zraka 2023. (dnevno)",
    opis: "Šest postaja, dnevni NO2 / ozon / PM10.",
  },
  {
    sifra: "gold_objekti",
    naziv: "Gold — objekti (kanonska polja)",
    opis: "Svi objekti s četvrti, MO, lon/lat i ISGE spojem ako postoji. Samo CSV.",
  },
  {
    sifra: "gold_isge_godina",
    naziv: "Gold — ISGE po godini",
    opis: "Objekt × godina: kWh (bez vode) i €, 2019.–2023. Samo CSV.",
  },
  {
    sifra: "gold_inventar_cetvrt",
    naziv: "Gold — inventar četvrti",
    opis: "Broj objekata po četvrti, sloju i tipu.",
  },
];
