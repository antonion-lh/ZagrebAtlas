import { pool } from "@/lib/db";
import { TEME, type SlojMeta } from "@/lib/slojevi-ui";
import { ucitajMetaSlojeva } from "@/lib/slojevi";

export type CetvrtOsnovno = {
  id: number;
  naziv: string;
  slug: string;
};

export type ObjektRed = {
  id: string;
  skup: string;
  tip: string;
  naziv: string | null;
  adresa: string | null;
  mo: string | null;
  attrs: Record<string, unknown>;
};

export type Grupa = {
  sloj: SlojMeta;
  objekti: ObjektRed[];
};

export type TemaGrupa = {
  tema: { sifra: string; naziv: string };
  ukupno: number;
  grupe: Grupa[];
};

export type Kontakt = {
  ime: string;
  adresa: string | null;
  telefon: string | null;
  email: string | null;
};

export type Vijecnik = {
  prezime_ime: string;
  funkcija: string | null;
  stranka: string | null;
  opis_promjena: string | null;
  aktivan: boolean;
};

export type MoDosje = {
  id: number;
  naziv: string;
  slug: string | null;
  predsjednik: Kontakt | null;
  sjediste: { adresa: string | null; telefon: string | null; email: string | null; primanje: string | null; web: string | null } | null;
  vijece: Vijecnik[];
  prostorija: number;
  termina: number;
  objekata: number;
};

export type Uprava = {
  predsjednik: (Kontakt & { email_podrucni: string | null }) | null;
  sjediste: ObjektRed | null;
  vijece: Vijecnik[];
  podrucniUredi: ObjektRed[];
  prostorija: number;
  termina: number;
};

export type CetvrtDosje = {
  cetvrt: CetvrtOsnovno;
  mo: MoDosje[];
  uprava: Uprava;
  teme: TemaGrupa[];
  ukupnoObjekata: number;
  izvori: SlojMeta[];
};

export async function popisCetvrti(): Promise<
  (CetvrtOsnovno & { broj_mo: number; broj_objekata: number })[]
> {
  const { rows } = await pool().query<CetvrtOsnovno & { broj_mo: number; broj_objekata: number }>(
    `SELECT c.id, c.naziv, c.slug,
            (SELECT count(*)::int FROM geo.mo m WHERE m.cetvrt_id = c.id) AS broj_mo,
            (SELECT count(*)::int FROM geo.objekt o WHERE o.cetvrt_id = c.id) AS broj_objekata
     FROM geo.cetvrt c ORDER BY c.naziv`
  );
  return rows;
}

export async function dosjeCetvrti(slug: string): Promise<CetvrtDosje | null> {
  const { rows: cetvrti } = await pool().query<CetvrtOsnovno>(
    `SELECT id, naziv, slug FROM geo.cetvrt WHERE slug = $1`,
    [slug]
  );
  const cetvrt = cetvrti[0];
  if (!cetvrt) return null;

  const [
    { rows: moRedovi },
    { rows: objekti },
    slojevi,
    { rows: predsjednici },
    { rows: vijece },
    { rows: predsjedniciMo },
    { rows: vijeceMo },
    { rows: prostori },
  ] = await Promise.all([
    pool().query<{ id: number; naziv: string; slug: string | null; objekata: number }>(
      `SELECT m.id, m.naziv, m.slug,
              (SELECT count(*)::int FROM geo.objekt o WHERE o.mo_id = m.id) AS objekata
       FROM geo.mo m WHERE m.cetvrt_id = $1 ORDER BY m.naziv`,
      [cetvrt.id]
    ),
    pool().query<ObjektRed>(
      `SELECT o.id::text, o.skup_sifra AS skup, o.tip, o.naziv, o.adresa, m.naziv AS mo, o.attrs
       FROM geo.objekt o
       LEFT JOIN geo.mo m ON m.id = o.mo_id
       WHERE o.cetvrt_id = $1
          OR (
            o.skup_sifra = 'prometnice'
            AND ST_Intersects(o.geom, (SELECT geom FROM geo.cetvrt WHERE id = $1))
          )
       ORDER BY o.skup_sifra, o.naziv NULLS LAST`,
      [cetvrt.id]
    ),
    ucitajMetaSlojeva({ sveTablice: true }),
    pool().query<Kontakt & { email_podrucni: string | null }>(
      `SELECT ime, adresa, telefon, email, email_podrucni FROM uprava.predsjednik_gc WHERE cetvrt_id = $1`,
      [cetvrt.id]
    ),
    pool().query<Vijecnik>(
      `SELECT prezime_ime, funkcija, stranka, opis_promjena, aktivan
       FROM uprava.clan_vijeca WHERE razina = 'gc' AND cetvrt_id = $1
       ORDER BY aktivan DESC,
                CASE WHEN funkcija LIKE 'predsjedni%' THEN 0 WHEN funkcija LIKE 'potpredsjedni%' THEN 1 ELSE 2 END,
                prezime_ime`,
      [cetvrt.id]
    ),
    pool().query<Kontakt & { mo_id: number }>(
      `SELECT p.mo_id, p.ime, p.adresa, p.telefon, p.email
       FROM uprava.predsjednik_mo p JOIN geo.mo m ON m.id = p.mo_id WHERE m.cetvrt_id = $1`,
      [cetvrt.id]
    ),
    pool().query<Vijecnik & { mo_id: number }>(
      `SELECT v.mo_id, v.prezime_ime, v.funkcija, v.stranka, v.opis_promjena, v.aktivan
       FROM uprava.clan_vijeca v JOIN geo.mo m ON m.id = v.mo_id
       WHERE v.razina = 'mo' AND m.cetvrt_id = $1
       ORDER BY v.aktivan DESC,
                CASE WHEN v.funkcija LIKE 'predsjedni%' THEN 0 WHEN v.funkcija LIKE 'potpredsjedni%' THEN 1 ELSE 2 END,
                v.prezime_ime`,
      [cetvrt.id]
    ),
    pool().query<{ mo_id: number | null; prostorija: number; termina: number }>(
      `SELECT mo_id, count(*)::int AS prostorija, coalesce(sum(broj_termina), 0)::int AS termina
       FROM uprava.prostor_ms WHERE cetvrt_id = $1 GROUP BY mo_id`,
      [cetvrt.id]
    ),
  ]);

  const poSkupu = new Map<string, ObjektRed[]>();
  for (const o of objekti) {
    const arr = poSkupu.get(o.skup) || [];
    arr.push(o);
    poSkupu.set(o.skup, arr);
  }

  // Lokalna demokracija i energija idu u zasebne sekcije, ne u generički inventar
  const teme: TemaGrupa[] = TEME.filter((t) => t.sifra !== "demokracija" && t.sifra !== "energija")
    .map((t) => {
      const grupe: Grupa[] = slojevi
        .filter((s) => s.tema === t.sifra && (s.vrsta === "tocka" || s.vrsta === "linija"))
        .map((s) => ({ sloj: s, objekti: poSkupu.get(s.sifra) || [] }));
      return {
        tema: t,
        grupe,
        ukupno: grupe.reduce((a, g) => a + g.objekti.length, 0),
      };
    })
    .filter((t) => t.grupe.length);

  const sjedistaMo = new Map((poSkupu.get("sjedista_mo") || []).map((o) => [normKljuc(o.naziv || ""), o]));
  const predsjednikMoPo = new Map(predsjedniciMo.map((p) => [p.mo_id, p]));
  const vijeceMoPo = new Map<number, Vijecnik[]>();
  for (const v of vijeceMo) {
    const arr = vijeceMoPo.get(v.mo_id) || [];
    arr.push(v);
    vijeceMoPo.set(v.mo_id, arr);
  }
  const prostoriPo = new Map(prostori.filter((p) => p.mo_id !== null).map((p) => [p.mo_id as number, p]));

  const mo: MoDosje[] = moRedovi.map((m) => {
    const sj = sjedistaMo.get(normKljuc(m.naziv));
    const p = predsjednikMoPo.get(m.id);
    const pr = prostoriPo.get(m.id);
    return {
      id: m.id,
      naziv: m.naziv,
      slug: m.slug,
      predsjednik: p ? { ime: p.ime, adresa: p.adresa, telefon: p.telefon, email: p.email } : null,
      sjediste: sj
        ? {
            adresa: sj.adresa,
            telefon: (sj.attrs.telefon as string) || null,
            email: (sj.attrs.email as string) || null,
            web: (sj.attrs.web as string) || null,
            primanje: ((sj.attrs.ostalo as Record<string, unknown>)?.primanje_stranaka as string) || null,
          }
        : null,
      vijece: vijeceMoPo.get(m.id) || [],
      prostorija: pr?.prostorija ?? 0,
      termina: pr?.termina ?? 0,
      objekata: m.objekata,
    };
  });

  const uprava: Uprava = {
    predsjednik: predsjednici[0] || null,
    sjediste: (poSkupu.get("sjedista_gc") || [])[0] || null,
    vijece,
    podrucniUredi: poSkupu.get("podrucni_uredi") || [],
    prostorija: prostori.reduce((a, p) => a + p.prostorija, 0),
    termina: prostori.reduce((a, p) => a + p.termina, 0),
  };

  return {
    cetvrt,
    mo,
    uprava,
    teme,
    ukupnoObjekata: objekti.length,
    izvori: slojevi.filter((s) => s.sifra !== "ulice"),
  };
}

function normKljuc(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\s*(mjesni\s+odbor|mo)\s+/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
