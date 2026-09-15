import Link from "next/link";
import { pool } from "@/lib/db";
import { ucitajCetvrtiKratko, ucitajMetaSlojeva } from "@/lib/slojevi";
import { AZURNOST, TEME, TIP_NAZIV, kratkiNaziv } from "@/lib/slojevi-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Katalog ustanova i usluga",
  description: "Pretraživ popis ustanova, usluga, komunalne opreme i stajališta iz otvorenih podataka Grada Zagreba.",
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
  const q = (p.q || "").trim();
  const tema = p.tema || "";
  const skup = p.skup || "";
  const cetvrtSlug = p.cetvrt || "";
  const str = Math.max(1, Number(p.str) || 1);

  const [slojevi, cetvrti] = await Promise.all([ucitajMetaSlojeva(), ucitajCetvrtiKratko()]);
  // Katalog ustanova = točkasti skupovi bez prometnica i uprave-poligona
  const skupoviUstanova = slojevi.filter(
    (s) => s.vrsta === "tocka" && s.tema !== "zivo" && s.tema !== "prostor"
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
    args.push(`%${q}%`);
    uvjeti.push(
      `(o.naziv ILIKE $${args.length} OR o.adresa ILIKE $${args.length} OR o.attrs->>'vrsta' ILIKE $${args.length})`
    );
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
  } catch (e) {
    greska = e instanceof Error ? e.message : "Greška baze";
  }

  const stranica = Math.ceil(ukupno / PO_STRANICI);
  const metaPoSifri = new Map(slojevi.map((s) => [s.sifra, s]));
  const temeSUstanovama = TEME.filter((t) => skupoviUstanova.some((s) => s.tema === t.sifra));

  return (
    <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <h1 style={{ marginTop: 0 }}>Katalog ustanova i usluga</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Pretraživ popis svih točkastih objekata iz učitanih otvorenih skupova — ustanove, usluge,
        komunalna oprema, stajališta. Svaki red nosi izvor i oznaku ažurnosti.
      </p>

      <form method="get" action="/ustanove" className="filter-forma">
        <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          Traži (naziv, adresa, vrsta)
          <input
            name="q"
            defaultValue={q}
            placeholder="npr. Dubrava, ljekarna, Kvaternikov"
            style={{ padding: "0.45rem 0.6rem", font: "inherit", border: "1px solid var(--line)", borderRadius: 4 }}
          />
        </label>
        <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          Tema
          <select name="tema" defaultValue={tema} style={{ padding: "0.45rem 0.5rem", font: "inherit", border: "1px solid var(--line)", borderRadius: 4, background: "#fff" }}>
            <option value="">Sve teme</option>
            {temeSUstanovama.map((t) => (
              <option key={t.sifra} value={t.sifra}>
                {t.naziv}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          Četvrt
          <select name="cetvrt" defaultValue={cetvrtSlug} style={{ padding: "0.45rem 0.5rem", font: "inherit", border: "1px solid var(--line)", borderRadius: 4, background: "#fff" }}>
            <option value="">Cijeli grad</option>
            {cetvrti.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.naziv}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ padding: "0.5rem 0.9rem", font: "inherit", border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
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
                <Link href="/ustanove">poništi filtre</Link>
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
            {redovi.map((r) => {
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
                          web
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
            })}
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
