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
  "asset_lista",
  "zrak_2023",
]);

export function distribucijeZa(sifra: string, geometrija: KatalogSkup["geometrija"]): KatalogSkup["distribucije"] {
  const d: KatalogSkup["distribucije"] = [];
  if (geometrija !== "tablica") {
    d.push({ format: "GeoJSON", url: `/api/sloj/${sifra}`, opis: "WGS84, pojednostavljene linije/poligoni" });
    d.push({ format: "CSV", url: `/api/sloj/${sifra}?format=csv`, opis: "lon/lat + spljošteni atributi" });
  }
  if (TABLICE_S_IZVOZOM.has(sifra)) {
    d.push({ format: "CSV", url: `/api/tablica/${sifra}?format=csv`, opis: "tablica" });
    if (sifra !== "isge") {
      d.push({ format: "JSON", url: `/api/tablica/${sifra}`, opis: "stupci + redovi" });
    }
  }
  if (sifra === "isge") {
    d.push({ format: "JSON", url: `/api/tablica/isge`, opis: "popis objekata" });
    d.push({ format: "CSV", url: `/api/tablica/isge_potrosnja?format=csv`, opis: "mjesečna potrošnja, svi objekti (samo CSV)" });
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

/** Atlasove putanje za preuzimanje (izvan pojedinačnih skupova). */
export const API_TOCKE: { url: string; opis: string; format: string }[] = [
  { url: "/api/katalog", opis: "Ovaj katalog, strojno čitljiv (JSON u duhu DCAT-a)", format: "JSON" },
  { url: "/api/trazi?q=", opis: "Pretraga četvrti, mjesnih odbora i objekata (JSON)", format: "JSON" },
  { url: "/api/sloj/{sifra}", opis: "GeoJSON sloja; ?format=csv za CSV", format: "GeoJSON / CSV" },
  { url: "/api/tablica/{sifra}", opis: "Tablični skupovi; ?format=csv za CSV", format: "JSON / CSV" },
  { url: "/api/izvoz/cetvrt/{slug}", opis: "Dosje četvrti: ?format=csv ili ?format=geojson", format: "CSV / GeoJSON" },
  { url: "/api/izvoz/energija/{id}", opis: "Mjesečna potrošnja jednog ISGE objekta", format: "CSV" },
  { url: "/api/blizina?lon=&lat=", opis: "Točke u krugu (JSON)", format: "JSON" },
  { url: "/api/presjek?id=", opis: "Presjek zatvaranja s biciklističkim stazama i pješačkim zonama", format: "JSON" },
  ...TABLICE_DODATNE.map((t) => ({
    url: `/api/tablica/${t.sifra}?format=csv`,
    opis: t.opis,
    format: "CSV",
  })),
];

export type PortalRed = {
  naziv: string;
  opis: string | null;
  ucestalost: string | null;
  poveznica: string | null;
  uvjeti: string | null;
  paket_id: string | null;
  atlas_sifra: string | null;
  stanje: "u_atlasu" | "nije_u_atlasu" | "nije_ckan";
};

export type IsgeSpoj = {
  objekata: number;
  spojeno: number;
  visoka: number;
  srednja: number;
  niska: number;
  napomena: string | null;
};

export async function ucitajPortalUsporedba(): Promise<PortalRed[]> {
  const { rows } = await pool().query<PortalRed>(
    `SELECT naziv, opis, ucestalost, poveznica, uvjeti, paket_id, atlas_sifra, stanje
     FROM meta.portal_skup
     ORDER BY CASE stanje WHEN 'nije_u_atlasu' THEN 0 WHEN 'u_atlasu' THEN 1 ELSE 2 END, naziv`
  );
  return rows;
}

export async function ucitajIsgeSpoj(): Promise<IsgeSpoj | null> {
  try {
    const [{ rows }, { rows: nap }] = await Promise.all([
      pool().query<{ objekata: number; spojeno: number; visoka: number; srednja: number; niska: number }>(
        `SELECT count(*)::int AS objekata,
                count(geo_objekt_id)::int AS spojeno,
                count(*) FILTER (WHERE pouzdanost = 'visoka')::int AS visoka,
                count(*) FILTER (WHERE pouzdanost = 'srednja')::int AS srednja,
                count(*) FILTER (WHERE pouzdanost = 'niska')::int AS niska
         FROM energy.objekt`
      ),
      pool().query<{ napomena: string | null }>(
        `SELECT napomena FROM meta.skup WHERE sifra = 'isge'`
      ),
    ]);
    if (!rows[0]?.objekata) return null;
    return { ...rows[0], napomena: nap[0]?.napomena ?? null };
  } catch {
    return null;
  }
}

/** Tier B/C i namjerno izvan opsega — javni backlog kataloga E. */
export const BACKLOG: { naziv: string; razlog: string }[] = [
  {
    naziv: "Zborna mjesta civilne zaštite",
    razlog: "Tier B u v1.3; nije obveza prve inačice ako nestane sati.",
  },
  {
    naziv: "Evakuacijske površine",
    razlog: "Tier B.",
  },
  {
    naziv: "Brownfield lokacije",
    razlog: "Tier B.",
  },
  {
    naziv: "GTFS u stvarnom vremenu",
    razlog: "Namjerno izvan opsega. U Atlasu je statični raspored (rute).",
  },
  {
    naziv: "iTransparentnost (proračun, isplate, OIB)",
    razlog: "Zaseban servis; Atlas ga ne ingestira. Poveznica ispod na transparentnost.zagreb.hr.",
  },
  {
    naziv: "kWh/m², booking MO, chatbot, Nextbike, ZG3D",
    razlog: "Namjerno izvan opsega ugovora v1.3.",
  },
];
