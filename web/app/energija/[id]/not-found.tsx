import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stranica">
      <h1>Objekt nije pronađen</h1>
      <p className="uvod">Nema gradskog objekta s tim brojem u ISGE-u.</p>
      <p>
        <Link href="/energija">Natrag na pregled energije</Link>
      </p>
    </div>
  );
}
