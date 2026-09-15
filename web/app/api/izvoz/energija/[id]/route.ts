import { energijaObjekt } from "@/lib/energija";
import { uCsv } from "@/lib/izvoz";

export const dynamic = "force-dynamic";

/**
 * GET /api/izvoz/energija/[id] → CSV mjesečne potrošnje jednog ISGE objekta
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return Response.json({ greska: "Neispravan id" }, { status: 400 });
  }
  try {
    const d = await energijaObjekt(n);
    if (!d) return Response.json({ greska: "Objekt nije pronađen" }, { status: 404 });
    const csv = uCsv(
      ["objekt_id", "naziv", "adresa", "mjesto", "cetvrt", "godina", "mjesec", "energent", "kolicina", "kwh", "eur"],
      d.mjeseci.map((m) => [
        d.objekt.id,
        d.objekt.naziv,
        d.objekt.adresa,
        d.objekt.mjesto,
        d.objekt.cetvrt,
        m.godina,
        m.mjesec,
        m.energent,
        m.kolicina,
        m.kwh,
        m.eur,
      ])
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atlas-energija-${n}.csv"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return Response.json({ greska: e instanceof Error ? e.message : "Greška baze" }, { status: 500 });
  }
}
