import { energijaObjekt } from "@/lib/energija";

export const dynamic = "force-dynamic";

function csvPolje(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return new Response("Neispravan id", { status: 400 });
  const d = await energijaObjekt(n);
  if (!d) return new Response("Nema objekta", { status: 404 });
  const redovi = [
    ["objekt", "adresa", "cetvrt", "godina", "mjesec", "energent", "kolicina", "kwh", "eur_s_pdv"].join(";"),
    ...d.mjeseci.map((m) =>
      [d.objekt.naziv, d.objekt.adresa, d.objekt.cetvrt, m.godina, m.mjesec, m.energent, m.kolicina, m.kwh, m.eur]
        .map(csvPolje)
        .join(";")
    ),
  ];
  return new Response("\uFEFF" + redovi.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="isge-${n}.csv"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
