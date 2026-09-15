import Link from "next/link";
import { popisCetvrti } from "@/lib/cetvrt-dosje";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gradske četvrti",
  description: "Sedamnaest gradskih četvrti Zagreba: mjesni odbori, ustanove, vijeća i energija iz otvorenih podataka.",
};

export default async function CetvrtiPopisPage() {
  const cetvrti = await popisCetvrti();

  return (
    <div className="stranica">
      <h1>Gradske četvrti</h1>
      <p className="uvod">
        Sedamnaest četvrti, svaka sa svojim mjesnim odborima i onim što Grad o njoj objavljuje. Ovo je popis,
        ne ocjena kvarta.
      </p>
      <ul className="popis-cetvrti">
        {cetvrti.map((c) => (
          <li key={c.id}>
            <Link href={`/cetvrti/${c.slug}`}>{c.naziv}</Link>
            <span>
              {c.broj_mo} mjesnih odbora · {c.broj_objekata.toLocaleString("hr-HR")} objekata
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
