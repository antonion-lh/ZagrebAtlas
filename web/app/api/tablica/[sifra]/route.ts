import { uCsv, ucitajTablicu } from "@/lib/izvoz";
import { greskaPosluzitelja, jsonGreska } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

/**
 * GET /api/tablica/[sifra]             → JSON { stupci, redovi }
 * GET /api/tablica/[sifra]?format=csv  → CSV (;)
 * Tablični skupovi bez geometrije: ulice, predsjednici_gc/mo, clanovi_gc/mo, prostori_ms, isge, isge_potrosnja.
 */
export async function GET(req: Request, ctx: { params: Promise<{ sifra: string }> }) {
  const { sifra } = await ctx.params;
  if (!/^[a-z0-9_]+$/.test(sifra) || sifra.length > 64) return jsonGreska(400, "Neispravna šifra");
  const format = new URL(req.url).searchParams.get("format");
  try {
    const t = await ucitajTablicu(sifra);
    if (!t) return jsonGreska(404, "Nepoznata tablica");
    if (format === "csv") {
      return new Response(uCsv(t.stupci, t.redovi), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="atlas-${sifra}.csv"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    return Response.json(
      { sifra, stupci: t.stupci, broj: t.redovi.length, redovi: t.redovi },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (e) {
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
