/** Rate limit u memoriji procesa (dovoljno za jedan web kontejner iza edgea). */

export const API_MAX_PO_MIN = 180;
export const API_PROZOR_MS = 60_000;
/** Ortofoto WMS proxy — skupo; stroži limit po IP. */
export const ORTO_MAX_PO_MIN = 240;
export const ORTO_PROZOR_MS = 60_000;
/** Teški izvozi (gold / ISGE potrošnja). */
export const IZVOZ_MAX_PO_MIN = 30;
export const IZVOZ_PROZOR_MS = 60_000;

const mape = {
  api: new Map<string, number[]>(),
  orto: new Map<string, number[]>(),
  izvoz: new Map<string, number[]>(),
};

export function klijentIp(req: { headers: Headers }): string {
  const x = req.headers.get("x-forwarded-for");
  if (x) return x.split(",")[0]?.trim() || "nepoznat";
  return req.headers.get("x-real-ip") || "nepoznat";
}

export function dopusteno(
  mapa: Map<string, number[]>,
  kljuc: string,
  max: number,
  prozorMs: number
): boolean {
  const sad = Date.now();
  const stari = (mapa.get(kljuc) || []).filter((t) => sad - t < prozorMs);
  if (stari.length >= max) {
    mapa.set(kljuc, stari);
    return false;
  }
  stari.push(sad);
  mapa.set(kljuc, stari);
  // Povremeno čisti stare ključeve da mapa ne raste bezgrančno.
  if (mapa.size > 5_000 && Math.random() < 0.01) {
    for (const [k, v] of mapa) {
      const svjezi = v.filter((t) => sad - t < prozorMs);
      if (svjezi.length) mapa.set(k, svjezi);
      else mapa.delete(k);
    }
  }
  return true;
}

export function limitZaPutanju(pathname: string): {
  mapa: Map<string, number[]>;
  max: number;
  prozorMs: number;
} {
  if (pathname.startsWith("/api/podloga/ortofoto")) {
    return { mapa: mape.orto, max: ORTO_MAX_PO_MIN, prozorMs: ORTO_PROZOR_MS };
  }
  if (
    pathname.startsWith("/api/tablica/isge_potrosnja") ||
    pathname.startsWith("/api/tablica/gold_") ||
    pathname.startsWith("/api/izvoz/")
  ) {
    return { mapa: mape.izvoz, max: IZVOZ_MAX_PO_MIN, prozorMs: IZVOZ_PROZOR_MS };
  }
  return { mapa: mape.api, max: API_MAX_PO_MIN, prozorMs: API_PROZOR_MS };
}

/** Tablice koje u JSON-u mogu pasti preglednik / edge — samo CSV. */
export const TEK_CSV = new Set(["isge_potrosnja", "gold_objekti", "gold_isge_godina"]);
