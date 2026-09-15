import { API_TOCKE, ucitajKatalog } from "@/lib/katalog";
import { greskaPosluzitelja } from "@/lib/odgovor";
import { AZURNOST_OPIS, TEMA_NAZIV } from "@/lib/slojevi-ui";

export const dynamic = "force-dynamic";

/** Strojno čitljiv katalog (DCAT-nalik, pojednostavljen). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const skupovi = await ucitajKatalog();
    return Response.json(
      {
        "@context": "https://www.w3.org/ns/dcat",
        "@type": "Catalog",
        title: "Zagreb Gradski atlas — katalog podataka",
        description:
          "Otvoreni podaci Grada Zagreba (data.zagreb.hr) učitani u Atlas, s oznakom ažurnosti i Atlasovim distribucijama (GeoJSON/CSV/JSON).",
        homepage: origin,
        license: "Podaci: Otvorena dozvola (OD), Grad Zagreb. Kôd Atlasa: MIT.",
        issued: new Date().toISOString(),
        azurnost: AZURNOST_OPIS,
        api: API_TOCKE.map((t) => ({ ...t, url: origin + t.url })),
        dataset: skupovi.map((s) => ({
          "@type": "Dataset",
          identifier: s.sifra,
          title: s.naziv,
          description: s.napomena,
          theme: { sifra: s.tema, naziv: TEMA_NAZIV[s.tema] || s.tema },
          spatialType: s.geometrija,
          accrualPeriodicity: s.azurnost,
          publisher: s.izdavac,
          license: s.licenca,
          landingPage: s.ckan_url,
          source: {
            ckanPackage: s.paket_id,
            title: s.ckan_naslov,
            description: s.ckan_opis,
            modified: s.ckan_izmjena,
            distribution: s.resursi.map((r) => ({
              title: r.naziv,
              format: r.format,
              downloadURL: r.url,
              byteSize: r.velicina,
              modified: r.izmjena,
            })),
          },
          modified: s.zadnja_sinkronizacija,
          recordCount: s.broj_zapisa,
          distribution: s.distribucije.map((d) => ({
            "@type": "Distribution",
            format: d.format,
            downloadURL: origin + d.url,
            description: d.opis,
          })),
        })),
      },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (e) {
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
