import { slojUCsv } from "@/lib/izvoz";
import { greskaPosluzitelja, jsonGreska } from "@/lib/odgovor";
import { ucitajSloj } from "@/lib/slojevi";

export const dynamic = "force-dynamic";

// Koliko smije biti u kešu preglednika / proxyja, po ažurnosti sloja.
const CACHE: Record<string, string> = {
  prometnice: "public, max-age=300",
  vrtici: "public, max-age=3600",
  privatni_vrtici: "public, max-age=3600",
};

/**
 * GET /api/sloj/[sifra]            → GeoJSON FeatureCollection (WGS84)
 * GET /api/sloj/[sifra]?format=csv → CSV (;) s lon/lat i spljoštenim atributima
 */
export async function GET(req: Request, ctx: { params: Promise<{ sifra: string }> }) {
  const { sifra } = await ctx.params;
  if (!/^[a-z0-9_]+$/.test(sifra) || sifra.length > 64) {
    return jsonGreska(400, "Neispravna šifra");
  }
  const format = new URL(req.url).searchParams.get("format");

  try {
    const fc = await ucitajSloj(sifra);
    if (!fc) return jsonGreska(404, "Nepoznat sloj");
    const cache = CACHE[sifra] || "public, max-age=86400";
    if (format === "csv") {
      return new Response(slojUCsv(fc), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="atlas-${sifra}.csv"`,
          "Cache-Control": cache,
        },
      });
    }
    return Response.json(fc, {
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control": cache,
        ...(format === "download" ? { "Content-Disposition": `attachment; filename="atlas-${sifra}.geojson"` } : {}),
      },
    });
  } catch (e) {
    return greskaPosluzitelja(e);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
