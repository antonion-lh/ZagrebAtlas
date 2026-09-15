"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="stranica">
      <h1>Nešto je pošlo po krivu</h1>
      <p className="uvod">Stranica se nije mogla prikazati. Podaci su vjerojatno u redu; pokušajte ponovo.</p>
      <button type="button" className="gumb" onClick={() => reset()}>
        Pokušaj ponovo
      </button>
    </div>
  );
}
