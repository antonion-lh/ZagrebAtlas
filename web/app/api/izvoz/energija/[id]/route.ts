import { pool } from "@/lib/db";
import { uCsv } from "@/lib/izvoz";
import { greskaPosluzitelja, jsonGreska } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

/**
 * GET /api/izvoz/energija/{id} → CSV mjesečne potrošnje jednog ISGE objekta.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 1e9) {
    return jsonGreska(400, "Neispravan identifikator");
  }

  try {
    const { rows: objekti } = await pool().query<{
      id: number;
      naziv: string;
      adresa: string | null;
      mjesto: string | null;
      cetvrt: string | null;
    }>(
      `SELECT e.id, e.naziv, e.adresa, e.mjesto, c.naziv AS cetvrt
       FROM energy.objekt e
       LEFT JOIN geo.cetvrt c ON c.id = e.cetvrt_id
       WHERE e.id = $1`,
      [n]
    );
    const o = objekti[0];
    if (!o) return jsonGreska(404, "Objekt nije pronađen");

    const { rows } = await pool().query<{
      godina: number;
      mjesec: number;
      energent: string;
      kolicina: number;
      kwh: number;
      eur: number;
    }>(
      `SELECT godina, mjesec, energent, kolicina, kwh, eur
       FROM energy.potrosnja
       WHERE objekt_id = $1
       ORDER BY godina, mjesec, energent`,
      [n]
    );

    const csv = uCsv(
      ["objekt_id", "naziv", "adresa", "mjesto", "cetvrt", "godina", "mjesec", "energent", "kolicina", "kwh", "eur"],
      rows.map((r) => [
        o.id,
        o.naziv,
        o.adresa,
        o.mjesto,
        o.cetvrt,
        r.godina,
        r.mjesec,
        r.energent,
        r.kolicina,
        r.kwh,
        r.eur,
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
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
