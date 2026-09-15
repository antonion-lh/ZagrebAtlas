export default function NotFound() {
  return (
    <div className="stranica">
      <h1>Stranica nije pronađena</h1>
      <p className="uvod">
        Te adrese nema. Možda je četvrt ili objekt uklonjen iz izvora, ili je u adresi pogreška.
      </p>
      <p>
        <a href="/">Karta</a>
        {" · "}
        <a href="/cetvrti">Četvrti</a>
        {" · "}
        <a href="/ustanove">Ustanove</a>
      </p>
    </div>
  );
}
