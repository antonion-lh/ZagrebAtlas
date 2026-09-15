import type { Metadata } from "next";
import { AZURNOST, AZURNOST_OPIS, TEME } from "@/lib/slojevi-ui";

export const metadata: Metadata = {
  title: "Vodič",
  description:
    "Kako čitati Zagreb Gradski atlas: karta, dosje četvrti, ustanove, energija, oznake starosti podataka i preuzimanja.",
};

export default function VodicPage() {
  return (
    <div className="stranica">
      <h1>Vodič kroz Atlas</h1>
      <p className="uvod">
        Zagreb Gradski atlas skuplja ono što Grad već objavljuje na data.zagreb.hr i Geoportalu: gdje je što,
        u kojoj četvrti, i koliko je podatak star. Nije ocjena kvarta.
      </p>

      <nav aria-label="Sadržaj vodiča" className="sadrzaj-vodica">
        <a href="#karta">Karta</a> · <a href="#dosje">Dosje četvrti</a> · <a href="#ustanove">Ustanove</a> ·{" "}
        <a href="#isge">Energija</a> · <a href="#azurnost">Ažurnost</a> · <a href="#teme">Teme</a> ·{" "}
        <a href="#ogranicenja">Ograničenja</a> · <a href="#preuzimanja">Preuzimanja</a> ·{" "}
        <a href="#pristupacnost">Pristupačnost</a> · <a href="#kontakt">Kontakt</a>
      </nav>

      <h2 id="karta">Karta</h2>
      <p>
        Gore lijevo potražite školu, ljekarnu, ulicu ili četvrt. Pogodak približi kartu i otvori kratki opis.
        Ispod je četvrt (ako želite samo jedan dio grada), podloga (OpenStreetMap ili ortofoto Geoportala iz
        2022.) i legenda po temama. Temu otvorite kad vam treba; podaci se učitaju tek kad uključite sloj.
      </p>
      <p>
        Na manjem približenju točke se skupljaju u brojčane krugove. Klik na krug približava. Klik na točku,
        crtu ili površinu otvara desni panel: naziv, adresa, izvor, objekti u blizini i, za zatvaranja cesta,
        presjek s biciklističkim stazama i pješačkim zonama.
      </p>
      <p>
        Adresa u pregledniku pamti četvrt i slojeve, pa je možete poslati. Primjer:{" "}
        <code>/?cetvrt=maksimir&amp;sloj=ljekarne,bus_stajalista</code>. Ako preglednik ne crta kartu, isti
        sadržaj je u dosjeima i u katalogu.
      </p>
      <p>
        Kad je karta u fokusu (kliknite je ili dođite tipkom Tab), strelice pomiču prikaz, a plus i minus
        približuju i udaljuju.
      </p>

      <h2 id="dosje">Dosje četvrti</h2>
      <p>
        Svaka od 17 četvrti ima stranicu: predsjednik i sjedište, vijeće, prostori mjesne samouprave, područni
        ured, mjesni odbori, pa ustanove i usluge po temama. Uz svaku skupinu je poveznica na kartu. Na dnu
        su izvori i preuzimanje u CSV-u ili GeoJSON-u. Ispis iz preglednika otvara i skupljene odlomke.
      </p>

      <h2 id="ustanove">Ustanove i usluge</h2>
      <p>
        Popis točaka: škole, vrtići, zdravstvo, sport, stajališta, ljekarne. Traži se po nazivu, adresi i
        vrsti; može se suziti na temu, skup ili četvrt. Kontakt je onakav kakav stoji u izvoru.
      </p>

      <h2 id="isge">Energija gradskih objekata (ISGE)</h2>
      <p>
        Grad objavljuje mjesečnu potrošnju i trošak po objektu iz Informacijskog sustava za gospodarenje
        energijom. Atlas zbraja mjerna mjesta u objekt, energent i mjesec. Korekcijski i storno redovi
        (negativne količine) isključeni su iz zbroja; njihov broj stoji u katalogu. Trošak je s PDV-om. Voda
        nema kilovatsati, pa je u kubnim metrima i izvan energetskog zbroja.
      </p>
      <p>
        ISGE objekti nemaju koordinate. Atlas ih veže na registar ustanova u tri koraka; svaki spoj nosi
        pouzdanost:
      </p>
      <ul>
        <li>
          <span className="azurnost pouzdanost-visoka">visoka</span> — ista ulica i kućni broj, sličan naziv;
        </li>
        <li>
          <span className="azurnost pouzdanost-srednja">srednja</span> — ista adresa uz različit naziv, ili
          ista ulica uz sličan naziv;
        </li>
        <li>
          <span className="azurnost pouzdanost-niska">niska</span> — samo vrlo sličan naziv (ne za sjedišta
          mjesnih odbora i četvrti).
        </li>
      </ul>
      <p>
        Nespojeni objekti nisu na karti, ali jesu u tablici. Četvrt im se, kad se da, iščita iz naziva ili
        mjesta (npr. Sesvete). Zbroj po četvrtima zato je manji od gradskog. Krivi spoj javite nam.
      </p>
      <p>
        Na dosjeu objekta stoji čitanje „kriza 2022.” (kWh naspram eura 2021./2022.), zima naspram ljeta u
        punim godinama, i medijan iste namjene u četvrti ili u gradu. Nema kWh/m² jer u javnom CSV-u nema
        površine zgrade.
      </p>

      <h2 id="azurnost">Oznake ažurnosti</h2>
      <p>
        Ista oznaka stoji na sloju, u dosjeu i u katalogu. Govori koliko često se izvor mijenja i koliko je
        stara snimka, ne koliko je podatak točan.
      </p>
      <ul>
        {Object.entries(AZURNOST_OPIS).map(([k, v]) => (
          <li key={k}>
            <span className={`azurnost azurnost-${k}`}>{AZURNOST[k]}</span> — {v}
          </li>
        ))}
      </ul>
      <p>
        U katalogu je i datum zadnje izmjene na data.zagreb.hr, i datum kad ga je Atlas zadnji put povukao.
        Zatvaranja cesta i prostori mjesne samouprave osvježavaju se svaki dan.
      </p>

      <h2 id="teme">Teme</h2>
      <ul>
        {TEME.filter((t) => t.sifra !== "meta").map((t) => (
          <li key={t.sifra}>
            <a href={`/katalog#tema-${t.sifra}`}>{t.naziv}</a>
          </li>
        ))}
      </ul>

      <h2 id="ogranicenja">Što Atlas nije</h2>
      <ul>
        <li>
          Atlas ne izmišlja podatke. Ako je adresa u izvoru kriva, kriva je i ovdje. Zato uz svaki sloj stoji
          poveznica na data.zagreb.hr.
        </li>
        <li>Geoportalove snimke označene „starija snimka” većinom su iz 2022. ili 2023.</li>
        <li>Točke do 500 m izvan granice grada pripisuju se najbližoj četvrti; dalje ostaju bez četvrti.</li>
        <li>Linije i poligoni su u prikazu pojednostavljeni (oko 2 m). Izvorna geometrija je u datoteci izvora.</li>
        <li>
          Isplate, proračun i plan komunalnih aktivnosti nisu ovdje. Za to je gradski servis{" "}
          <a href="https://transparentnost.zagreb.hr/" target="_blank" rel="noreferrer">
            iTransparentnost
          </a>
          .
        </li>
        <li>Nema dolazaka tramvaja u stvarnom vremenu. Statične GTFS rute jesu; dolazak uživo nije obveza.</li>
        <li>
          Na mobitelu karta ispunjava zaslon; slojevi i pregled objekta otvaraju se kao list s dna. Navigacija
          se listom pomiče vodoravno.
        </li>
      </ul>

      <h2 id="preuzimanja">Preuzimanja i programsko sučelje</h2>
      <p>
        Sve što Atlas pokazuje može se i preuzeti, bez ključa: GeoJSON i CSV po sloju, tablice, dosje četvrti,
        potrošnja jednog objekta, pročišćeni gold agregati (<code>gold_objekti</code>,{" "}
        <code>gold_isge_godina</code>, <code>gold_inventar_cetvrt</code>) i strojno čitljiv katalog na{" "}
        <a href="/api/katalog">/api/katalog</a>. Popis putanja je u <a href="/katalog#api">katalogu</a>.
        Koordinate su WGS84. CSV koristi točku-zarez i UTF-8 s BOM-om, pa se otvara u Excelu i u programu
        LibreOffice.
      </p>
      <p>
        Podaci: <a href="https://data.zagreb.hr" target="_blank" rel="noreferrer">data.zagreb.hr</a>, Grad
        Zagreb, Otvorena dozvola — navedite izvor. Kôd Atlasa je pod MIT licencom.
      </p>

      <h2 id="pristupacnost">Pristupačnost</h2>
      <p>
        Cilj je WCAG 2.2, razina AA. Cijela stranica radi tipkovnicom (poveznica „Preskoči na sadržaj”,
        vidljiv fokus, trenutačna stranica u navigaciji). Oznake imaju tekst, ne samo boju. Tablice imaju
        zaglavlja, obrasci oznake. Jezik je hrvatski (<code>lang=&quot;hr&quot;</code>). Karta treba WebGL;
        sav sadržaj karte dostupan je i kao tekst u dosjeu, u popisu ustanova i u preuzimanjima.
      </p>

      <h2 id="kontakt">Kontakt i prijava grešaka</h2>
      <p>
        Grešku u podatku prijavite izvoru (u katalogu je poveznica na data.zagreb.hr). Grešku u Atlasu —
        krivi spoj, kriva četvrt, prikaz, prepreku u korištenju — otvorite kao{" "}
        <a href="https://github.com/antonion-lh/ZagrebAtlas/issues">prijavu na GitHubu</a>. Kôd je MIT;
        podaci ostaju Grada Zagreba.
      </p>
    </div>
  );
}
