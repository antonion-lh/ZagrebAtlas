export default function NotFound() {
  return (
    <div className="stranica">
      <h1>Četvrt nije pronađena</h1>
      <p className="uvod">Nema četvrti s tom adresom. Provjerite naziv ili se vratite na popis.</p>
      <p>
        <a href="/cetvrti">Sve gradske četvrti</a>
      </p>
    </div>
  );
}
