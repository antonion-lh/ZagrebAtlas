import Link from "next/link";
import { pool } from "@/lib/db";
import { JAVNA_GRESKA, ocistiUpit } from "@/lib/odgovor";
import { ucitajCetvrtiKratko, ucitajMetaSlojeva } from "@/lib/slojevi";
import { AZURNOST, TEME, TIP_NAZIV, kratkiNaziv } from "@/lib/slojevi-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ustanove i usluge",
  description: "Škole, vrtići, zdravstvo, sport, stajališta i ostale točke iz otvorenih podataka Grada Zagreba.",
};

const PO_STRANICI = 100;

type Red = {
  id: string;
  skup: string;
  tip: string;
  naziv: string | null;
  adresa: string | null;
  cetvrt: string | null;
  cetvrt_slug: string | null;
  mo: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  vrsta: string | null;
};

type Params = { q?: string; tema?: string; skup?: string; cetvrt?: string; str?: string };

function url(p: Params, promjena: Partial<Params>): string {
  const q = new URLSearchParams();
  const spojeno = { ...p, ...promjena, str: promjena.str ?? undefined };
  for (const [k, v] of Object.entries(spojeno)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/ustanove?${s}` : "/ustanove";
}

export default async function UstanovePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const p = await searchParams;
  const q = ocistiUpit(p.q || "");
  const tema = ocistiUpit(p.tema || "", 40);
  const skup = ocistiUpit(p.skup || "", 64).replace(/[^a-z0-9_]/g, "");
  const cetvrtSlug = ocistiUpit(p.cetvrt || "", 80);
  const str = Math.min(200, Math.max(1, Number(p.str) || 1));

  const [slojevi, cetvrti] = await Promise.all([ucitajMetaSlojeva(), ucitajCetvrtiKratko()]);
  // Katalog ustanova = točkasti skupovi bez prometnica i uprave-poligona
  const skupoviUstanova = slojevi.filter(
    (s) => s.vrsta === "tocka" && s.tema !== "zivo" && s.tema !== "prostor" && s.tema !== "energija"
  );
  const dozvoljeni = new Set(skupoviUstanova.map((s) => s.sifra));

  const uvjeti: string[] = ["o.skup_sifra = ANY($1)"];
  const args: unknown[] = [
    skup && dozvoljeni.has(skup)
      ? [skup]
      : tema
        ? skupoviUstanova.filter((s) => s.tema === tema).map((s) => s.sifra)
        : [...dozvoljeni],
  ];
  if (q) {
    const tokeni = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 6);
    for (const sirovi of tokeni.length ? tokeni : [q]) {
      const t = sirovi.replace(/[%_\\]/g, "");
      if (t.length < 2) continue;
      args.push(`%${t}%`);
      uvjeti.push(
        `(o.naziv ILIKE $${args.length} OR o.adresa ILIKE $${args.length} OR o.attrs->>'vrsta' ILIKE $${args.length})`
      );
    }
  }
  if (cetvrtSlug) {
    args.push(cetvrtSlug);
    uvjeti.push(`c.slug = $${args.length}`);
  }
  const where = uvjeti.join(" AND ");

  let redovi: Red[] = [];
  let ukupno = 0;
  let greska: string | null = null;
  try {
    const [{ rows }, { rows: br }] = await Promise.all([
      pool().query<Red>(
        `SELECT o.id::text, o.skup_sifra AS skup, o.tip, o.naziv, o.adresa,
                c.naziv AS cetvrt, c.slug AS cetvrt_slug, m.naziv AS mo,
                o.attrs->>'telefon' AS telefon, o.attrs->>'email' AS email,
                o.attrs->>'web' AS web, o.attrs->>'vrsta' AS vrsta
         FROM geo.objekt o
         LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id
         LEFT JOIN geo.mo m ON m.id = o.mo_id
         WHERE ${where}
         ORDER BY o.naziv NULLS LAST, o.adresa
         LIMIT ${PO_STRANICI} OFFSET ${(str - 1) * PO_STRANICI}`,
        args
      ),
      pool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM geo.objekt o LEFT JOIN geo.cetvrt c ON c.id = o.cetvrt_id WHERE ${where}`,
        args
      ),
    ]);
    redovi = rows;
    ukupno = br[0]?.n ?? 0;
  } catch {
    greska = JAVNA_GRESKA;
  }

  const stranica = Math.ceil(ukupno / PO_STRANICI);
  const metaPoSifri = new Map(slojevi.map((s) => [s.sifra, s]));
  const temeSUstanovama = TEME.filter((t) => skupoviUstanova.some((s) => s.tema === t.sifra));

  return (
    <div className="stranica stranica-siroka">
      <h1>Ustanove i usluge</h1>
      <p className="uvod">
        Škole, vrtići, ljekarne, stajališta, sportski i zdravstveni objekti. Tražite po nazivu ili adresi;
        uz svaki red stoji izvor i koliko je podatak star.
      </p>

      <form method="get" action="/ustanove" className="filter-forma">
        <label>
          Traži (naziv, adresa, vrsta)
          <input name="q" defaultValue={q} placeholder="npr. Dubrava, ljekarna, Kvaternikov" />
        </label>
        <label>
          Tema
          <select name="tema" defaultValue={tema}>
            <option value="">Sve teme</option>
            {temeSUstanovama.map((t) => (
              <option key={t.sifra} value={t.sifra}>
                {t.naziv}
              </option>
            ))}
          </select>
        </label>
        <label>
          Četvrt
          <select name="cetvrt" defaultValue={cetvrtSlug}>
            <option value="">Cijeli grad</option>
            {cetvrti.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.naziv}
              </option>
            ))}
          </select>
        </label>
        {skup ? <input type="hidden" name="skup" value={skup} /> : null}
        <button type="submit" className="gumb">
          Traži
        </button>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", margin: "0.9rem 0 0.4rem" }}>
        {skupoviUstanova
          .filter((s) => !tema || s.tema === tema)
          .map((s) => {
            const aktivan = skup === s.sifra;
            return (
              <Link
                key={s.sifra}
                href={url(p, { skup: aktivan ? "" : s.sifra })}
                style={{
                  fontSize: "0.82rem",
                  padding: "0.15rem 0.55rem",
                  borderRadius: 999,
                  border: `1px solid ${aktivan ? s.boja : "var(--line)"}`,
                  background: aktivan ? s.boja : "var(--panel)",
                  color: aktivan ? "#fff" : "var(--ink)",
                  textDecoration: "none",
                }}
              >
                {kratkiNaziv(s.naziv)} · {s.broj}
              </Link>
            );
          })}
      </div>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.6rem 0" }}>
        {greska ? (
          <span role="alert">{greska}</span>
        ) : (
          <>
            {ukupno.toLocaleString("hr-HR")} rezultata
            {stranica > 1 ? ` · stranica ${str}/${stranica}` : ""}
            {(q || tema || skup || cetvrtSlug) && (
              <>
                {" · "}
                <Link href="/ustanove">poništi odabir</Link>
              </>
            )}
          </>
        )}
      </p>

      <div>
        <table className="tablica" style={{ fontSize: "0.92rem" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Rezultati pretrage ustanova i usluga
          </caption>
          <thead>
            <tr>
              <th scope="col">Naziv</th>
              <th scope="col">Vrsta</th>
              <th scope="col">Adresa</th>
              <th scope="col">Četvrt / MO</th>
              <th scope="col">Kontakt</th>
              <th scope="col">Izvor</th>
            </tr>
          </thead>
          <tbody>
            {redovi.length === 0 && !greska ? (
              <tr>
                <td colSpan={6}>Nema rezultata za ovaj upit. Promijenite pojam ili četvrt.</td>
              </tr>
            ) : (
              redovi.map((r) => {
              const m = metaPoSifri.get(r.skup);
              return (
                <tr key={r.id}>
                  <td data-oznaka="Naziv">{r.naziv || "—"}</td>
                  <td data-oznaka="Vrsta" style={{ color: "var(--muted)" }}>
                    {TIP_NAZIV[r.tip] || r.tip}
                    {r.vrsta && r.vrsta !== (TIP_NAZIV[r.tip] || "") ? (
                      <div style={{ fontSize: "0.82rem" }}>{r.vrsta}</div>
                    ) : null}
                  </td>
                  <td data-oznaka="Adresa">{r.adresa || "—"}</td>
                  <td data-oznaka="Četvrt / MO" style={{ whiteSpace: "nowrap" }}>
                    {r.cetvrt_slug ? <Link href={`/cetvrti/${r.cetvrt_slug}`}>{r.cetvrt}</Link> : r.cetvrt || "izvan grada"}
                    {r.mo ? <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>MO {r.mo}</div> : null}
                  </td>
                  <td data-oznaka="Kontakt" className="kontakt" style={{ fontSize: "0.86rem" }}>
                    {r.telefon ? <div>{r.telefon}</div> : null}
                    {r.email ? (
                      <div>
                        <a href={`mailto:${r.email}`}>{r.email}</a>
                      </div>
                    ) : null}
                    {r.web ? (
                      <div>
                        <a href={r.web.startsWith("http") ? r.web : `https://${r.web}`} target="_blank" rel="noreferrer">
                          stranica
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td data-oznaka="Izvor" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                    {m ? (
                      <>
                        <div style={{ color: "var(--muted)" }}>{kratkiNaziv(m.naziv)}</div>
                        <span className={`azurnost azurnost-${m.azurnost}`}>{AZURNOST[m.azurnost] || m.azurnost}</span>
                      </>
                    ) : (
                      r.skup
                    )}
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>

      {stranica > 1 ? (
        <p style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.92rem" }}>
          {str > 1 ? <Link href={url(p, { str: String(str - 1) })}>← Prethodna</Link> : null}
          {str < stranica ? <Link href={url(p, { str: String(str + 1) })}>Sljedeća →</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
