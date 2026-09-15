import { pool } from "@/lib/db";
import { greskaPosluzitelja, jsonGreska } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

/**
 * GET /api/blizina?lon=&lat=&osim=&m=400
 * Točke u krugu (default 400 m), bez samog objekta.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lon = Number(sp.get("lon"));
  const lat = Number(sp.get("lat"));
  const osimRaw = sp.get("osim") || "";
  const osim = /^[0-9]{1,18}$/.test(osimRaw) ? osimRaw : "";
  const m = Math.min(800, Math.max(80, Number(sp.get("m")) || 400));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 15.5 || lon > 16.5 || lat < 45.5 || lat > 46.2) {
    return jsonGreska(400, "Neispravne koordinate");
  }
  try {
    const { rows } = await pool().query<{
      id: string;
      naziv: string | null;
      tip: string;
      skup: string;
      adresa: string | null;
      metara: number;
    }>(
      `SELECT o.id::text, o.naziv, o.tip, o.skup_sifra AS skup, o.adresa,
              round(ST_Distance(o.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography))::int AS metara
       FROM geo.objekt o
       WHERE GeometryType(o.geom) IN ('POINT', 'MULTIPOINT')
         AND ST_DWithin(o.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
         AND ($4 = '' OR o.id::text <> $4)
       ORDER BY o.geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326)
       LIMIT 8`,
      [lon, lat, m, osim]
    );
    return Response.json(
      { lon, lat, metara: m, objekti: rows },
      { headers: { "Cache-Control": "public, max-age=120" } }
    );
  } catch (e) {
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
