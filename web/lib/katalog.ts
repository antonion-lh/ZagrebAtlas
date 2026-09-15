import { pool } from "@/lib/db";
import { TABLICE_DODATNE } from "@/lib/izvoz";
import { TEME, bojaSloja } from "@/lib/slojevi-ui";

export type Resurs = {
  naziv: string | null;
  format: string | null;
  url: string | null;
  velicina: number | null;
  izmjena: string | null;
};

export type KatalogSkup = {
  sifra: string;
  naziv: string;
  tema: string;
  tip: string | null;
  geometrija: "poligon" | "linija" | "tocka" | "tablica";
  azurnost: string;
  frekvencija_sink: string | null;
  ckan_url: string | null;
  paket_id: string | null;
  ckan_naslov: string | null;
  ckan_opis: string | null;
  ckan_izmjena: Date | null;
  licenca: string | null;
  izdavac: string | null;
  resursi: Resurs[];
  broj_zapisa: number | null;
  zadnja_sinkronizacija: Date | null;
  napomena: string | null;
  neuspjeh: number;
  boja: string;
  /** Atlasova preuzimanja (distribucije) */
  distribucije: { format: string; url: string; opis: string }[];
};

const TABLICE_S_IZVOZOM = new Set([
  "ulice",
  "predsjednici_gc",
  "predsjednici_mo",
  "clanovi_gc",
  "clanovi_mo",
  "prostori_ms",
  "isge",
]);

export function distribucijeZa(sifra: string, geometrija: KatalogSkup["geometrija"]): KatalogSkup["distribucije"] {
  const d: KatalogSkup["distribucije"] = [];
  if (geometrija !== "tablica") {
    d.push({ format: "GeoJSON", url: `/api/sloj/${sifra}`, opis: "WGS84, pojednostavljene linije/poligoni" });
    d.push({ format: "CSV", url: `/api/sloj/${sifra}?format=csv`, opis: "lon/lat + spljošteni atributi" });
  }
  if (TABLICE_S_IZVOZOM.has(sifra)) {
    d.push({ format: "CSV", url: `/api/tablica/${sifra}?format=csv`, opis: "tablica" });
    d.push({ format: "JSON", url: `/api/tablica/${sifra}`, opis: "stupci + redovi" });
  }
  if (sifra === "isge") {
    d.push({ format: "CSV", url: `/api/tablica/isge_potrosnja?format=csv`, opis: "mjesečna potrošnja, svi objekti" });
  }
  return d;
}

export async function ucitajKatalog(): Promise<KatalogSkup[]> {
  const { rows } = await pool().query<
    Omit<KatalogSkup, "boja" | "distribucije" | "geometrija" | "tema" | "resursi"> & {
      tema: string | null;
      geometrija: string | null;
      resursi: Resurs[] | null;
    }
  >(
    `SELECT s.sifra, s.naziv, s.tema, s.tip, s.geometrija, s.azurnost, s.frekvencija_sink,
            s.ckan_url, s.paket_id, s.ckan_naslov, s.ckan_opis, s.ckan_izmjena, s.licenca, s.izdavac, s.resursi,
            s.broj_zapisa, s.zadnja_sinkronizacija, s.napomena,
            (SELECT count(*)::int FROM meta.sinkronizacija z
              WHERE z.skup_sifra = s.sifra AND NOT z.uspjeh
                AND z.fetched_at > now() - interval '7 days') AS neuspjeh
     FROM meta.skup s
     WHERE s.aktivan
     ORDER BY s.naziv`
  );
  const redTema = new Map(TEME.map((t, i) => [t.sifra, i]));
  return rows
    .map((r) => {
      const tema = r.tema || "meta";
      const g = r.geometrija || "tocka";
      const geometrija: KatalogSkup["geometrija"] =
        g === "poligon" ? "poligon" : g === "linija" ? "linija" : g === "tablica" ? "tablica" : "tocka";
      return {
        ...r,
        tema,
        geometrija,
        resursi: r.resursi || [],
        boja: bojaSloja(r.sifra, tema),
        distribucije: r.zadnja_sinkronizacija ? distribucijeZa(r.sifra, geometrija) : [],
      };
    })
    .sort((a, b) => (redTema.get(a.tema) ?? 99) - (redTema.get(b.tema) ?? 99) || a.naziv.localeCompare(b.naziv, "hr"));
}

/** Atlasovi vlastiti krajnji točke (asset lista izvan skupova). */
export const API_TOCKE: { url: string; opis: string; format: string }[] = [
  { url: "/api/katalog", opis: "Ovaj katalog, strojno čitljiv (DCAT-nalik JSON)", format: "JSON" },
  { url: "/api/sloj/{sifra}", opis: "GeoJSON sloja; ?format=csv za CSV", format: "GeoJSON / CSV" },
  { url: "/api/tablica/{sifra}", opis: "Tablični skupovi; ?format=csv za CSV", format: "JSON / CSV" },
  { url: "/api/izvoz/cetvrt/{slug}", opis: "Dosje četvrti: ?format=csv ili ?format=geojson", format: "CSV / GeoJSON" },
  { url: "/api/izvoz/energija/{id}", opis: "Mjesečna potrošnja jednog ISGE objekta", format: "CSV" },
  ...TABLICE_DODATNE.map((t) => ({ url: `/api/tablica/${t.sifra}?format=csv`, opis: t.opis, format: "CSV" })),
];
