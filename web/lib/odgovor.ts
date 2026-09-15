/** Tekst koji smije otići klijentu. Interni trag ostaje u dnevniku poslužitelja. */
export const JAVNA_GRESKA = "Zahtjev se trenutačno ne može obaviti. Pokušajte ponovo.";

export function jsonGreska(status: number, poruka: string): Response {
  return Response.json({ greska: poruka }, { status });
}

export function greskaPosluzitelja(e: unknown): Response {
  console.error(e);
  return jsonGreska(500, JAVNA_GRESKA);
}

/** Tražilica i obrasci: skine upravljačke znakove, stisne razmake, skrati. */
export function ocistiUpit(q: string, max = 80): string {
  return q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function slugCetvrtiValjan(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}
