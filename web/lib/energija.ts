import { pool } from "@/lib/db";
import { ocistiUpit } from "@/lib/odgovor";

export type EnergijaObjekt = {
  id: number;
  naziv: string;
  adresa: string | null;
  mjesto: string | null;
  cetvrt: string | null;
  cetvrt_slug: string | null;
  mo: string | null;
  geo_objekt_id: string | null;
  geo_skup: string | null;
  geo_naziv: string | null;
  metoda: string | null;
  pouzdanost: string | null;
  ima_geom: boolean;
  broj_mjerila: number;
  energenti: string[];
  od: string | null;
  do: string | null;
  kwh_ukupno: number | null;
  eur_ukupno: number | null;
};

export type GodinaEnergent = { godina: number; energent: string; kwh: number; eur: number; kolicina: number };
export type Mjesec = { godina: number; mjesec: number; energent: string; kwh: number; eur: number; kolicina: number };

export type EnergijaPregled = {
  poGodini: { godina: number; kwh: number; eur: number; objekata: number; puna: boolean }[];
  poEnergentu: GodinaEnergent[];
  poCetvrti: {
    id: number;
    naziv: string;
    slug: string;
    objekata: number;
    spojeno: number;
    kwh: number;
    eur: number;
  }[];
  zadnjaPunaGodina: number;
  razdoblje: { od: string; do: string } | null;
  ukupno: { objekata: number; spojeno: number; sCetvrti: number };
};

/** Zadnja godina koja u podacima ima svih 12 mjeseci. */
async function zadnjaPuna(): Promise<{ godina: number; od: string; do: string } | null> {
  const { rows } = await pool().query<{ godina: number; od: string; do: string }>(
    `WITH g AS (SELECT godina, count(DISTINCT mjesec) AS m FROM energy.potrosnja GROUP BY godina),
          r AS (SELECT min(godina * 100 + mjesec) AS od, max(godina * 100 + mjesec) AS "do" FROM energy.potrosnja)
     SELECT (SELECT max(godina) FROM g WHERE m = 12) AS godina,
            to_char(make_date(od / 100, od % 100, 1), 'MM/YYYY') AS od,
            to_char(make_date("do" / 100, "do" % 100, 1), 'MM/YYYY') AS "do"
     FROM r`
  );
  return rows[0]?.godina ? rows[0] : null;
}

export async function energijaPregled(): Promise<EnergijaPregled | null> {
  const zp = await zadnjaPuna();
  if (!zp) return null;
  const [{ rows: poGodini }, { rows: poEnergentu }, { rows: poCetvrti }, { rows: uk }] = await Promise.all([
    pool().query<{ godina: number; kwh: number; eur: number; objekata: number; mjeseci: number }>(
      `SELECT godina, sum(kwh)::float8 AS kwh, sum(eur)::float8 AS eur,
              count(DISTINCT objekt_id)::int AS objekata, count(DISTINCT mjesec)::int AS mjeseci
       FROM energy.potrosnja GROUP BY godina ORDER BY godina`
    ),
    pool().query<GodinaEnergent>(
      `SELECT godina, energent, sum(kwh)::float8 AS kwh, sum(eur)::float8 AS eur, sum(kolicina)::float8 AS kolicina
       FROM energy.potrosnja GROUP BY godina, energent ORDER BY godina, kwh DESC`
    ),
    pool().query<EnergijaPregled["poCetvrti"][number]>(
      `SELECT c.id, c.naziv, c.slug,
              count(e.id)::int AS objekata,
              count(e.geo_objekt_id)::int AS spojeno,
              coalesce(sum(p.kwh), 0)::float8 AS kwh,
              coalesce(sum(p.eur), 0)::float8 AS eur
       FROM geo.cetvrt c
       LEFT JOIN energy.objekt e ON e.cetvrt_id = c.id
       LEFT JOIN LATERAL (
         SELECT sum(kwh) AS kwh, sum(eur) AS eur FROM energy.potrosnja p WHERE p.objekt_id = e.id AND p.godina = $1
       ) p ON true
       GROUP BY c.id, c.naziv, c.slug ORDER BY c.naziv`,
      [zp.godina]
    ),
    pool().query<{ objekata: number; spojeno: number; s_cetvrti: number }>(
      `SELECT count(*)::int AS objekata, count(geo_objekt_id)::int AS spojeno, count(cetvrt_id)::int AS s_cetvrti
       FROM energy.objekt`
    ),
  ]);
  return {
    poGodini: poGodini.map((g) => ({ ...g, puna: g.mjeseci === 12 })),
    poEnergentu,
    poCetvrti,
    zadnjaPunaGodina: zp.godina,
    razdoblje: { od: zp.od, do: zp.do },
    ukupno: { objekata: uk[0].objekata, spojeno: uk[0].spojeno, sCetvrti: uk[0].s_cetvrti },
  };
}

const OBJEKT_SELECT = `
  SELECT e.id, e.naziv, e.adresa, e.mjesto, c.naziv AS cetvrt, c.slug AS cetvrt_slug, m.naziv AS mo,
         e.geo_objekt_id::text, e.geo_skup, e.geo_naziv, e.metoda, e.pouzdanost, e.geom IS NOT NULL AS ima_geom,
         e.broj_mjerila, e.energenti, to_char(e.od, 'MM/YYYY') AS od, to_char(e."do", 'MM/YYYY') AS "do",
         e.kwh_ukupno::float8, e.eur_ukupno::float8
  FROM energy.objekt e
  LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id
  LEFT JOIN geo.mo m ON m.id = e.mo_id`;

export async function energijaObjekt(id: number): Promise<{
  objekt: EnergijaObjekt;
  poGodini: GodinaEnergent[];
  mjeseci: Mjesec[];
} | null> {
  const { rows } = await pool().query<EnergijaObjekt>(`${OBJEKT_SELECT} WHERE e.id = $1`, [id]);
  const objekt = rows[0];
  if (!objekt) return null;
  const [{ rows: poGodini }, { rows: mjeseci }] = await Promise.all([
    pool().query<GodinaEnergent>(
      `SELECT godina, energent, sum(kwh)::float8 AS kwh, sum(eur)::float8 AS eur, sum(kolicina)::float8 AS kolicina
       FROM energy.potrosnja WHERE objekt_id = $1 GROUP BY godina, energent ORDER BY godina, energent`,
      [id]
    ),
    pool().query<Mjesec>(
      `SELECT godina, mjesec, energent, kwh::float8, eur::float8, kolicina::float8
       FROM energy.potrosnja WHERE objekt_id = $1 ORDER BY godina, mjesec, energent`,
      [id]
    ),
  ]);
  return { objekt, poGodini, mjeseci };
}

export type EnergijaFilter = {
  q?: string;
  cetvrt?: string;
  energent?: string;
  spojeni?: "da" | "ne" | "";
  sort?: "kwh" | "eur" | "naziv";
  str?: number;
  poStranici?: number;
};

export async function energijaObjekti(
  f: EnergijaFilter,
  godina: number
): Promise<{ redovi: (EnergijaObjekt & { kwh_god: number | null; eur_god: number | null })[]; ukupno: number }> {
  const uvjeti: string[] = [];
  const args: unknown[] = [godina];
  if (f.q) {
    const tokeni = ocistiUpit(f.q)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 6);
    for (const sirovi of tokeni.length ? tokeni : [ocistiUpit(f.q)]) {
      const t = sirovi.replace(/[%_\\]/g, "");
      if (t.length < 2) continue;
      args.push(`%${t}%`);
      uvjeti.push(`(e.naziv ILIKE $${args.length} OR e.adresa ILIKE $${args.length})`);
    }
  }
  if (f.cetvrt) {
    args.push(f.cetvrt);
    uvjeti.push(`c.slug = $${args.length}`);
  }
  if (f.energent) {
    args.push(f.energent);
    uvjeti.push(`$${args.length} = ANY(e.energenti)`);
  }
  if (f.spojeni === "da") uvjeti.push(`e.geo_objekt_id IS NOT NULL`);
  if (f.spojeni === "ne") uvjeti.push(`e.geo_objekt_id IS NULL`);
  const where = uvjeti.length ? `WHERE ${uvjeti.join(" AND ")}` : "";
  const sort =
    f.sort === "naziv" ? "e.naziv" : f.sort === "eur" ? "g.eur DESC NULLS LAST, e.naziv" : "g.kwh DESC NULLS LAST, e.naziv";
  const po = f.poStranici ?? 50;
  const off = ((f.str ?? 1) - 1) * po;

  const [{ rows }, { rows: br }] = await Promise.all([
    pool().query<EnergijaObjekt & { kwh_god: number | null; eur_god: number | null }>(
      `${OBJEKT_SELECT.replace("SELECT e.id,", "SELECT g.kwh::float8 AS kwh_god, g.eur::float8 AS eur_god, e.id,")}
       LEFT JOIN LATERAL (
         SELECT sum(kwh) AS kwh, sum(eur) AS eur FROM energy.potrosnja p WHERE p.objekt_id = e.id AND p.godina = $1
       ) g ON true
       ${where} ORDER BY ${sort} LIMIT ${po} OFFSET ${off}`,
      args
    ),
    pool().query<{ n: number }>(
      // $1 (godina) ne ulazi u WHERE; da se ne bi bunio broj parametara, vežemo ga kroz no-op uvjet
      `SELECT count(*)::int AS n FROM energy.objekt e LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id
       ${where ? `${where} AND` : "WHERE"} $1::int IS NOT NULL`,
      args
    ),
  ]);
  return { redovi: rows, ukupno: br[0]?.n ?? 0 };
}

export async function energijaCetvrti(cetvrtId: number): Promise<{
  godina: number;
  objekata: number;
  spojeno: number;
  kwh: number;
  eur: number;
  poEnergentu: { energent: string; kwh: number; eur: number }[];
  top: { id: number; naziv: string; adresa: string | null; kwh: number; eur: number; energenti: string[] }[];
} | null> {
  const zp = await zadnjaPuna();
  if (!zp) return null;
  const [{ rows: uk }, { rows: poEnergentu }, { rows: top }] = await Promise.all([
    pool().query<{ objekata: number; spojeno: number; kwh: number; eur: number }>(
      `SELECT count(DISTINCT e.id)::int AS objekata, count(DISTINCT e.geo_objekt_id)::int AS spojeno,
              coalesce(sum(p.kwh), 0)::float8 AS kwh, coalesce(sum(p.eur), 0)::float8 AS eur
       FROM energy.objekt e
       LEFT JOIN energy.potrosnja p ON p.objekt_id = e.id AND p.godina = $2
       WHERE e.cetvrt_id = $1`,
      [cetvrtId, zp.godina]
    ),
    pool().query<{ energent: string; kwh: number; eur: number }>(
      `SELECT p.energent, sum(p.kwh)::float8 AS kwh, sum(p.eur)::float8 AS eur
       FROM energy.potrosnja p JOIN energy.objekt e ON e.id = p.objekt_id
       WHERE e.cetvrt_id = $1 AND p.godina = $2 GROUP BY p.energent ORDER BY kwh DESC`,
      [cetvrtId, zp.godina]
    ),
    pool().query<{ id: number; naziv: string; adresa: string | null; kwh: number; eur: number; energenti: string[] }>(
      `SELECT e.id, e.naziv, e.adresa, e.energenti,
              coalesce(sum(p.kwh), 0)::float8 AS kwh, coalesce(sum(p.eur), 0)::float8 AS eur
       FROM energy.objekt e
       LEFT JOIN energy.potrosnja p ON p.objekt_id = e.id AND p.godina = $2
       WHERE e.cetvrt_id = $1
       GROUP BY e.id ORDER BY kwh DESC LIMIT 10`,
      [cetvrtId, zp.godina]
    ),
  ]);
  return { godina: zp.godina, ...uk[0], poEnergentu, top };
}

export async function energijaEnergenti(): Promise<string[]> {
  const { rows } = await pool().query<{ energent: string }>(
    `SELECT energent FROM energy.potrosnja GROUP BY energent ORDER BY sum(kwh) DESC`
  );
  return rows.map((r) => r.energent);
}

export function fmtKwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString("hr-HR", { maximumFractionDigits: 2 })} TWh`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("hr-HR", { maximumFractionDigits: 1 })} GWh`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString("hr-HR", { maximumFractionDigits: 0 })} MWh`;
  return `${v.toLocaleString("hr-HR", { maximumFractionDigits: 0 })} kWh`;
}

export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("hr-HR", { maximumFractionDigits: 2 })} mil. €`;
  return `${v.toLocaleString("hr-HR", { maximumFractionDigits: 0 })} €`;
}

export const ENERGENT_BOJA: Record<string, string> = {
  "Električna energija": "#f59e0b",
  "Prirodni plin": "#2563eb",
  Toplina: "#dc2626",
  Voda: "#0891b2",
  "Loživo ulje ekstra lako": "#78350f",
  "Loživo ulje lako": "#92400e",
  Peleti: "#65a30d",
  UNP: "#7c3aed",
  "Plin u boci": "#6d28d9",
  Para: "#be123c",
};

export const VODA = "Voda";

export type KrizaGodina = { godina: number; kwh: number; eur: number; objekata?: number };
export type SezonaRed = {
  sezona: "zima" | "ljeto";
  mjeseci: number;
  kwh: number;
  eur: number;
  kwh_po_mjesecu: number;
};
export type Kohorta = {
  razina: "cetvrt" | "grad";
  n: number;
  namjena: string | null;
  godina: number;
  medijan_kwh: number | null;
  medijan_eur: number | null;
  objekt_kwh: number | null;
  objekt_eur: number | null;
};

export async function energijaAnalitika(id: number): Promise<{
  krizaObjekt: KrizaGodina[];
  krizaKohorta: KrizaGodina[];
  sezona: SezonaRed[];
  kohorta: Kohorta | null;
} | null> {
  const { rows: meta } = await pool().query<{ geo_skup: string | null; cetvrt_id: number | null }>(
    `SELECT geo_skup, cetvrt_id FROM energy.objekt WHERE id = $1`,
    [id]
  );
  if (!meta.length) return null;
  const { geo_skup, cetvrt_id } = meta[0];

  const { rows: krizaObjekt } = await pool().query<KrizaGodina>(
    `SELECT godina,
            coalesce(sum(kwh) FILTER (WHERE energent <> $2), 0)::float8 AS kwh,
            coalesce(sum(eur), 0)::float8 AS eur
     FROM energy.potrosnja WHERE objekt_id = $1 AND godina BETWEEN 2019 AND 2023
     GROUP BY godina ORDER BY godina`,
    [id, VODA]
  );

  const { rows: pune } = await pool().query<{ godina: number }>(
    `SELECT godina FROM energy.potrosnja WHERE objekt_id = $1 GROUP BY godina HAVING count(DISTINCT mjesec) = 12`,
    [id]
  );
  const puneGod = pune.map((p) => p.godina);

  let sezona: SezonaRed[] = [];
  if (puneGod.length) {
    const { rows } = await pool().query<SezonaRed>(
      `SELECT CASE WHEN mjesec IN (10,11,12,1,2,3) THEN 'zima' ELSE 'ljeto' END AS sezona,
              count(*)::int AS mjeseci,
              coalesce(sum(kwh), 0)::float8 AS kwh,
              coalesce(sum(eur), 0)::float8 AS eur,
              coalesce(avg(kwh), 0)::float8 AS kwh_po_mjesecu
       FROM (
         SELECT godina, mjesec,
                coalesce(sum(kwh) FILTER (WHERE energent <> $2), 0)::float8 AS kwh,
                coalesce(sum(eur), 0)::float8 AS eur
         FROM energy.potrosnja
         WHERE objekt_id = $1 AND godina = ANY($3)
         GROUP BY godina, mjesec
       ) m
       GROUP BY 1`,
      [id, VODA, puneGod]
    );
    sezona = rows;
  }

  let krizaKohorta: KrizaGodina[] = [];
  if (geo_skup) {
    const { rows } = await pool().query<KrizaGodina>(
      `WITH po_obj AS (
         SELECT e.id, p.godina,
                coalesce(sum(p.kwh) FILTER (WHERE p.energent <> $2), 0)::float8 AS kwh,
                coalesce(sum(p.eur), 0)::float8 AS eur
         FROM energy.objekt e
         JOIN energy.potrosnja p ON p.objekt_id = e.id
         WHERE e.geo_skup = $1 AND e.id <> $3 AND p.godina BETWEEN 2019 AND 2023
         GROUP BY e.id, p.godina
       )
       SELECT godina,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY kwh)::float8 AS kwh,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY eur)::float8 AS eur,
              count(*)::int AS objekata
       FROM po_obj GROUP BY godina ORDER BY godina`,
      [geo_skup, VODA, id]
    );
    krizaKohorta = rows;
  }

  const zadnjaPuna = puneGod.length ? Math.max(...puneGod) : null;
  let kohorta: Kohorta | null = null;
  if (zadnjaPuna) {
    const { rows: vlastiti } = await pool().query<{ kwh: number; eur: number }>(
      `SELECT coalesce(sum(kwh) FILTER (WHERE energent <> $2), 0)::float8 AS kwh,
              coalesce(sum(eur), 0)::float8 AS eur
       FROM energy.potrosnja WHERE objekt_id = $1 AND godina = $3`,
      [id, VODA, zadnjaPuna]
    );
    const objekt_kwh = vlastiti[0]?.kwh ?? null;
    const objekt_eur = vlastiti[0]?.eur ?? null;

    async function medijan(gdje: string, args: unknown[]): Promise<{ n: number; kwh: number | null; eur: number | null }> {
      const { rows } = await pool().query<{ n: number; kwh: number | null; eur: number | null }>(
        `SELECT count(*)::int AS n,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY kwh)::float8 AS kwh,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY eur)::float8 AS eur
         FROM (
           SELECT e.id,
                  coalesce(sum(p.kwh) FILTER (WHERE p.energent <> $1), 0)::float8 AS kwh,
                  coalesce(sum(p.eur), 0)::float8 AS eur
           FROM energy.objekt e
           JOIN energy.potrosnja p ON p.objekt_id = e.id AND p.godina = $2
           WHERE e.id <> $3 ${gdje}
           GROUP BY e.id
         ) t`,
        [VODA, zadnjaPuna, id, ...args]
      );
      return rows[0] || { n: 0, kwh: null, eur: null };
    }

    let razina: Kohorta["razina"] = "cetvrt";
    let m = { n: 0, kwh: null as number | null, eur: null as number | null };
    if (geo_skup && cetvrt_id) {
      m = await medijan("AND e.geo_skup = $4 AND e.cetvrt_id = $5", [geo_skup, cetvrt_id]);
    }
    if (m.n < 5 && geo_skup) {
      razina = "grad";
      m = await medijan("AND e.geo_skup = $4", [geo_skup]);
    } else if (m.n < 5 && cetvrt_id) {
      razina = "cetvrt";
      m = await medijan("AND e.cetvrt_id = $4", [cetvrt_id]);
    }
    if (m.n >= 2) {
      kohorta = {
        razina,
        n: m.n,
        namjena: geo_skup,
        godina: zadnjaPuna,
        medijan_kwh: m.kwh,
        medijan_eur: m.eur,
        objekt_kwh,
        objekt_eur,
      };
    }
  }

  return { krizaObjekt, krizaKohorta, sezona, kohorta };
}

export async function energijaKrizaGrad(): Promise<KrizaGodina[]> {
  const { rows } = await pool().query<KrizaGodina>(
    `SELECT godina,
            coalesce(sum(kwh) FILTER (WHERE energent <> $1), 0)::float8 AS kwh,
            coalesce(sum(eur), 0)::float8 AS eur
     FROM energy.potrosnja WHERE godina BETWEEN 2019 AND 2023
     GROUP BY godina ORDER BY godina`,
    [VODA]
  );
  return rows;
}

export function bojaEnergenta(e: string): string {
  return ENERGENT_BOJA[e] || "#6b7280";
}
