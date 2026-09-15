import Link from "next/link";
import { notFound } from "next/navigation";
import { SlozeniStupci } from "@/components/EnergijaGraf";
import { bojaEnergenta, energijaObjekt, fmtEur, fmtKwh, VODA } from "@/lib/energija";
import { TIP_NAZIV, kratkiNaziv } from "@/lib/slojevi-ui";
import { ucitajMetaSlojeva } from "@/lib/slojevi";

export const dynamic = "force-dynamic";

const MJ = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  const d = Number.isInteger(n) && n > 0 ? await energijaObjekt(n).catch(() => null) : null;
  return {
    title: d ? `${d.objekt.naziv} — energija` : "Objekt nije pronađen",
    description: d ? `Potrošnja i trošak energije: ${d.objekt.naziv}, ${d.objekt.adresa || ""} (ISGE).` : undefined,
  };
}

export default async function EnergijaObjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const [d, slojevi] = await Promise.all([energijaObjekt(n), ucitajMetaSlojeva()]);
  if (!d) notFound();
  const { objekt: o, poGodini, mjeseci } = d;

  const godine = Array.from(new Set(poGodini.map((x) => x.godina))).sort();
  const energenti = Array.from(new Set(poGodini.map((x) => x.energent)));
  const zadnjaGodina = godine[godine.length - 1];
  const mjeseciZadnje = new Set(mjeseci.filter((m) => m.godina === zadnjaGodina).map((m) => m.mjesec));
  const zadnjaPuna = mjeseciZadnje.size === 12 ? zadnjaGodina : godine[godine.length - 2];

  // zadnjih 36 mjeseci
  const kljucevi = Array.from(new Set(mjeseci.map((m) => m.godina * 100 + m.mjesec))).sort().slice(-36);
  const stupciMjeseci = kljucevi.map((k) => {
    const g = Math.floor(k / 100);
    const m = k % 100;
    return {
      oznaka: `${MJ[m - 1]} ${g}`,
      kratka: m === 1 ? String(g) : MJ[m - 1],
      dijelovi: mjeseci.filter((x) => x.godina === g && x.mjesec === m).map((x) => ({ energent: x.energent, v: x.kwh })),
    };
  });
  const stupciGodine = godine.map((g) => ({
    oznaka: g === zadnjaGodina && mjeseciZadnje.size < 12 ? `${g}*` : String(g),
    dijelovi: poGodini.filter((x) => x.godina === g).map((x) => ({ energent: x.energent, v: x.kwh })),
  }));
  const geoMeta = o.geo_skup ? slojevi.find((s) => s.sifra === o.geo_skup) : null;

  return (
    <div className="stranica stranica-siroka">
      <p className="mrvice">
        <Link href="/energija">Energija gradskih objekata</Link>
      </p>
      <h1 style={{ marginTop: 0, marginBottom: "0.3rem" }}>{o.naziv}</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, lineHeight: 1.5 }}>
        {[o.adresa, o.mjesto].filter(Boolean).join(", ")}
        {o.cetvrt_slug ? (
          <>
            {" · "}
            <Link href={`/cetvrti/${o.cetvrt_slug}#energija`}>{o.cetvrt}</Link>
          </>
        ) : null}
        {o.mo ? ` · MO ${o.mo}` : null}
        {" · "}
        {o.od} – {o.do} · {o.broj_mjerila} mjernih mjesta
      </p>

      <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "0.7rem 0.9rem", background: "var(--panel)", fontSize: "0.9rem", lineHeight: 1.55 }}>
        {o.geo_objekt_id ? (
          <>
            Spojen na registar: <strong>{o.geo_naziv}</strong>
            {geoMeta ? ` (${kratkiNaziv(geoMeta.naziv)}${geoMeta.tip ? `, ${TIP_NAZIV[geoMeta.tip] || geoMeta.tip}` : ""})` : null}
            {" · "}
            pouzdanost <span className={`azurnost pouzdanost-${o.pouzdanost}`}>{o.pouzdanost}</span> (metoda: {o.metoda})
            {o.ima_geom && o.cetvrt_slug ? (
              <>
                {" · "}
                <a href={`/?cetvrt=${o.cetvrt_slug}&sloj=isge`}>na karti</a>
              </>
            ) : null}
          </>
        ) : (
          <>
            Nije spojen na registar ustanova (adresa/naziv se ne poklapaju ni s jednim učitanim skupom), pa
            nije na karti.{o.metoda ? ` Četvrt je utvrđena iz: ${o.metoda}.` : ""}
          </>
        )}
      </div>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>Po godinama</h2>
        <SlozeniStupci stupci={stupciGodine} naslov="kWh po godini (* nepotpuna godina)" visina={170} />
        <div style={{ overflowX: "auto", marginTop: "0.8rem" }} tabIndex={0} role="region" aria-label="Godišnja tablica po energentu">
          <table style={{ borderCollapse: "collapse", fontSize: "0.88rem", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
                <th style={{ padding: "0.35rem 0.5rem" }}>Energent</th>
                {godine.map((g) => (
                  <th key={g} style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>
                    {g}
                    {g === zadnjaGodina && mjeseciZadnje.size < 12 ? "*" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {energenti.map((e) => (
                <tr key={e} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "0.35rem 0.5rem" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, background: bojaEnergenta(e), borderRadius: 2, marginRight: 6 }} />
                    {e}
                    {e === VODA ? <span style={{ color: "var(--muted)" }}> (m³)</span> : null}
                  </td>
                  {godine.map((g) => {
                    const x = poGodini.find((y) => y.godina === g && y.energent === e);
                    return (
                      <td key={g} style={{ padding: "0.35rem 0.5rem", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {x ? (
                          <>
                            {e === VODA ? Math.round(x.kolicina).toLocaleString("hr-HR") : fmtKwh(x.kwh)}
                            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{fmtEur(x.eur)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td style={{ padding: "0.35rem 0.5rem" }}>Ukupno (bez vode) / trošak</td>
                {godine.map((g) => {
                  const xs = poGodini.filter((y) => y.godina === g);
                  return (
                    <td key={g} style={{ padding: "0.35rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtKwh(xs.filter((y) => y.energent !== VODA).reduce((a, y) => a + y.kwh, 0))}
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 400 }}>
                        {fmtEur(xs.reduce((a, y) => a + y.eur, 0))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>Po mjesecima</h2>
        <SlozeniStupci stupci={stupciMjeseci} naslov={`kWh po mjesecu, zadnjih ${kljucevi.length} mjeseci`} visina={180} />
        <details style={{ marginTop: "0.6rem" }}>
          <summary style={{ cursor: "pointer" }}>Tablica svih mjeseci ({mjeseci.length} redaka)</summary>
          <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tablica svih mjeseci">
            <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", marginTop: "0.4rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Mjesec</th>
                  <th style={{ padding: "0.3rem 0.5rem" }}>Energent</th>
                  <th style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>Količina</th>
                  <th style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>kWh</th>
                  <th style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>€</th>
                </tr>
              </thead>
              <tbody>
                {mjeseci.map((m) => (
                  <tr key={`${m.godina}-${m.mjesec}-${m.energent}`} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "0.3rem 0.5rem", whiteSpace: "nowrap" }}>
                      {String(m.mjesec).padStart(2, "0")}/{m.godina}
                    </td>
                    <td style={{ padding: "0.3rem 0.5rem" }}>{m.energent}</td>
                    <td style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>{m.kolicina.toLocaleString("hr-HR", { maximumFractionDigits: 1 })}</td>
                    <td style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>{m.kwh.toLocaleString("hr-HR", { maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: "0.3rem 0.5rem", textAlign: "right" }}>{m.eur.toLocaleString("hr-HR", { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <p style={{ marginTop: "1.5rem", fontSize: "0.88rem" }}>
        <a href={`/api/izvoz/energija/${o.id}`}>Preuzmi CSV svih mjeseci</a> ·{" "}
        <a href="https://data.zagreb.hr/dataset/podaci-o-potrosnji-i-trosku-za-objekte-grada-zagreba" target="_blank" rel="noreferrer">
          izvor na data.zagreb.hr
        </a>
        {zadnjaPuna ? (
          <span style={{ color: "var(--muted)" }}> · zadnja puna godina: {zadnjaPuna}.</span>
        ) : null}
      </p>
    </div>
  );
}
