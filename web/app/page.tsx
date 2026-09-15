import { AtlasKarta } from "@/components/AtlasKarta";
import { ucitajCetvrtiKratko, ucitajMetaSlojeva, type CetvrtKratko, type SlojMeta } from "@/lib/slojevi";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Karta grada",
  description: "Interaktivna karta otvorenih podataka Grada Zagreba po temama, s oznakom ažurnosti svakog sloja.",
};

export default async function HomePage() {
  let slojevi: SlojMeta[] = [];
  let cetvrti: CetvrtKratko[] = [];
  let greska: string | null = null;

  try {
    [slojevi, cetvrti] = await Promise.all([ucitajMetaSlojeva(), ucitajCetvrtiKratko()]);
  } catch (e) {
    greska = e instanceof Error ? e.message : "Greška baze";
  }

  if (greska) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1>Karta grada</h1>
        <p role="alert">Baza nije dostupna: {greska}</p>
      </div>
    );
  }

  return <AtlasKarta slojevi={slojevi} cetvrti={cetvrti} />;
}
