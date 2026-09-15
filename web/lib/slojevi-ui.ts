// Čiste konstante za klijent i server (bez pg).

export const TEME: { sifra: string; naziv: string }[] = [
  { sifra: "prostor", naziv: "Prostor i granice" },
  { sifra: "zivo", naziv: "Danas i ovaj tjedan" },
  { sifra: "obrazovanje", naziv: "Ustanove i obrazovanje" },
  { sifra: "skrb_zdravlje", naziv: "Skrb i zdravlje" },
  { sifra: "sport_kultura", naziv: "Sport i kultura" },
  { sifra: "okolis", naziv: "Okoliš i komunalno" },
  { sifra: "mobilnost", naziv: "Mobilnost" },
  { sifra: "usluge", naziv: "Svakodnevne usluge" },
  { sifra: "energija", naziv: "Energija gradskih objekata" },
  { sifra: "demokracija", naziv: "Lokalna demokracija i uprava" },
  { sifra: "meta", naziv: "Metapodaci" },
];

export const TEMA_NAZIV: Record<string, string> = Object.fromEntries(
  TEME.map((t) => [t.sifra, t.naziv])
);

export const AZURNOST: Record<string, string> = {
  danas: "danas",
  tjedan: "tjedan",
  mjesec: "mjesec",
  godina: "godina",
  starija_snimka: "starija snimka",
};

export const AZURNOST_OPIS: Record<string, string> = {
  danas: "Grad ovo osvježava svaki dan; Atlas preuzima svaki dan.",
  tjedan: "Izvor se mijenja otprilike jednom tjedno.",
  mjesec: "Izvor se mijenja otprilike jednom mjesečno.",
  godina: "Izvor se mijenja rijetko, otprilike jednom godišnje.",
  starija_snimka:
    "Snimka Geoportala ili stariji skup, većinom iz 2022. ili 2023. Možda više ne odgovara ulici.",
};

export const TIP_NAZIV: Record<string, string> = {
  zatvorena_cesta: "Zatvorena prometnica",
  vrtic: "Gradski vrtić",
  vrtic_privatni: "Privatni ili vjerski vrtić / obrt",
  osnovna: "Osnovna škola",
  srednja: "Srednja škola",
  ucenicki_dom: "Učenički dom",
  visoko_uciliste: "Visoko učilište",
  zdravstvena_ustanova: "Zdravstvena ustanova",
  dom_zdravlja: "Dom zdravlja",
  dom_stariji: "Dom za starije osobe",
  ustanova_osi: "Ustanova za osobe s invaliditetom",
  dom_djeca: "Dom za djecu",
  odmorko: "Odmorko",
  sport: "Sportski objekt",
  kultura: "Kulturna ustanova",
  igraliste: "Javno igralište",
  sjediste_gc: "Sjedište gradske četvrti",
  sjediste_mo: "Sjedište mjesnog odbora",
  podrucni_ured: "Područni ured Gradske uprave",
  podrucni_odsjek: "Područni odsjek komunalnog i prometnog redarstva",
  studentski_restoran: "Studentski restoran",
  studentsko_naselje: "Studentsko naselje",
  soc_skrb: "Hrvatski zavod za socijalni rad",
  ustanova_beskucnici: "Ustanova za beskućnike",
  ustanova_branitelji: "Ustanova za branitelje",
  reciklazno_dvoriste: "Reciklažno dvorište",
  podzemni_spremnik: "Podzemni spremnik za otpad",
  polupodzemni_spremnik: "Polupodzemni spremnik za otpad",
  javni_zdenac: "Javni zdenac",
  povrsina_pse: "Javna površina za pse",
  gradski_vrt: "Gradski vrt",
  postaja_zrak: "Mjerna postaja kvalitete zraka",
  bus_stajaliste: "Autobusno stajalište ZET",
  tram_stajaliste: "Tramvajsko stajalište ZET",
  hz_stajaliste: "Željezničko stajalište HŽ",
  garaza: "Javna garaža",
  parkiraliste_bicikli: "Parkiralište za bicikle",
  javni_bicikli: "Stanica javnih bicikala",
  ev_punionica: "Električna punionica",
  taxi_stajaliste: "Stajalište taksija",
  bic_staza: "Biciklistička staza",
  trznica: "Gradska tržnica",
  ljekarna: "Ljekarna",
  benzinska: "Benzinska postaja",
  wifi: "Besplatna WiFi točka",
  vatrogasci: "Vatrogasna postrojba / DVD",
  policija: "Policijska postaja",
  javni_wc: "Javni WC",
  pojilica: "Pojilica s pitkom vodom",
  pjesacka_zona: "Pješačka zona",
  signalizator: "Raskrižje sa zvučnim signalizatorom",
  zeleni_otok: "Zeleni otok",
  odgojno: "Odgojno-obrazovni objekt",
  gtfs_ruta: "ZET linija (statični raspored)",
  isge_objekt: "Gradski objekt u ISGE-u (energija)",
};

const TEMA_BOJA: Record<string, string> = {
  prostor: "#2f5d3a",
  zivo: "#b45309",
  obrazovanje: "#1d4ed8",
  skrb_zdravlje: "#be123c",
  sport_kultura: "#7c3aed",
  okolis: "#15803d",
  mobilnost: "#0e7490",
  usluge: "#a16207",
  energija: "#d97706",
  demokracija: "#4b5563",
  meta: "#6b7280",
};

const SKUP_BOJA: Record<string, string> = {
  mo: "#6b8f71",
  vrtici: "#1d4ed8",
  privatni_vrtici: "#60a5fa",
  osnovne: "#4338ca",
  srednje: "#7c3aed",
  ucenicki_domovi: "#a78bfa",
  visoka: "#312e81",
  zdravstvo: "#be123c",
  domovi_zdravlja: "#f43f5e",
  stariji: "#9f1239",
  osi: "#db2777",
  domovi_djeca: "#f472b6",
  odmorko: "#fb7185",
  sport: "#7c3aed",
  kultura: "#c026d3",
  igralista: "#a855f7",
  sjedista_gc: "#111827",
  sjedista_mo: "#6b7280",
  podrucni_uredi: "#374151",
  podrucni_odsjeci: "#9ca3af",
  studentski_restorani: "#2563eb",
  studentska_naselja: "#1e3a8a",
  soc_skrb: "#e11d48",
  beskucnici: "#be185d",
  branitelji: "#9d174d",
  reciklazna: "#15803d",
  podzemni_spremnici: "#166534",
  polupodzemni_spremnici: "#22c55e",
  javni_zdenci: "#0891b2",
  povrsine_pse: "#65a30d",
  gradski_vrtovi: "#4d7c0f",
  kvaliteta_zraka: "#0f766e",
  bus_stajalista: "#0e7490",
  tram_stajalista: "#1d4ed8",
  hz_stajalista: "#334155",
  garaze: "#475569",
  bicikl_parking: "#0d9488",
  javni_bicikli: "#14b8a6",
  ev_punionice: "#059669",
  taxi: "#ca8a04",
  bic_staze: "#0d9488",
  trznice: "#a16207",
  ljekarne: "#16a34a",
  benzinske: "#78350f",
  wifi: "#7c3aed",
  vatrogasci: "#dc2626",
  policija: "#1e40af",
  javni_wc: "#7c3aed",
  pojilice: "#0ea5e9",
  pjesacke_zone: "#a16207",
  signalizatori: "#db2777",
  zeleni_otoci: "#4d7c0f",
  odgojno: "#1e3a8a",
  gtfs_rute: "#0369a1",
  isge: "#f59e0b",
};

export function bojaSloja(sifra: string, tema: string): string {
  return SKUP_BOJA[sifra] || TEMA_BOJA[tema] || "#374151";
}

export type SlojMeta = {
  sifra: string;
  naziv: string;
  tema: string;
  tip: string | null;
  azurnost: string;
  ckan_url: string | null;
  broj: number;
  sink: string | null;
  napomena: string | null;
  vrsta: "poligon" | "linija" | "tocka" | "tablica";
  boja: string;
};

export type CetvrtKratko = {
  id: number;
  naziv: string;
  slug: string;
  bbox: [number, number, number, number];
};

/** Kraći naziv za legendu i dosje ("Geoportal Osnovne škole" → "Osnovne škole"). */
export function kratkiNaziv(naziv: string): string {
  const s = naziv.replace(/^Geoportal\s+/i, "").replace(/\s+—\s+kontakt$/i, "").trim();
  if (!s) return naziv;
  return s.charAt(0).toLocaleUpperCase("hr") + s.slice(1);
}

export function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString("hr-HR", { dateStyle: "short", timeStyle: "short" });
}
