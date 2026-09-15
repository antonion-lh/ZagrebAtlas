import Link from "next/link";
import { SlozeniStupci } from "@/components/EnergijaGraf";
import {
  energijaEnergenti,
  energijaObjekti,
  energijaPregled,
  fmtEur,
  fmtKwh,
  VODA,
  type EnergijaFilter,
} from "@/lib/energija";
import { ucitajCetvrtiKratko } from "@/lib/slojevi";
import { ocistiUpit } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Energija gradskih objekata",
  description: "Potrošnja i trošak energije i vode u objektima Grada Zagreba, iz ISGE-a, po godinama i četvrtima.",
};

type Params = { q?: string; cetvrt?: string; energent?: string; spojeni?: string; sort?: string; str?: string };

const PO = 50;

function url(p: Params, promjena: Partial<Params>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...promjena, str: promjena.str })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/energija?${s}#objekti` : "/energija#objekti";
}

function Kartica({ label, v, pod }: { label: string; v: string; pod?: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "0.7rem 0.9rem", background: "var(--panel)" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 600 }}>{v}</div>
      {pod ? <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{pod}</div> : null}
    </div>
  );
}

export default async function EnergijaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const pregled = await energijaPregled();
  if (!pregled) {
    return (
      <div className="stranica">
        <h1>Energija gradskih objekata</h1>
        <p role="alert">Podaci o energiji još nisu učitani. Pogledajte ostale teme na karti ili u katalogu.</p>
      </div>
    );
  }
  const g = pregled.zadnjaPunaGodina;
  const f: EnergijaFilter = {
    q: ocistiUpit(p.q || ""),
    cetvrt: p.cetvrt || "",
    energent: p.energent || "",
    spojeni: p.spojeni === "da" || p.spojeni === "ne" ? p.spojeni : "",
    sort: p.sort === "eur" || p.sort === "naziv" ? p.sort : "kwh",
    str: Math.max(1, Number(p.str) || 1),
    poStranici: PO,
  };
  const [{ redovi, ukupno }, energenti, cetvrti] = await Promise.all([
    energijaObjekti(f, g),
    energijaEnergenti(),
    ucitajCetvrtiKratko(),
  ]);
  const stranica = Math.ceil(ukupno / PO);

  const godinaZadnja = pregled.poGodini.find((x) => x.godina === g);
  const vodaZadnja = pregled.poEnergentu.find((x) => x.godina === g && x.energent === VODA);
  const stupciGodine = pregled.poGodini.map((y) => ({
    oznaka: y.puna ? String(y.godina) : `${y.godina}*`,
    dijelovi: pregled.poEnergentu.filter((x) => x.godina === y.godina).map((x) => ({ energent: x.energent, v: x.kwh })),
  }));
  const energentiZadnje = pregled.poEnergentu.filter((x) => x.godina === g);
  const g21 = pregled.poGodini.find((x) => x.godina === 2021);
  const g22 = pregled.poGodini.find((x) => x.godina === 2022);
  const maxCetvrt = Math.max(1, ...pregled.poCetvrti.map((c) => c.kwh));

  return (
    <div className="stranica stranica-siroka">
      <h1>Energija gradskih objekata</h1>
      <p className="uvod">
        Koliko struje, plina i vode troše objekti Grada, iz Informacijskog sustava za gospodarenje energijom
        (ISGE), od {pregled.razdoblje?.od} do {pregled.razdoblje?.do}. Trošak je s PDV-om. Objekti spojeni na
        registar ustanova vide se i na karti; ostali samo u ovoj tablici.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.6rem" }}>
        <Kartica label={`Energija ${g}.`} v={fmtKwh(godinaZadnja?.kwh ?? 0)} pod="bez vode" />
        <Kartica label={`Trošak ${g}.`} v={fmtEur(godinaZadnja?.eur ?? 0)} pod="energija + voda, s PDV-om" />
        <Kartica
          label={`Voda ${g}.`}
          v={`${Math.round(vodaZadnja?.kolicina ?? 0).toLocaleString("hr-HR")} m³`}
          pod={fmtEur(vodaZadnja?.eur ?? 0)}
        />
        <Kartica
          label="Objekata u ISGE-u"
          v={pregled.ukupno.objekata.toLocaleString("hr-HR")}
          pod={`${pregled.ukupno.spojeno} spojeno na registar · ${pregled.ukupno.sCetvrti} s četvrti`}
        />
      </div>

      {g21 && g22 ? (
        <p style={{ fontSize: "0.92rem", lineHeight: 1.5, margin: "1rem 0 0" }}>
          <strong>Kriza 2022. (cijeli ISGE):</strong> energija {fmtKwh(g21.kwh)} → {fmtKwh(g22.kwh)}
          {g21.kwh
            ? ` (${g22.kwh >= g21.kwh ? "+" : ""}${(((g22.kwh - g21.kwh) / g21.kwh) * 100).toLocaleString("hr-HR", { maximumFractionDigits: 0 })} %)`
            : ""}
          ; račun {fmtEur(g21.eur)} → {fmtEur(g22.eur)}
          {g21.eur
            ? ` (${g22.eur >= g21.eur ? "+" : ""}${(((g22.eur - g21.eur) / g21.eur) * 100).toLocaleString("hr-HR", { maximumFractionDigits: 0 })} %)`
            : ""}
          . {g22.kwh < g21.kwh && g22.eur > g21.eur ? "Potrošnja je pala, račun porastao." : ""}
        </p>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>Po godinama i energentima</h2>
        <SlozeniStupci stupci={stupciGodine} naslov="kWh po godini (* nepotpuna godina)" visina={200} />
        <div style={{ overflowX: "auto", marginTop: "0.8rem" }} tabIndex={0} role="region" aria-label="Energenti po godini">
          <table style={{ borderCollapse: "collapse", fontSize: "0.9rem", minWidth: 480 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
                <th style={{ padding: "0.35rem 0.5rem" }}>Energent ({g}.)</th>
                <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Energija</th>
                <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Trošak</th>
                <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>€/kWh</th>
              </tr>
            </thead>
            <tbody>
              {energentiZadnje.map((e) => (
                <tr key={e.energent} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "0.35rem 0.5rem" }}>
                    <Link href={url(p, { energent: e.energent })}>{e.energent}</Link>
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>
                    {e.energent === VODA ? `${Math.round(e.kolicina).toLocaleString("hr-HR")} m³` : fmtKwh(e.kwh)}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>{fmtEur(e.eur)}</td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", color: "var(--muted)" }}>
                    {e.energent === VODA || e.kwh <= 0 ? "—" : (e.eur / e.kwh).toLocaleString("hr-HR", { maximumFractionDigits: 3 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.4rem" }}>Po četvrtima ({g}.)</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 0 }}>
          Samo objekti kojima je četvrt utvrđena (spajanjem na registar, iz naziva ili mjesta). Zbroj po
          četvrtima je zato manji od gradskog.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
              <th style={{ padding: "0.35rem 0.5rem" }}>Četvrt</th>
              <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Objekata</th>
              <th style={{ padding: "0.35rem 0.5rem", width: "40%" }}>Energija</th>
              <th style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>Trošak</th>
            </tr>
          </thead>
          <tbody>
            {pregled.poCetvrti.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "0.35rem 0.5rem" }}>
                  <Link href={`/cetvrti/${c.slug}#energija`}>{c.naziv}</Link>
                </td>
                <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>
                  <Link href={url(p, { cetvrt: c.slug })}>{c.objekata}</Link>
                </td>
                <td style={{ padding: "0.35rem 0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ flex: 1, height: 10, background: "var(--panel)", borderRadius: 3 }}>
                      <div style={{ width: `${(c.kwh / maxCetvrt) * 100}%`, height: "100%", background: "#d97706", borderRadius: 3 }} />
                    </div>
                    <span style={{ minWidth: "5.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKwh(c.kwh)}</span>
                  </div>
                </td>
                <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>{fmtEur(c.eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="objekti" style={{ marginTop: "1.75rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Objekti</h2>
        <form method="get" action="/energija#objekti" className="filter-forma">
          <label>
            Traži (naziv, adresa)
            <input name="q" defaultValue={f.q} placeholder="npr. OŠ, Dom zdravlja, Ilica" />
          </label>
          <label>
            Četvrt
            <select name="cetvrt" defaultValue={f.cetvrt}>
              <option value="">Sve</option>
              {cetvrti.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.naziv}
                </option>
              ))}
            </select>
          </label>
          <label>
            Energent
            <select name="energent" defaultValue={f.energent}>
              <option value="">Svi</option>
              {energenti.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            Spojeni na registar
            <select name="spojeni" defaultValue={f.spojeni}>
              <option value="">Svi</option>
              <option value="da">Samo spojeni</option>
              <option value="ne">Samo nespojeni</option>
            </select>
          </label>
          <input type="hidden" name="sort" value={f.sort} />
          <button type="submit" className="gumb">
            Traži
          </button>
        </form>

        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.7rem 0 0.4rem" }}>
          {ukupno.toLocaleString("hr-HR")} objekata{stranica > 1 ? ` · stranica ${f.str}/${stranica}` : ""} · sortiraj:{" "}
          {(["kwh", "eur", "naziv"] as const).map((s, i) => (
            <span key={s}>
              {i ? " · " : ""}
              {f.sort === s ? <strong>{s === "kwh" ? "energija" : s === "eur" ? "trošak" : "naziv"}</strong> : (
                <Link href={url(p, { sort: s })}>{s === "kwh" ? "energija" : s === "eur" ? "trošak" : "naziv"}</Link>
              )}
            </span>
          ))}
          {f.q || f.cetvrt || f.energent || f.spojeni ? (
            <>
              {" · "}
              <Link href="/energija#objekti">poništi odabir</Link>
            </>
          ) : null}
        </p>

        <div>
          <table className="tablica" style={{ fontSize: "0.9rem" }}>
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              ISGE objekti s potrošnjom i troškom {g}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Objekt</th>
                <th scope="col">Četvrt</th>
                <th scope="col">Energenti</th>
                <th scope="col" className="broj">Energija {g}.</th>
                <th scope="col" className="broj">Trošak {g}.</th>
                <th scope="col">Spoj</th>
              </tr>
            </thead>
            <tbody>
              {redovi.map((r) => (
                <tr key={r.id}>
                  <td data-oznaka="Objekt">
                    <Link href={`/energija/${r.id}`}>{r.naziv}</Link>
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      {[r.adresa, r.mjesto && r.mjesto !== "Zagreb" ? r.mjesto : null].filter(Boolean).join(", ")}
                    </div>
                  </td>
                  <td data-oznaka="Četvrt" style={{ whiteSpace: "nowrap" }}>
                    {r.cetvrt_slug ? <Link href={`/cetvrti/${r.cetvrt_slug}#energija`}>{r.cetvrt}</Link> : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td data-oznaka="Energenti" style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{r.energenti.join(", ")}</td>
                  <td data-oznaka={`Energija ${g}.`} className="broj">{fmtKwh(r.kwh_god)}</td>
                  <td data-oznaka={`Trošak ${g}.`} className="broj">{fmtEur(r.eur_god)}</td>
                  <td data-oznaka="Spoj" style={{ fontSize: "0.82rem" }}>
                    {r.pouzdanost ? (
                      <span className={`azurnost pouzdanost-${r.pouzdanost}`} title={`metoda: ${r.metoda}`}>
                        {r.pouzdanost}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>nespojen</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stranica > 1 ? (
          <p style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.92rem" }}>
            {f.str! > 1 ? <Link href={url(p, { str: String(f.str! - 1) })}>← Prethodna</Link> : null}
            {f.str! < stranica ? <Link href={url(p, { str: String(f.str! + 1) })}>Sljedeća →</Link> : null}
          </p>
        ) : null}
      </section>

      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
        Izvor:{" "}
        <a href="https://data.zagreb.hr/dataset/podaci-o-potrosnji-i-trosku-za-objekte-grada-zagreba" target="_blank" rel="noreferrer">
          Podaci o potrošnji i trošku za objekte Grada Zagreba
        </a>{" "}
        Korekcijski redovi (storno) zbrojeni su s izvornima. Spoj na registar:{" "}
        <em>visoka</em> = ista adresa i sličan naziv, <em>srednja</em> = ista adresa ili ista ulica sa sličnim
        nazivom, <em>niska</em> = samo sličan naziv.
      </p>
    </div>
  );
}
