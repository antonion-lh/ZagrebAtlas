import type { Metadata } from "next";
import { AZURNOST, AZURNOST_OPIS, TEME } from "@/lib/slojevi-ui";

export const metadata: Metadata = {
  title: "Vodič",
  description:
    "Kako čitati Zagreb Gradski atlas: što je na karti, što je u dosjeu četvrti, što znače oznake ažurnosti, kako se spajaju ISGE podaci, gdje su preuzimanja i kako prijaviti grešku.",
};

const h2 = { fontSize: "1.2rem", margin: "2rem 0 0.5rem" } as const;
const p = { lineHeight: 1.6, margin: "0.5rem 0" } as const;

export default function VodicPage() {
  return (
    <div style={{ maxWidth: "46rem", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <h1 style={{ marginTop: 0 }}>Vodič kroz Atlas</h1>
      <p style={{ ...p, color: "var(--muted)" }}>
        Zagreb Gradski atlas je karta i skup dosjea nad otvorenim podacima Grada Zagreba. Nije ocjena kvarta ni
        rang-lista; popisuje što grad objavljuje, gdje se to nalazi i koliko je podatak star.
      </p>

      <nav aria-label="Sadržaj vodiča" style={{ fontSize: "0.92rem", lineHeight: 1.7 }}>
        <a href="#karta">Karta</a> · <a href="#dosje">Dosje četvrti</a> · <a href="#ustanove">Ustanove</a> ·{" "}
        <a href="#isge">Energija (ISGE)</a> · <a href="#azurnost">Oznake ažurnosti</a> · <a href="#teme">Teme</a> ·{" "}
        <a href="#ogranicenja">Ograničenja</a> · <a href="#preuzimanja">Preuzimanja i API</a> ·{" "}
        <a href="#pristupacnost">Pristupačnost</a> · <a href="#kontakt">Kontakt</a>
      </nav>

      <h2 id="karta" style={h2}>Karta</h2>
      <p style={p}>
        Lijevi panel je legenda: slojevi su grupirani po temama, svaki s brojem zapisa i oznakom ažurnosti.
        Uključite sloj kvačicom; podaci se učitavaju tek tada. Točke se na manjim zoomovima grupiraju u
        brojčane krugove — klik na krug približava. Klik na točku, liniju ili poligon otvara desni panel s
        atributima, izvorom i datumom sinkronizacije.
      </p>
      <p style={p}>
        Izbornik „Četvrt” filtrira sve slojeve na jednu četvrt i nudi poveznicu na njezin dosje. Stanje
        karte može se dijeliti adresom, npr. <code>/?cetvrt=maksimir&amp;sloj=ljekarne,bus_stajalista</code>.
        Ako preglednik nema WebGL, umjesto karte se prikazuje popis slojeva s poveznicama na dosjee.
      </p>

      <h2 id="dosje" style={h2}>Dosje četvrti</h2>
      <p style={p}>
        Za svaku od 17 četvrti: predsjednik i sjedište četvrti, vijeće, prostori mjesne samouprave, područni
        ured, popis mjesnih odbora (s predsjednikom, sjedištem i vijećem), inventar ustanova i usluga po
        temama (svaka grupa ima „na karti”), sekcija energije gradskih objekata i popis izvora s ažurnošću.
        Cijeli dosje se preuzima kao CSV ili GeoJSON na dnu stranice.
      </p>

      <h2 id="ustanove" style={h2}>Katalog ustanova</h2>
      <p style={p}>
        Pretraživ popis svih točkastih objekata (ustanove, usluge, komunalna oprema, stajališta) po nazivu,
        adresi i vrsti, s filtrom po temi, skupu i četvrti. Svaki red nosi izvor i oznaku ažurnosti; kontakt
        podaci su onakvi kakvi su u izvoru.
      </p>

      <h2 id="isge" style={h2}>Energija gradskih objekata (ISGE)</h2>
      <p style={p}>
        Grad objavljuje mjesečnu potrošnju i trošak energenata po objektu i mjernom mjestu iz Informacijskog
        sustava za gospodarenje energijom (ISGE). Atlas zbraja mjerna mjesta u objekt × energent × mjesec;
        storno retci (negativne količine) zbrajaju se s izvornima. Trošak je s PDV-om. Voda nema kWh, pa se
        prikazuje u m³ i izdvaja iz energetskih zbrojeva.
      </p>
      <p style={p}>
        ISGE objekti nemaju koordinate. Atlas ih spaja na registar ustanova (škole, vrtići, domovi zdravlja,
        sportski i kulturni objekti, sjedišta mjesne samouprave…) u tri koraka i svaki spoj označava
        pouzdanošću:
      </p>
      <ul style={{ lineHeight: 1.6 }}>
        <li>
          <span className="azurnost pouzdanost-visoka">visoka</span> — ista ulica i kućni broj, sličan naziv;
        </li>
        <li>
          <span className="azurnost pouzdanost-srednja">srednja</span> — ista ulica i kućni broj uz različit naziv,
          ili ista ulica uz sličan naziv;
        </li>
        <li>
          <span className="azurnost pouzdanost-niska">niska</span> — samo vrlo sličan naziv (ne za sjedišta MO/GČ).
        </li>
      </ul>
      <p style={p}>
        Nespojeni objekti nisu na karti, ali su u tablici i pregledu; četvrt im se, kad je moguće, izvlači iz
        naziva („Gradska četvrt X – MS Y”) ili mjesta (Sesvete). Zbroj po četvrtima je zato manji od
        gradskog. Kad primijetite krivi spoj, javite nam (dolje).
      </p>

      <h2 id="azurnost" style={h2}>Oznake ažurnosti</h2>
      <p style={p}>
        Svaki sloj, grupa u dosjeu i red u katalogu nosi istu oznaku. Ona govori koliko često se izvor mijenja i
        koliko je stara snimka, ne koliko je podatak točan.
      </p>
      <ul style={{ lineHeight: 1.7 }}>
        {Object.entries(AZURNOST_OPIS).map(([k, v]) => (
          <li key={k}>
            <span className={`azurnost azurnost-${k}`}>{AZURNOST[k]}</span> — {v}
          </li>
        ))}
      </ul>
      <p style={p}>
        U katalogu je za svaki skup i datum zadnje izmjene na data.zagreb.hr te datum kad ga je Atlas
        zadnji put povukao. Dnevni skupovi (zatvaranja prometnica, prostori mjesne samouprave) osvježavaju se
        automatski.
      </p>

      <h2 id="teme" style={h2}>Teme</h2>
      <ul style={{ lineHeight: 1.7 }}>
        {TEME.filter((t) => t.sifra !== "meta").map((t) => (
          <li key={t.sifra}>
            <a href={`/katalog#tema-${t.sifra}`}>{t.naziv}</a>
          </li>
        ))}
      </ul>

      <h2 id="ogranicenja" style={h2}>Što Atlas nije i gdje griješi</h2>
      <ul style={{ lineHeight: 1.6 }}>
        <li>Atlas ne stvara podatke. Ako je nešto krivo u izvoru (adresa, kontakt, lokacija), krivo je i ovdje; oznaka ažurnosti i poveznica na izvor služe da to provjerite.</li>
        <li>Geoportal snimke označene „starija snimka” većinom su iz 2022./2023. i ne prikazuju nužno današnje stanje.</li>
        <li>Točke do 500 m izvan granice grada pripisuju se najbližoj četvrti; dalje ostaju bez četvrti.</li>
        <li>Linije i poligoni su u prikazu i izvozu pojednostavljeni (~2 m); izvorna geometrija je u resursu izvora.</li>
        <li>Isplate, proračun i plan komunalnih aktivnosti nisu dio Atlasa — za to postoji gradski servis iTransparentnost.</li>
        <li>Nema real-time podataka (npr. dolasci ZET-a); stajališta su statični položaji.</li>
      </ul>

      <h2 id="preuzimanja" style={h2}>Preuzimanja i API</h2>
      <p style={p}>
        Sve što Atlas prikazuje dostupno je i kao datoteka, bez ključeva: GeoJSON i CSV po sloju, CSV/JSON za
        tablične skupove, CSV/GeoJSON dosjea četvrti, CSV potrošnje ISGE objekta te strojno čitljiv katalog na{" "}
        <a href="/api/katalog">/api/katalog</a>. Popis krajnjih točaka je u <a href="/katalog#api">katalogu</a>.
        Koordinate su WGS84; CSV koristi točku-zarez i UTF-8 s BOM-om (otvara se izravno u Excelu i LibreOfficeu).
      </p>
      <p style={p}>
        Podaci: <a href="https://data.zagreb.hr" target="_blank" rel="noreferrer">data.zagreb.hr</a>, Grad Zagreb, Otvorena dozvola
        (OD) — navedite izvor. Kôd Atlasa je otvoren pod MIT licencom.
      </p>

      <h2 id="pristupacnost" style={h2}>Pristupačnost</h2>
      <p style={p}>
        Cilj je WCAG 2.2 razina AA: cijela stranica radi tipkovnicom (poveznica „Preskoči na sadržaj” na
        početku, vidljiv fokus, trenutna stranica označena u navigaciji), oznake ne ovise samo o boji (svaka
        ima tekst), tablice imaju zaglavlja, obrasci imaju oznake, sadržaj je na hrvatskom (<code>lang="hr"</code>).
        Karta zahtijeva WebGL i miš ili dodir; sav sadržaj karte dostupan je i tekstualno kroz dosje četvrti,
        katalog ustanova i preuzimanja. Ako naiđete na prepreku, javite nam.
      </p>

      <h2 id="kontakt" style={h2}>Kontakt i prijava grešaka</h2>
      <p style={p}>
        Greške u podacima prijavite izvoru (svaki skup u katalogu ima poveznicu na data.zagreb.hr). Greške u
        Atlasu — krivi spoj, kriva četvrt, prikaz, pristupačnost — prijavite kao{" "}
        <a href="https://github.com/antonion-lh/ZagrebAtlas/issues">GitHub issue</a> (vidi{" "}
        <code>CONTRIBUTING.md</code>). Kôd je MIT; podaci ostaju Grada Zagreba (Otvorena dozvola).
      </p>
    </div>
  );
}
