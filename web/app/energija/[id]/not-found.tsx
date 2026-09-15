import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ maxWidth: "40rem", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <h1>Objekt nije pronađen</h1>
      <p>
        Nema ISGE objekta s tim identifikatorom. <Link href="/energija">Natrag na pregled energije</Link>.
      </p>
    </div>
  );
}
