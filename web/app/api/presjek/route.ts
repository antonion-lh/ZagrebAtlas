import { pool } from "@/lib/db";
import { greskaPosluzitelja, jsonGreska } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

/**
 * GET /api/presjek?id=<geo.objekt.id>
 * Best-effort: zatvaranje ∩ biciklističke staze / pješačke zone, i obrnuto.
 */
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^0-9]/g, "");
  if (!id) return jsonGreska(400, "Nedostaje id");
  try {
    const { rows: vlastiti } = await pool().query<{ skup: string; tip: string }>(
      `SELECT skup_sifra AS skup, tip FROM geo.objekt WHERE id = $1`,
      [id]
    );
    if (!vlastiti.length) return jsonGreska(404, "Nepoznat objekt");
    const skup = vlastiti[0].skup;
    const drugi =
      skup === "prometnice"
        ? ["bic_staze", "pjesacke_zone"]
        : skup === "bic_staze" || skup === "pjesacke_zone"
          ? ["prometnice"]
          : [];
    if (!drugi.length) {
      return Response.json({ id, presjeci: [] }, { headers: { "Cache-Control": "public, max-age=120" } });
    }
    const { rows } = await pool().query<{
      id: string;
      naziv: string | null;
      skup: string;
      tip: string;
    }>(
      `SELECT o.id::text, o.naziv, o.skup_sifra AS skup, o.tip
       FROM geo.objekt o
       JOIN geo.objekt a ON a.id = $1
       WHERE o.skup_sifra = ANY($2)
         AND ST_Intersects(o.geom, a.geom)
       LIMIT 12`,
      [id, drugi]
    );
    return Response.json(
      { id, presjeci: rows },
      { headers: { "Cache-Control": "public, max-age=120" } }
    );
  } catch (e) {
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
