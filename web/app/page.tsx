import type { Metadata } from "next";
import { AtlasKarta } from "@/components/AtlasKarta";
import { ucitajCetvrtiKratko, ucitajMetaSlojeva, type CetvrtKratko, type SlojMeta } from "@/lib/slojevi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Karta grada — Zagreb Gradski atlas" },
  description: "Karta otvorenih podataka Grada Zagreba: četvrti, ustanove, zatvorene ceste. Svaki sloj kaže koliko je podatak star.",
};

export default async function HomePage() {
  let slojevi: SlojMeta[] = [];
  let cetvrti: CetvrtKratko[] = [];
  let greska: string | null = null;

  try {
    [slojevi, cetvrti] = await Promise.all([ucitajMetaSlojeva(), ucitajCetvrtiKratko()]);
  } catch {
    greska = "da";
  }

  if (greska) {
    return (
      <div className="stranica">
        <h1>Karta grada</h1>
        <p role="alert">Karta se trenutačno ne može učitati. Pokušajte ponovo za koji trenutak.</p>
      </div>
    );
  }

  return <AtlasKarta slojevi={slojevi} cetvrti={cetvrti} />;
}
