"""Registar skupova za Atlas ingest (CKAN / Geoportal).

Svaki skup ima:
- handler: kako se učitava (cetvrti, mo, ulice, prometnice, vrtici_csv, geoportal)
- tema: tematski paket na karti i u dosjeu
- tip: vrijednost geo.objekt.tip za točkaste skupove
- polja: mapiranje kanonskih polja (naziv, adresa, telefon, email, web, cetvrt_naziv, vrsta)
  na kandidate iz izvora; prvi koji postoji se uzima
"""

from __future__ import annotations

from dataclasses import dataclass, field

CKAN_API = "https://data.zagreb.hr/api/3/action"

TEME: dict[str, str] = {
    "prostor": "Prostor i granice",
    "zivo": "Danas i ovaj tjedan",
    "obrazovanje": "Ustanove i obrazovanje",
    "skrb_zdravlje": "Skrb i zdravlje",
    "sport_kultura": "Sport i kultura",
    "okolis": "Okoliš i komunalno",
    "mobilnost": "Mobilnost",
    "usluge": "Svakodnevne usluge",
    "demokracija": "Lokalna demokracija i uprava",
    "meta": "Metapodaci",
}

# Uobičajena Geoportal polja; skupovi s drukčijim nazivima to pregaze.
GEOPORTAL_POLJA: dict[str, tuple[str, ...]] = {
    "naziv": ("naziv", "Naziv", "NAZIV", "Naziv_stajališta", "lokacija", "Lokacija"),
    "adresa": ("adresa", "Adresa", "ADRESA", "ADRESA_LOK"),
    "telefon": ("telefon", "tel", "Telefon", "TELEFON"),
    "email": ("email", "Email", "EMAIL", "E_MAIL"),
    "web": ("web", "Web", "WEB"),
    "cetvrt_naziv": (
        "GRAD_CETVRT",
        "gradska_cetvrt",
        "Gradska_cetvrt",
        "GRADSKA_CETVRT",
        "grad_cetvrt",
        "grad_cetv",
        "IME_GC",
        "naziv_gc",
        "GC",
        "gc",
    ),
    "vrsta": (
        "vrsta",
        "Vrsta",
        "VRSTA",
        "vrsta_obr_prog",
        "vr_ob_pr",
        "kategorija",
        "Vrsta_objekta",
        "tip_postaje",
        "tip_zdenca",
    ),
}


@dataclass(frozen=True)
class Skup:
    sifra: str
    paket_id: str
    naziv: str
    azurnost: str
    handler: str
    tema: str
    tip: str = ""
    preferirani_format: str = "GeoJSON"
    frekvencija: str = "rucno"
    napomena: str = ""
    polja: dict[str, tuple[str, ...]] = field(default_factory=lambda: dict(GEOPORTAL_POLJA))
    # tocka | linija | poligon | tablica — kako se prikazuje na karti (tablica = nije na karti)
    geometrija: str = "tocka"

    @property
    def ckan_url(self) -> str:
        return f"https://data.zagreb.hr/dataset/{self.paket_id}"


def _geoportal(
    sifra: str,
    paket_id: str,
    naziv: str,
    tema: str,
    tip: str,
    napomena: str = "Geoportal snimka ~2022./2023.",
    polja: dict[str, tuple[str, ...]] | None = None,
    geometrija: str = "tocka",
    azurnost: str = "starija_snimka",
) -> Skup:
    p = dict(GEOPORTAL_POLJA)
    if polja:
        p.update(polja)
    return Skup(
        sifra=sifra,
        paket_id=paket_id,
        naziv=naziv,
        azurnost=azurnost,
        handler="geoportal",
        tema=tema,
        tip=tip,
        preferirani_format="GeoJSON",
        frekvencija="rucno",
        napomena=napomena,
        polja=p,
        geometrija=geometrija,
    )


# Redoslijed je bitan: prostor prije točaka (pridruživanje četvrti / MO).
SKUPOVI: dict[str, Skup] = {
    # ---- prostor ----
    "cetvrti": Skup(
        sifra="cetvrti",
        paket_id="gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba",
        naziv="Gradske četvrti",
        azurnost="godina",
        handler="cetvrti",
        tema="prostor",
        preferirani_format="SHP",
        napomena="Granice 17 četvrti (SHP, HTRS96)",
        geometrija="poligon",
    ),
    "mo": Skup(
        sifra="mo",
        paket_id="mjesni-odbori-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba",
        naziv="Mjesni odbori",
        azurnost="godina",
        handler="mo",
        tema="prostor",
        preferirani_format="SHP",
        napomena="Granice 218 MO (SHP, HTRS96); MBR_NADR = četvrt",
        geometrija="poligon",
    ),
    "ulice": Skup(
        sifra="ulice",
        paket_id="registar-naziva-ulica-adresna-prostorna-jedinica-za-podrucje-grada-zagreba",
        naziv="Registar naziva ulica",
        azurnost="godina",
        handler="ulice",
        tema="prostor",
        preferirani_format="CSV",
        napomena="Tablica bez geometrije; služi normalizaciji adresa",
        geometrija="tablica",
    ),
    # ---- živo ----
    "prometnice": Skup(
        sifra="prometnice",
        paket_id="prometnice",
        naziv="Zatvaranje prometnica",
        azurnost="danas",
        handler="prometnice",
        tema="zivo",
        tip="zatvorena_cesta",
        preferirani_format="JSON",
        frekvencija="dnevno",
        napomena="Waze/CKAN linije zatvaranja",
        geometrija="linija",
    ),
    "vrtici": Skup(
        sifra="vrtici",
        paket_id="gradski_vrtici_grada_zagreba",
        naziv="Gradski vrtići — kontakt",
        azurnost="tjedan",
        handler="vrtici_csv",
        tema="obrazovanje",
        tip="vrtic",
        preferirani_format="CSV",
        frekvencija="tjedno",
        napomena="Naziv, adresa, X/Y, četvrt",
    ),
    "privatni_vrtici": Skup(
        sifra="privatni_vrtici",
        paket_id="privatni-vjerski-obrti-gz-kontakt-podaci",
        naziv="Privatni i vjerski vrtići, obrti za čuvanje djece",
        azurnost="tjedan",
        handler="vrtici_csv",
        tema="obrazovanje",
        tip="vrtic_privatni",
        preferirani_format="CSV",
        frekvencija="tjedno",
        napomena="Isti oblik kao gradski vrtići",
    ),
    # ---- obrazovanje ----
    "osnovne": _geoportal(
        "osnovne", "geoportal-osnovne-skole", "Geoportal Osnovne škole", "obrazovanje", "osnovna"
    ),
    "srednje": _geoportal(
        "srednje", "geoportal-srednje-skole", "Geoportal Srednje škole", "obrazovanje", "srednja"
    ),
    "ucenicki_domovi": _geoportal(
        "ucenicki_domovi",
        "geoportal-ucenicki-domovi",
        "Geoportal Učenički domovi",
        "obrazovanje",
        "ucenicki_dom",
    ),
    "visoka": _geoportal(
        "visoka",
        "geoportal-visokoskolske-ustanove",
        "Geoportal Visokoškolske ustanove",
        "obrazovanje",
        "visoko_uciliste",
    ),
    # ---- skrb i zdravlje ----
    "zdravstvo": _geoportal(
        "zdravstvo",
        "geoportal-zdravstvene-ustanove",
        "Geoportal Zdravstvene ustanove",
        "skrb_zdravlje",
        "zdravstvena_ustanova",
    ),
    "domovi_zdravlja": _geoportal(
        "domovi_zdravlja",
        "geoportal-domovi-zdravlja",
        "Geoportal Domovi zdravlja",
        "skrb_zdravlje",
        "dom_zdravlja",
        polja={
            "naziv": ("Domovi_zdravlja_naziv",),
            "adresa": ("Domovi_zdravlja_adresa",),
            "telefon": ("Domovi_zdravlja_telefon",),
            "web": ("Domovi_zdravlja_web",),
        },
    ),
    "stariji": _geoportal(
        "stariji",
        "geoportal-domovi-za-starije-osobe",
        "Geoportal Domovi za starije osobe",
        "skrb_zdravlje",
        "dom_stariji",
    ),
    "osi": _geoportal(
        "osi",
        "geoportal-ustanove-za-osobe-s-invaliditetom",
        "Geoportal Ustanove za osobe s invaliditetom",
        "skrb_zdravlje",
        "ustanova_osi",
    ),
    "domovi_djeca": _geoportal(
        "domovi_djeca",
        "geoportal-domovi-za-djecu",
        "Geoportal Domovi za djecu",
        "skrb_zdravlje",
        "dom_djeca",
        napomena="GeoJSON na CKAN-u (2025.)",
    ),
    "odmorko": _geoportal(
        "odmorko",
        "geoportal-odmorko",
        "Geoportal Odmorko",
        "skrb_zdravlje",
        "odmorko",
        polja={"naziv": ("lokacija",), "vrsta": ("sport", "grupa")},
    ),
    # ---- sport i kultura ----
    "sport": _geoportal(
        "sport", "geoportal-sportski-objekti", "Geoportal Sportski objekti", "sport_kultura", "sport"
    ),
    "kultura": _geoportal(
        "kultura",
        "geoportal-kulturne-ustanove",
        "Geoportal Kulturne ustanove",
        "sport_kultura",
        "kultura",
    ),
    "igralista": _geoportal(
        "igralista",
        "geoportal-javna-igralista",
        "Geoportal javna sportska igrališta",
        "sport_kultura",
        "igraliste",
        napomena="Geoportal 2023.; bez adrese, samo lokacija i MO",
        polja={"naziv": (), "adresa": ("lokacija",), "cetvrt_naziv": ("Gradska_cetvrt",)},
    ),
    # ---- lokalna demokracija i uprava ----
    "sjedista_gc": _geoportal(
        "sjedista_gc",
        "geoportal-sjedista-gradskih-cetvrti",
        "Geoportal Sjedišta gradskih četvrti",
        "demokracija",
        "sjediste_gc",
        napomena="Adresa, kontakt i primanje stranaka; Geoportal 2023.",
    ),
    "sjedista_mo": _geoportal(
        "sjedista_mo",
        "geoportal-mjesna-samouprava",
        "Geoportal Mjesna samouprava (sjedišta MO)",
        "demokracija",
        "sjediste_mo",
        napomena="Sjedišta 218 mjesnih odbora; Geoportal 2023.",
        polja={"naziv": ("MO",), "adresa": ("adresa_sjedista_MO",)},
    ),
    "podrucni_uredi": _geoportal(
        "podrucni_uredi",
        "geoportal-podrucni-uredi",
        "Geoportal Područni uredi",
        "demokracija",
        "podrucni_ured",
        napomena="Područni uredi Gradske uprave; Geoportal 2023.",
    ),
    "podrucni_odsjeci": _geoportal(
        "podrucni_odsjeci",
        "podrucni_odsjeci",
        "Geoportal Područni odsjeci",
        "demokracija",
        "podrucni_odsjek",
        napomena="Područja komunalnog i prometnog redarstva (poligoni); CKAN 2026.",
        polja={"naziv": ("PO",), "adresa": (), "cetvrt_naziv": ("GC",)},
        geometrija="poligon",
        azurnost="godina",
    ),
    "predsjednici_gc": Skup(
        sifra="predsjednici_gc",
        paket_id="predsjednici_gradskih_cetvrti_grada_zagreba_2025",
        naziv="Predsjednici gradskih četvrti 2025.",
        azurnost="godina",
        handler="predsjednici_gc",
        tema="demokracija",
        preferirani_format="JSON",
        napomena="Ime, adresa, telefon, e-pošta; kartica na dosjeu",
        geometrija="tablica",
    ),
    "clanovi_gc": Skup(
        sifra="clanovi_gc",
        paket_id="clanovi-vijeca-gradskih-cetvrti",
        naziv="Članovi vijeća gradskih četvrti",
        azurnost="godina",
        handler="clanovi_vijeca",
        tema="demokracija",
        tip="gc",
        preferirani_format="CSV",
        napomena="Tablica na dosjeu; nije karta pinova",
        geometrija="tablica",
    ),
    "predsjednici_mo": Skup(
        sifra="predsjednici_mo",
        paket_id="predsjednici-mjesnih-odbora-grada-zagreba",
        naziv="Predsjednici mjesnih odbora",
        azurnost="godina",
        handler="predsjednici_mo",
        tema="demokracija",
        preferirani_format="CSV",
        napomena="Ime, adresa MO, kontakt",
        geometrija="tablica",
    ),
    "clanovi_mo": Skup(
        sifra="clanovi_mo",
        paket_id="clanovi-vijeca-mjesnih-odbora",
        naziv="Članovi vijeća mjesnih odbora",
        azurnost="godina",
        handler="clanovi_vijeca",
        tema="demokracija",
        tip="mo",
        preferirani_format="CSV",
        napomena="Tablica na dosjeu",
        geometrija="tablica",
    ),
    "prostori_ms": Skup(
        sifra="prostori_ms",
        paket_id="prostori-mjesne-samouprave-grada-zagreba",
        naziv="Prostori mjesne samouprave",
        azurnost="danas",
        handler="prostori_ms",
        tema="demokracija",
        preferirani_format="JSON",
        frekvencija="dnevno",
        napomena="Sažetak po MO (broj prostorija, termini); nije rezervacija",
        geometrija="tablica",
    ),
    # ---- energija (ISGE) ----
    "isge": Skup(
        sifra="isge",
        paket_id="podaci-o-potrosnji-i-trosku-za-objekte-grada-zagreba",
        naziv="ISGE — potrošnja i trošak energije gradskih objekata",
        azurnost="godina",
        handler="isge",
        tema="energija",
        tip="isge_objekt",
        preferirani_format="CSV",
        napomena="Mjesečno po objektu i energentu, 01/2019–06/2024 (objavljeno 02/2025). Objekti spojeni na registar adresom/nazivom; nespojeni su samo u tablici.",
        geometrija="tocka",
    ),
    # ---- obrazovanje (dopuna) ----
    "studentski_restorani": _geoportal(
        "studentski_restorani",
        "geoportal-studentski-restoran",
        "Geoportal Studentski restorani",
        "obrazovanje",
        "studentski_restoran",
        napomena="CKAN GeoJSON 2026.",
        azurnost="godina",
    ),
    "studentska_naselja": _geoportal(
        "studentska_naselja",
        "geoportal-studentsko-naselje",
        "Geoportal Studentska naselja",
        "obrazovanje",
        "studentsko_naselje",
        napomena="CKAN GeoJSON 2026.",
        azurnost="godina",
    ),
    # ---- skrb (dopuna) ----
    "soc_skrb": _geoportal(
        "soc_skrb",
        "geoportal-centar-za-socijalnu-skrb",
        "Geoportal Hrvatski zavod za socijalni rad",
        "skrb_zdravlje",
        "soc_skrb",
    ),
    "beskucnici": _geoportal(
        "beskucnici",
        "geoportal-ustanove-za-beskucnike",
        "Geoportal Ustanove za beskućnike",
        "skrb_zdravlje",
        "ustanova_beskucnici",
    ),
    "branitelji": _geoportal(
        "branitelji",
        "geoportal-ustanove-za-branitelje",
        "Geoportal Ustanove za branitelje",
        "skrb_zdravlje",
        "ustanova_branitelji",
    ),
    # ---- okoliš i komunalno ----
    "reciklazna": _geoportal(
        "reciklazna",
        "reciklazna-dvorista-grada-zagreba1",
        "Geoportal Reciklažna dvorišta",
        "okolis",
        "reciklazno_dvoriste",
        polja={"naziv": ("NAZIV",), "adresa": ("ADRESA", "ADRESA_LOK")},
    ),
    "podzemni_spremnici": _geoportal(
        "podzemni_spremnici",
        "geoportal_podzemni_spremnik",
        "Geoportal Podzemni spremnici za otpad",
        "okolis",
        "podzemni_spremnik",
        napomena="CKAN GeoJSON 2026.; status izvedbe u atributima",
        polja={"naziv": ("Spremnik",), "adresa": (), "vrsta": (), "cetvrt_naziv": ("JMS_IME_1",)},
        azurnost="godina",
    ),
    "polupodzemni_spremnici": _geoportal(
        "polupodzemni_spremnici",
        "polupodzemni_spremnik",
        "Geoportal Polupodzemni spremnici za otpad",
        "okolis",
        "polupodzemni_spremnik",
        napomena="CKAN GeoJSON 2026.; status izvedbe u atributima",
        polja={"naziv": (), "adresa": ("adrese",), "vrsta": (), "cetvrt_naziv": ("JMS_IME",)},
        azurnost="godina",
    ),
    "javni_zdenci": _geoportal(
        "javni_zdenci",
        "geoportal_javni_zdenci",
        "Geoportal Javni zdenci",
        "okolis",
        "javni_zdenac",
        napomena="Komunalna infrastruktura; CKAN GeoJSON 2026., često ažurirano",
        polja={
            "naziv": ("lokacija",),
            "adresa": ("napomena_teren",),
            "vrsta": ("tip_zdenca",),
            "cetvrt_naziv": ("naziv_gc",),
        },
        azurnost="mjesec",
    ),
    "povrsine_pse": _geoportal(
        "povrsine_pse",
        "geoportal-javne-povrsine-za-pse",
        "Geoportal Javne površine za pse",
        "okolis",
        "povrsina_pse",
        polja={"naziv": (), "adresa": ("Lokacija",), "vrsta": ("Vrsta",), "cetvrt_naziv": ("GC",)},
    ),
    "gradski_vrtovi": _geoportal(
        "gradski_vrtovi",
        "geoportal-gradski-vrt-point",
        "Geoportal Gradski vrtovi",
        "okolis",
        "gradski_vrt",
    ),
    "kvaliteta_zraka": _geoportal(
        "kvaliteta_zraka",
        "geoportal-kvaliteta-zraka",
        "Geoportal Mjerne postaje kvalitete zraka",
        "okolis",
        "postaja_zrak",
        napomena="Lokacije postaja; mjerenja su na eko.zagreb.hr",
        polja={"adresa": ("opis_lokac",), "vrsta": ("tip_postaje",)},
    ),
    # ---- mobilnost ----
    "bus_stajalista": _geoportal(
        "bus_stajalista",
        "autobusna-stajalista-zet",
        "Geoportal Autobusna stajališta ZET",
        "mobilnost",
        "bus_stajaliste",
        napomena="CKAN GeoJSON 2026.; pristupačnost i oprema u atributima",
        polja={"naziv": ("Naziv_stajališta",), "adresa": ("Opis",)},
        azurnost="godina",
    ),
    "tram_stajalista": _geoportal(
        "tram_stajalista",
        "geoportal-tramvajska-stajalista-zet",
        "Geoportal Tramvajska stajališta ZET",
        "mobilnost",
        "tram_stajaliste",
        polja={"naziv": ("Naziv_stajališta",), "adresa": ("Opis",)},
    ),
    "hz_stajalista": _geoportal(
        "hz_stajalista",
        "zeljeznicka-stajalista-hz",
        "Geoportal Željeznička stajališta HŽ",
        "mobilnost",
        "hz_stajaliste",
        napomena="CKAN GeoJSON 2026.",
        polja={"naziv": ("Naziv",), "adresa": (), "vrsta": ("Vrsta",)},
        azurnost="godina",
    ),
    "garaze": _geoportal(
        "garaze",
        "geoportal-javne-garaze",
        "Geoportal Javne garaže",
        "mobilnost",
        "garaza",
    ),
    "bicikl_parking": _geoportal(
        "bicikl_parking",
        "geoportal-javna-parkiralista-za-bicikle",
        "Geoportal Javna parkirališta za bicikle",
        "mobilnost",
        "parkiraliste_bicikli",
        polja={"adresa": ("lokacija",), "cetvrt_naziv": ("GRADSKA_CETVRT",)},
    ),
    "javni_bicikli": _geoportal(
        "javni_bicikli",
        "geoportal-sustav-javnih-bicikala",
        "Geoportal Sustav javnih bicikala",
        "mobilnost",
        "javni_bicikli",
        polja={"adresa": ("lokacija",)},
    ),
    "ev_punionice": _geoportal(
        "ev_punionice",
        "geoportal-elektricne-punionice",
        "Geoportal Električne punionice",
        "mobilnost",
        "ev_punionica",
        polja={"naziv": ("NAZIV",), "adresa": ("ADRESA",), "vrsta": ("TIP_UTICNICE",)},
    ),
    "taxi": _geoportal(
        "taxi",
        "geoportal-taxi-stajalista",
        "Geoportal Taxi stajališta",
        "mobilnost",
        "taxi_stajaliste",
        polja={"naziv": (), "adresa": ("lokacija",)},
    ),
    "bic_staze": _geoportal(
        "bic_staze",
        "geoportal-biciklisticke-staze",
        "Geoportal Biciklističke staze",
        "mobilnost",
        "bic_staza",
        napomena="Linije (2.889 segmenata); duljina i završni sloj u atributima",
        polja={"naziv": (), "adresa": ("lokacija",), "vrsta": ("kategorija_id",), "cetvrt_naziv": ("GRADSKA_CETVRT",)},
        geometrija="linija",
    ),
    # ---- svakodnevne usluge ----
    "trznice": _geoportal(
        "trznice", "geoportal-gradske-trznice", "Geoportal Gradske tržnice", "usluge", "trznica"
    ),
    "ljekarne": _geoportal(
        "ljekarne", "geoportal-ljekarne", "Geoportal Ljekarne", "usluge", "ljekarna"
    ),
    "benzinske": _geoportal(
        "benzinske",
        "geoportal-benzinske-postaje",
        "Geoportal Benzinske postaje",
        "usluge",
        "benzinska",
        polja={"naziv": ("NAZIV",), "adresa": ("ADRESA",)},
    ),
    "wifi": _geoportal(
        "wifi",
        "geoportal-besplatna-wifi-mreza",
        "Geoportal Besplatna WiFi mreža",
        "usluge",
        "wifi",
        polja={"naziv": ("Lokacija",), "adresa": (), "cetvrt_naziv": ("IME_GC",)},
    ),
    "vatrogasci": _geoportal(
        "vatrogasci", "geoportal-vatrogasci", "Geoportal Vatrogasci", "usluge", "vatrogasci"
    ),
    "policija": _geoportal(
        "policija", "geoportal-policija", "Geoportal Policija", "usluge", "policija"
    ),
}
