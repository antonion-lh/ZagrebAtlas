import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { dosjeCetvrti, type Grupa, type Vijecnik } from "@/lib/cetvrt-dosje";
import { pool } from "@/lib/db";
import { bojaEnergenta, energijaCetvrti, fmtEur, fmtKwh, VODA } from "@/lib/energija";
import { AZURNOST, formatDatum, kratkiNaziv } from "@/lib/slojevi-ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { rows } = await pool()
    .query<{ naziv: string }>(`SELECT naziv FROM geo.cetvrt WHERE slug = $1`, [slug])
    .catch(() => ({ rows: [] as { naziv: string }[] }));
  const naziv = rows[0]?.naziv;
  return {
    title: naziv ? `${naziv} — dosje četvrti` : "Četvrt nije pronađena",
    description: naziv ? `Dosje gradske četvrti ${naziv}: mjesni odbori, ustanove, lokalna demokracija, energija.` : undefined,
  };
}

function Oznaka({ azurnost }: { azurnost: string }) {
  return (
    <span className={`azurnost azurnost-${azurnost}`}>{AZURNOST[azurnost] || azurnost}</span>
  );
}

const MAX_POPIS = 80;

function PopisGrupe({ grupa, cetvrtSlug }: { grupa: Grupa; cetvrtSlug: string }) {
  const { sloj, objekti } = grupa;
  const otvoreno = objekti.length > 0 && objekti.length <= 12;
  const naKarti = `/?cetvrt=${cetvrtSlug}&sloj=${sloj.sifra}`;
  return (
    <details open={otvoreno} style={{ marginTop: "0.6rem" }}>
      <summary style={{ cursor: "pointer", lineHeight: 1.5 }}>
        <strong>{kratkiNaziv(sloj.naziv)}</strong>{" "}
        <span style={{ color: "var(--muted)" }}>({objekti.length})</span> <Oznaka azurnost={sloj.azurnost} />
      </summary>
      {objekti.length === 0 ? (
        <p style={{ color: "var(--muted)", margin: "0.4rem 0 0 1.1rem", fontSize: "0.92rem" }}>
          Nema zapisa u ovoj četvrti.
        </p>
      ) : objekti.length > MAX_POPIS ? (
        <p style={{ color: "var(--muted)", margin: "0.4rem 0 0 1.1rem", fontSize: "0.92rem", lineHeight: 1.5 }}>
          {objekti.length} zapisa — previše za popis. <a href={naKarti}>Prikaži na karti</a> ili preuzmi
          izvoz (CSV/GeoJSON) na dnu stranice.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: "0 0 0 1.1rem", margin: "0.3rem 0 0" }}>
          <li style={{ fontSize: "0.86rem", padding: "0.2rem 0 0.35rem" }}>
            <a href={naKarti}>Prikaži „{kratkiNaziv(sloj.naziv)}” na karti →</a>
          </li>
          {objekti.map((o) => (
            <li
              key={o.id}
              style={{
                padding: "0.45rem 0",
                borderBottom: "1px solid var(--line)",
                lineHeight: 1.4,
              }}
            >
              <div>{o.naziv || "Bez naziva"}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                {[o.adresa, o.mo ? `MO ${o.mo}` : null].filter(Boolean).join(" · ")}
                {o.tip === "zatvorena_cesta" && o.attrs?.do
                  ? ` · do ${formatDatum(String(o.attrs.do))}`
                  : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default async function CetvrtDosjePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dosje = await dosjeCetvrti(slug);
  if (!dosje) notFound();

  const { cetvrt, mo, uprava, teme, ukupnoObjekata, izvori } = dosje;
  const energija = await energijaCetvrti(cetvrt.id).catch(() => null);
  const energijaBezVode = energija ? energija.poEnergentu.filter((e) => e.energent !== VODA) : [];
  const energijaMax = Math.max(1, ...energijaBezVode.map((e) => e.kwh));
  const vijeceAktivno = uprava.vijece.filter((v) => v.aktivan);

  return (
    <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem" }}>
        <Link href="/cetvrti">← Sve četvrti</Link>
        {" · "}
        <Link href="/">Karta</Link>
      </p>

      <h1 style={{ margin: "0 0 0.4rem" }}>{cetvrt.naziv}</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.5, marginTop: 0 }}>
        Dosje četvrti — inventar iz učitanih otvorenih skupova Grada Zagreba. Popis, ne ocjena
        kvarta. Svaki izvor nosi oznaku ažurnosti.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))",
          gap: "0.75rem",
          margin: "1.25rem 0 0.5rem",
        }}
      >
        <Kartica label="Mjesnih odbora" n={mo.length} />
        <Kartica label="Vijećnika GČ" n={vijeceAktivno.length} />
        <Kartica label="Objekata ukupno" n={ukupnoObjekata} />
        {teme.map((t) => (
          <Kartica key={t.tema.sifra} label={t.tema.naziv} n={t.ukupno} />
        ))}
      </div>

      <section style={{ marginTop: "1.75rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Lokalna demokracija i uprava</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
            gap: "0.75rem",
          }}
        >
          <Okvir naslov="Predsjednik gradske četvrti" azurnost="godina">
            {uprava.predsjednik ? (
              <KontaktRedovi
                ime={uprava.predsjednik.ime}
                adresa={uprava.predsjednik.adresa}
                telefon={uprava.predsjednik.telefon}
                email={uprava.predsjednik.email}
                dodatno={
                  uprava.predsjednik.email_podrucni
                    ? [["Područni ured", uprava.predsjednik.email_podrucni]]
                    : []
                }
              />
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>Nije u učitanom skupu.</p>
            )}
          </Okvir>

          <Okvir naslov="Sjedište gradske četvrti" azurnost="starija_snimka">
            {uprava.sjediste ? (
              <KontaktRedovi
                ime={uprava.sjediste.naziv || cetvrt.naziv}
                adresa={uprava.sjediste.adresa}
                telefon={(uprava.sjediste.attrs.telefon as string) || null}
                email={(uprava.sjediste.attrs.email as string) || null}
                dodatno={[
                  ["Primanje stranaka", ostalo(uprava.sjediste.attrs, "primanje_stranaka")],
                  ["Smješteno u", ostalo(uprava.sjediste.attrs, "sjediste")],
                ].filter((r): r is [string, string] => Boolean(r[1]))}
              />
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>Nije u učitanom skupu.</p>
            )}
          </Okvir>

          <Okvir naslov="Prostori mjesne samouprave" azurnost="danas">
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>{uprava.prostorija}</strong> prostorija u {mo.filter((m) => m.prostorija).length} MO
              {uprava.termina ? (
                <>
                  , <strong>{uprava.termina}</strong> tjednih termina korištenja
                </>
              ) : null}
              .
            </p>
            <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.86rem" }}>
              Sažetak iz dnevno osvježavanog skupa; rezervacija se obavlja kod Grada, ne ovdje.
            </p>
          </Okvir>

          {uprava.podrucniUredi.length ? (
            <Okvir naslov="Područni ured u četvrti" azurnost="starija_snimka">
              {uprava.podrucniUredi.map((u) => (
                <KontaktRedovi
                  key={u.id}
                  ime={u.naziv || "Područni ured"}
                  adresa={u.adresa}
                  telefon={(u.attrs.telefon as string) || null}
                  email={null}
                  dodatno={[["Radno vrijeme", ostalo(u.attrs, "radno_vrijeme")]].filter(
                    (r): r is [string, string] => Boolean(r[1])
                  )}
                />
              ))}
            </Okvir>
          ) : null}
        </div>

        <details style={{ marginTop: "0.9rem" }} open={vijeceAktivno.length <= 25}>
          <summary style={{ cursor: "pointer", lineHeight: 1.5 }}>
            <strong>Vijeće gradske četvrti</strong>{" "}
            <span style={{ color: "var(--muted)" }}>({vijeceAktivno.length} aktivnih)</span>{" "}
            <Oznaka azurnost="godina" />
          </summary>
          <TablicaVijeca redovi={uprava.vijece} />
        </details>

        <h3 style={{ fontSize: "1rem", margin: "1.25rem 0 0.3rem" }}>
          Mjesni odbori <span style={{ color: "var(--muted)", fontWeight: 500 }}>({mo.length})</span>
        </h3>
        {mo.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Granice MO još nisu učitane.</p>
        ) : (
          mo.map((m) => (
            <details key={m.id} style={{ borderBottom: "1px solid var(--line)", padding: "0.4rem 0" }}>
              <summary style={{ cursor: "pointer", lineHeight: 1.5 }}>
                <strong>{m.naziv}</strong>{" "}
                <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {[
                    m.predsjednik ? `predsj. ${m.predsjednik.ime}` : null,
                    `${m.vijece.filter((v) => v.aktivan).length} vijećnika`,
                    m.prostorija ? `${m.prostorija} prostorija` : null,
                    `${m.objekata} objekata`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </summary>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
                  gap: "0.75rem",
                  margin: "0.5rem 0 0.25rem",
                }}
              >
                <Okvir naslov="Predsjednik MO" azurnost="godina">
                  {m.predsjednik ? (
                    <KontaktRedovi
                      ime={m.predsjednik.ime}
                      adresa={m.predsjednik.adresa}
                      telefon={m.predsjednik.telefon}
                      email={m.predsjednik.email}
                    />
                  ) : (
                    <p style={{ margin: 0, color: "var(--muted)" }}>Nije u učitanom skupu.</p>
                  )}
                </Okvir>
                <Okvir naslov="Sjedište MO" azurnost="starija_snimka">
                  {m.sjediste ? (
                    <KontaktRedovi
                      ime={m.naziv}
                      adresa={m.sjediste.adresa}
                      telefon={m.sjediste.telefon}
                      email={m.sjediste.email}
                      dodatno={[["Primanje stranaka", m.sjediste.primanje]].filter(
                        (r): r is [string, string] => Boolean(r[1])
                      )}
                    />
                  ) : (
                    <p style={{ margin: 0, color: "var(--muted)" }}>Nije u učitanom skupu.</p>
                  )}
                </Okvir>
              </div>
              {m.vijece.length ? <TablicaVijeca redovi={m.vijece} /> : null}
            </details>
          ))
        )}
      </section>

      {teme.map((t) => (
        <section key={t.tema.sifra} style={{ marginTop: "1.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>
            {t.tema.naziv}{" "}
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>({t.ukupno})</span>
          </h2>
          {t.grupe.map((g) => (
            <PopisGrupe key={g.sloj.sifra} grupa={g} cetvrtSlug={cetvrt.slug} />
          ))}
        </section>
      ))}

      {energija && energija.objekata > 0 ? (
        <section id="energija" style={{ marginTop: "1.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>
            Energija gradskih objekata <Oznaka azurnost="godina" />
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.2rem 0 0.6rem", lineHeight: 1.5 }}>
            ISGE, {energija.godina}. (zadnja puna godina): {energija.objekata} gradskih objekata s utvrđenom
            četvrti, {energija.spojeno} spojeno na registar ustanova.{" "}
            <Link href={`/energija?cetvrt=${cetvrt.slug}#objekti`}>Svi objekti četvrti</Link>
            {energija.spojeno ? (
              <>
                {" · "}
                <a href={`/?cetvrt=${cetvrt.slug}&sloj=isge`}>na karti</a>
              </>
            ) : null}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <Kartica label={`Energija ${energija.godina}.`} n={fmtKwh(energijaBezVode.reduce((a, e) => a + e.kwh, 0))} />
            <Kartica label={`Trošak ${energija.godina}.`} n={fmtEur(energija.eur)} />
            <Kartica label="Objekata u ISGE-u" n={energija.objekata} />
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.8rem", fontSize: "0.9rem" }}>
            {energijaBezVode.map((e) => (
              <li key={e.energent} style={{ display: "grid", gridTemplateColumns: "11rem 1fr 6.5rem 6.5rem", gap: "0.5rem", alignItems: "center", padding: "0.15rem 0" }}>
                <span>{e.energent}</span>
                <span style={{ height: 10, background: "var(--panel)", borderRadius: 3 }}>
                  <span style={{ display: "block", width: `${(e.kwh / energijaMax) * 100}%`, height: "100%", background: bojaEnergenta(e.energent), borderRadius: 3 }} />
                </span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKwh(e.kwh)}</span>
                <span style={{ textAlign: "right", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{fmtEur(e.eur)}</span>
              </li>
            ))}
          </ul>
          <details open={energija.top.length <= 6}>
            <summary style={{ cursor: "pointer" }}>Najveći potrošači {energija.godina}. (top {energija.top.length})</summary>
            <ol style={{ paddingLeft: "1.4rem", margin: "0.4rem 0 0", lineHeight: 1.5, fontSize: "0.92rem" }}>
              {energija.top.map((t) => (
                <li key={t.id}>
                  <Link href={`/energija/${t.id}`}>{t.naziv}</Link>
                  <span style={{ color: "var(--muted)" }}>
                    {" "}
                    · {fmtKwh(t.kwh)} · {fmtEur(t.eur)}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem" }}>Izvori i ažurnost</h2>
        <ul style={{ paddingLeft: "1.1rem", lineHeight: 1.6, color: "var(--muted)", fontSize: "0.92rem" }}>
          {izvori.map((m) => (
            <li key={m.sifra}>
              {m.ckan_url ? (
                <a href={m.ckan_url} target="_blank" rel="noreferrer">
                  {m.naziv}
                </a>
              ) : (
                m.naziv
              )}{" "}
              <Oznaka azurnost={m.azurnost} /> · sink. {formatDatum(m.sink)}
            </li>
          ))}
        </ul>
      </section>

      <p style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
        Preuzmi inventar:{" "}
        <a href={`/api/izvoz/cetvrt/${cetvrt.slug}`}>CSV</a>
        {" · "}
        <a href={`/api/izvoz/cetvrt/${cetvrt.slug}?format=geojson`}>GeoJSON</a>
      </p>
    </div>
  );
}

function ostalo(attrs: Record<string, unknown>, k: string): string | null {
  const o = attrs?.ostalo as Record<string, unknown> | undefined;
  const v = o?.[k];
  return v ? String(v) : null;
}

function Okvir({
  naslov,
  azurnost,
  children,
}: {
  naslov: string;
  azurnost: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "6px",
        padding: "0.7rem 0.85rem",
        background: "var(--panel)",
        fontSize: "0.93rem",
      }}
    >
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
        {naslov} <Oznaka azurnost={azurnost} />
      </div>
      {children}
    </div>
  );
}

function KontaktRedovi({
  ime,
  adresa,
  telefon,
  email,
  dodatno = [],
}: {
  ime: string;
  adresa: string | null;
  telefon: string | null;
  email: string | null;
  dodatno?: [string, string][];
}) {
  return (
    <div style={{ lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600 }}>{ime}</div>
      {adresa ? <div>{adresa}</div> : null}
      {telefon ? <div>{telefon}</div> : null}
      {email ? (
        <div>
          <a href={`mailto:${email}`}>{email}</a>
        </div>
      ) : null}
      {dodatno.map(([k, v]) => (
        <div key={k} style={{ color: "var(--muted)", fontSize: "0.86rem" }}>
          {k}: {v}
        </div>
      ))}
    </div>
  );
}

function TablicaVijeca({ redovi }: { redovi: Vijecnik[] }) {
  if (!redovi.length) {
    return <p style={{ color: "var(--muted)", margin: "0.4rem 0 0" }}>Nema učitanih članova.</p>;
  }
  return (
    <div style={{ overflowX: "auto", marginTop: "0.5rem" }} tabIndex={0} role="region" aria-label="Tablica vijeća">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }}>
            <th style={{ padding: "0.35rem 0.4rem" }}>Ime</th>
            <th style={{ padding: "0.35rem 0.4rem" }}>Funkcija</th>
            <th style={{ padding: "0.35rem 0.4rem" }}>Stranka / lista</th>
          </tr>
        </thead>
        <tbody>
          {redovi.map((v, i) => (
            <tr
              key={`${v.prezime_ime}-${i}`}
              style={{
                borderBottom: "1px solid var(--line)",
                color: v.aktivan ? undefined : "var(--muted)",
              }}
            >
              <td style={{ padding: "0.35rem 0.4rem", whiteSpace: "nowrap" }}>
                {v.prezime_ime}
                {!v.aktivan ? (
                  <span style={{ fontSize: "0.8rem" }}> (neaktivan{v.opis_promjena ? `: ${v.opis_promjena}` : ""})</span>
                ) : null}
              </td>
              <td style={{ padding: "0.35rem 0.4rem" }}>{v.funkcija || "član"}</td>
              <td style={{ padding: "0.35rem 0.4rem", color: "var(--muted)" }}>{v.stranka || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kartica({ label, n }: { label: string; n: number | string }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "6px",
        padding: "0.7rem 0.85rem",
        background: "var(--panel)",
      }}
    >
      <div style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 650 }}>{n}</div>
    </div>
  );
}
