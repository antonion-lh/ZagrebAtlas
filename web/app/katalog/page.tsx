import type { Metadata } from "next";
import {
  API_TOCKE,
  BACKLOG,
  ucitajIsgeSpoj,
  ucitajKatalog,
  ucitajPortalUsporedba,
  type IsgeSpoj,
  type KatalogSkup,
  type PortalRed,
} from "@/lib/katalog";
import { AZURNOST, AZURNOST_OPIS, TEME, TIP_NAZIV, formatDatum } from "@/lib/slojevi-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Katalog podataka",
  description: "Svi skupovi učitani u Atlas: izvor na data.zagreb.hr, licenca, ažurnost, resursi i Atlasova preuzimanja.",
};

const GEOM: Record<KatalogSkup["geometrija"], string> = {
  tocka: "točke",
  linija: "linije",
  poligon: "poligoni",
  tablica: "tablica",
};

function fmtVelicina(b: number | null): string {
  if (!b) return "";
  if (b >= 1e6) return `${(b / 1e6).toLocaleString("hr-HR", { maximumFractionDigits: 1 })} MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)} kB`;
  return `${b} B`;
}

function Skup({ s }: { s: KatalogSkup }) {
  return (
    <article
      id={s.sifra}
      className="katalog-skup"
      style={{
        borderTop: "1px solid var(--line)",
        padding: "0.85rem 0",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 15rem",
        gap: "0.5rem 1.25rem",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: s.geometrija === "poligon" ? 2 : 99, background: s.boja, display: "inline-block" }} />
          {s.naziv}
          <span className={`azurnost azurnost-${s.azurnost}`}>{AZURNOST[s.azurnost] || s.azurnost}</span>
          <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.85rem" }}>
            {GEOM[s.geometrija]}
            {s.tip ? ` · ${TIP_NAZIV[s.tip] || s.tip}` : ""}
          </span>
        </h3>
        {s.napomena ? <p style={{ margin: "0.25rem 0 0", fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.45 }}>{s.napomena}</p> : null}
        <dl style={{ margin: "0.45rem 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.1rem 0.7rem", fontSize: "0.86rem" }}>
          <dt style={{ color: "var(--muted)" }}>Izvor</dt>
          <dd style={{ margin: 0 }}>
            {s.ckan_url ? (
              <a href={s.ckan_url} target="_blank" rel="noreferrer">
                {s.ckan_naslov || s.paket_id || "data.zagreb.hr"}
              </a>
            ) : (
              "—"
            )}
            {s.izdavac ? ` · ${s.izdavac}` : ""}
            {s.licenca ? ` · ${s.licenca}` : ""}
          </dd>
          <dt style={{ color: "var(--muted)" }}>Izmjena izvora</dt>
          <dd style={{ margin: 0 }}>{s.ckan_izmjena ? formatDatum(s.ckan_izmjena.toISOString()) : "nepoznato"}</dd>
          <dt style={{ color: "var(--muted)" }}>U Atlasu</dt>
          <dd style={{ margin: 0 }}>
            {s.zadnja_sinkronizacija ? (
              <>
                {s.broj_zapisa?.toLocaleString("hr-HR") ?? "—"} zapisa · preuzeto {formatDatum(s.zadnja_sinkronizacija.toISOString())}
                {s.frekvencija_sink ? ` (${s.frekvencija_sink})` : ""}
              </>
            ) : (
              "još nije učitan"
            )}
            {s.neuspjeh > 0 ? (
              <span style={{ color: "#b91c1c" }}> · {s.neuspjeh} neuspjelih preuzimanja u 7 dana</span>
            ) : null}
          </dd>
          {s.resursi.length ? (
            <>
              <dt style={{ color: "var(--muted)" }}>Resursi izvora</dt>
              <dd style={{ margin: 0 }}>
                {s.resursi.map((r, i) => (
                  <span key={i}>
                    {i ? " · " : ""}
                    <a href={r.url || "#"} target="_blank" rel="noreferrer" title={r.naziv || undefined}>
                      {r.format || "datoteka"}
                    </a>
                    {r.velicina ? <span style={{ color: "var(--muted)" }}> {fmtVelicina(r.velicina)}</span> : null}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
      <div style={{ fontSize: "0.86rem" }}>
        <div style={{ color: "var(--muted)", marginBottom: "0.2rem" }}>Preuzmi iz Atlasa</div>
        {s.distribucije.length ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, lineHeight: 1.6 }}>
            {s.distribucije.map((d) => (
              <li key={d.url}>
                <a href={d.url}>{d.format}</a> <span style={{ color: "var(--muted)" }}>— {d.opis}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </div>
    </article>
  );
}

export default async function KatalogPage() {
  let skupovi: KatalogSkup[] = [];
  let portal: PortalRed[] = [];
  let spoj: IsgeSpoj | null = null;
  let greska: string | null = null;
  try {
    [skupovi, portal, spoj] = await Promise.all([
      ucitajKatalog(),
      ucitajPortalUsporedba().catch(() => [] as PortalRed[]),
      ucitajIsgeSpoj(),
    ]);
  } catch (e) {
    greska = "Katalog se trenutačno ne može učitati.";
  }

  const grupe = TEME.map((t) => ({ tema: t, skupovi: skupovi.filter((s) => s.tema === t.sifra) })).filter(
    (g) => g.skupovi.length
  );
  const ukupnoZapisa = skupovi.reduce((a, s) => a + (s.broj_zapisa || 0), 0);
  const zadnja = skupovi.reduce<Date | null>(
    (a, s) => (s.zadnja_sinkronizacija && (!a || s.zadnja_sinkronizacija > a) ? s.zadnja_sinkronizacija : a),
    null
  );

  return (
    <div className="stranica stranica-siroka">
      <h1>Katalog podataka</h1>
      <p className="uvod">
        Svaki skup koji Atlas pokazuje: odakle dolazi, pod kojom licencom, koliko je star i gdje ga
        preuzeti. {skupovi.length} skupova, {ukupnoZapisa.toLocaleString("hr-HR")} zapisa
        {zadnja ? `, zadnje preuzimanje ${formatDatum(zadnja.toISOString())}` : ""}. Strojno čitljivo:{" "}
        <a href="/api/katalog">/api/katalog</a>.
      </p>

      <nav aria-label="Teme u katalogu" style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 0.9rem", fontSize: "0.9rem", margin: "0.5rem 0 1rem" }}>
        {grupe.map((g) => (
          <a key={g.tema.sifra} href={`#tema-${g.tema.sifra}`}>
            {g.tema.naziv} ({g.skupovi.length})
          </a>
        ))}
        <a href="#api">API</a>
        <a href="#portal">Portal vs. Atlas</a>
        <a href="#spoj">ISGE spoj</a>
        <a href="#backlog">Backlog</a>
      </nav>

      <details style={{ margin: "0.75rem 0 1.25rem", fontSize: "0.92rem" }}>
        <summary style={{ cursor: "pointer" }}>Što znače oznake ažurnosti</summary>
        <ul style={{ lineHeight: 1.6, paddingLeft: "1.1rem", marginTop: "0.5rem" }}>
          {Object.entries(AZURNOST_OPIS).map(([k, v]) => (
            <li key={k}>
              <span className={`azurnost azurnost-${k}`}>{AZURNOST[k]}</span> — {v}
            </li>
          ))}
        </ul>
      </details>

      {greska ? (
        <p role="alert">{greska}</p>
      ) : (
        grupe.map(({ tema, skupovi: ss }) => (
          <section key={tema.sifra} id={`tema-${tema.sifra}`} style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.2rem" }}>
              {tema.naziv} <span style={{ color: "var(--muted)", fontWeight: 500 }}>({ss.length})</span>
            </h2>
            {ss.map((s) => (
              <Skup key={s.sifra} s={s} />
            ))}
          </section>
        ))
      )}

      <section id="spoj" style={{ marginTop: "2.25rem" }}>
        <h2>ISGE spoj na registar</h2>
        {spoj ? (
          <p style={{ fontSize: "0.92rem", lineHeight: 1.55 }}>
            {spoj.spojeno.toLocaleString("hr-HR")} od {spoj.objekata.toLocaleString("hr-HR")} objekata (
            {spoj.objekata ? Math.round((100 * spoj.spojeno) / spoj.objekata) : 0} %) spojenih na ustanove:
            pouzdanost visoka {spoj.visoka}, srednja {spoj.srednja}, niska {spoj.niska}.{" "}
            {spoj.napomena ? <span style={{ color: "var(--muted)" }}>{spoj.napomena}</span> : null} Metoda je u{" "}
            <a href="/vodic#isge">vodiču</a>. Storno (negativne količine) isključeno je iz zbroja.
          </p>
        ) : (
          <p style={{ color: "var(--muted)" }}>ISGE još nije učitan.</p>
        )}
      </section>

      <section id="portal" style={{ marginTop: "2.25rem" }}>
        <h2>Što Grad objavljuje, a što je u Atlasu</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5, marginTop: 0 }}>
          Asset lista Portala ({portal.length || "—"} redaka). U Atlasu su skupovi koji imaju geometriju ili
          tablicu za dosje; ostali ostaju na data.zagreb.hr.{" "}
          {portal.length ? (
            <>
              U Atlasu {portal.filter((p) => p.stanje === "u_atlasu").length}, na Portalu a ne u Atlasu{" "}
              {portal.filter((p) => p.stanje === "nije_u_atlasu").length}, izvan CKAN-a{" "}
              {portal.filter((p) => p.stanje === "nije_ckan").length}.
            </>
          ) : (
            "Lista se učitava ingestom skupa asset_lista."
          )}{" "}
          <a href="/api/tablica/asset_lista?format=csv">CSV</a>.
        </p>
        {portal.length ? (
          <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Portal vs Atlas">
            <table className="tablica" style={{ fontSize: "0.86rem" }}>
              <thead>
                <tr>
                  <th scope="col">Stanje</th>
                  <th scope="col">Skup na Portalu</th>
                  <th scope="col">U Atlasu</th>
                </tr>
              </thead>
              <tbody>
                {portal.slice(0, 80).map((p, i) => (
                  <tr key={`${p.paket_id || p.naziv}-${i}`}>
                    <td data-oznaka="Stanje" style={{ whiteSpace: "nowrap" }}>
                      {p.stanje === "u_atlasu" ? "u Atlasu" : p.stanje === "nije_ckan" ? "nije CKAN" : "nije u Atlasu"}
                    </td>
                    <td data-oznaka="Skup">
                      {p.poveznica ? (
                        <a href={p.poveznica} target="_blank" rel="noreferrer">
                          {p.naziv}
                        </a>
                      ) : (
                        p.naziv
                      )}
                    </td>
                    <td data-oznaka="U Atlasu">
                      {p.atlas_sifra ? <a href={`#${p.atlas_sifra}`}>{p.atlas_sifra}</a> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portal.length > 80 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Prikazano 80 od {portal.length}. Cijela tablica:{" "}
                <a href="/api/tablica/asset_lista?format=csv">CSV</a>.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section id="backlog" style={{ marginTop: "2.25rem" }}>
        <h2>Javni backlog (nije u v1)</h2>
        <ul style={{ paddingLeft: "1.1rem", fontSize: "0.92rem", lineHeight: 1.55 }}>
          {BACKLOG.map((b) => (
            <li key={b.naziv}>
              <strong>{b.naziv}.</strong> {b.razlog}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "0.92rem" }}>
          Proračun i isplate:{" "}
          <a href="https://transparentnost.zagreb.hr/" target="_blank" rel="noreferrer">
            iTransparentnost
          </a>{" "}
          (zaseban servis, bez ingesta u Atlas).
        </p>
      </section>

      <section id="api" style={{ marginTop: "2.25rem" }}>
        <h2>Preuzimanja i programsko sučelje</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5, marginTop: 0 }}>
          Sve što Atlas pokazuje može se i preuzeti, bez ključa. Odgovori se mogu predmemorirati (nose
          zaglavlje <code>Cache-Control</code>). Koordinate su WGS84 (EPSG:4326). CSV koristi točku-zarez
          i UTF-8 s BOM-om. Tablice <code>gold_*</code> su pročišćeni agregati (objekti, godišnji ISGE,
          inventar četvrti) za ponovnu uporabu.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <caption style={{ textAlign: "left", color: "var(--muted)", fontSize: "0.85rem", padding: "0.3rem 0" }}>
            Putanje Atlasa
          </caption>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
              <th scope="col" style={{ padding: "0.4rem 0.4rem" }}>Putanja</th>
              <th scope="col" style={{ padding: "0.4rem 0.4rem" }}>Format</th>
              <th scope="col" style={{ padding: "0.4rem 0.4rem" }}>Opis</th>
            </tr>
          </thead>
          <tbody>
            {API_TOCKE.map((t) => (
              <tr key={t.url} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "0.45rem 0.4rem" }}>
                  <code>{t.url}</code>
                </td>
                <td style={{ padding: "0.45rem 0.4rem", whiteSpace: "nowrap" }}>{t.format}</td>
                <td style={{ padding: "0.45rem 0.4rem" }}>{t.opis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "2rem", fontSize: "0.92rem", color: "var(--muted)", lineHeight: 1.55 }}>
        <h2>Kako Atlas slaže podatke</h2>
        <ul style={{ paddingLeft: "1.1rem" }}>
          <li>Točke se pridružuju četvrti i mjesnom odboru prostorno (PostGIS). Točke do 500 m izvan granice pripisuju se najbližoj četvrti; dalje od toga ostaju bez četvrti (objekti izvan grada u Geoportal snimkama).</li>
          <li>Zatvaranja prometnica sijeku se s poligonom četvrti; jedno zatvaranje može biti u više četvrti.</li>
          <li>Linije i poligoni se u GeoJSON izvozu pojednostavljuju (tolerancija 0,00002°, oko 2 m); za izvornu geometriju koristite resurs izvora.</li>
          <li>Registar naziva ulica služi normalizaciji adresa; nema geometriju i nije na karti.</li>
          <li>ISGE objekti spajaju se na registar ustanova adresom i sličnošću naziva; svaki spoj nosi pouzdanost (visoka/srednja/niska). Vidi <a href="/vodic#isge">vodič</a>.</li>
          <li>Isplate, proračun i plan komunalnih aktivnosti nisu dio Atlasa. Za to postoji zaseban gradski servis iTransparentnost.</li>
        </ul>
      </section>
    </div>
  );
}
