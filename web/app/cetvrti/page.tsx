import Link from "next/link";
import { popisCetvrti } from "@/lib/cetvrt-dosje";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gradske četvrti",
  description: "17 gradskih četvrti Zagreba s dosjeom: mjesni odbori, ustanove, lokalna demokracija, energija.",
};

export default async function CetvrtiPopisPage() {
  const cetvrti = await popisCetvrti();

  return (
    <div style={{ maxWidth: "44rem", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <h1 style={{ marginTop: 0 }}>Dosjei četvrti</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Inventar otvorenih podataka po gradskoj četvrti — ustanove, usluge, zatvaranja cesta i
        oznake ažurnosti. Nije ocjena kvarta.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0" }}>
        {cetvrti.map((c) => (
          <li
            key={c.id}
            style={{
              borderBottom: "1px solid var(--line)",
              padding: "0.7rem 0",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <Link href={`/cetvrti/${c.slug}`} style={{ fontWeight: 600, textDecoration: "none" }}>
              {c.naziv}
            </Link>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {c.broj_mo} MO · {c.broj_objekata} objekata
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
