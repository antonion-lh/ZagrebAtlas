/** Hrvatski nazivi atributa u inspectoru (izvorni ključevi ostaju u podacima). */
const ATRIBUT: Record<string, string> = {
  vrsta: "Vrsta",
  podtip: "Podvrsta",
  smjer: "Smjer",
  napomena: "Napomena",
  opis: "Opis",
  kapacitet: "Kapacitet",
  radno_vrijeme: "Radno vrijeme",
  primanje_stranaka: "Primanje stranaka",
  sjediste: "Smješteno u",
  maticni_podrucni: "Matični ili područni",
  cetvrt_naziv: "Četvrt (izvor)",
  linija: "Linija",
  broj: "Broj",
  sifra: "Šifra",
  naziv_objekta: "Naziv objekta",
  status: "Stanje",
  povrsina: "Površina",
  godina: "Godina",
  vlasnik: "Vlasnik",
  upravitelj: "Upravitelj",
  namjena: "Namjena",
  kategorija: "Kategorija",
  zona: "Zona",
  naselje: "Naselje",
  kjuc: "Ključ",
  objectid: "Identifikator izvora",
};

const SKRIVENO_DONJE = new Set([
  "id",
  "skup",
  "naziv",
  "adresa",
  "tip",
  "cetvrt_id",
  "cetvrt",
  "cetvrt_slug",
  "mo",
  "ostalo",
  "slug",
  "telefon",
  "email",
  "web",
  "cetvrt_naziv",
  "objectid",
  "objectid_1",
  "globalid",
  "fid",
  "oid",
  "gid",
  "shape_length",
  "shape_area",
  "shape_leng",
  "geom",
  "geometry",
  "lon",
  "lat",
  "x",
  "y",
  "energy_id",
  "godine",
]);

export function atributSkriven(kljuc: string): boolean {
  return SKRIVENO_DONJE.has(kljuc.toLowerCase());
}

export function nazivAtributa(kljuc: string): string {
  const donje = kljuc.toLowerCase();
  if (ATRIBUT[donje]) return ATRIBUT[donje];
  if (ATRIBUT[kljuc]) return ATRIBUT[kljuc];
  const s = kljuc.replaceAll("_", " ").trim();
  if (!s) return kljuc;
  return s.charAt(0).toLocaleUpperCase("hr") + s.slice(1);
}
