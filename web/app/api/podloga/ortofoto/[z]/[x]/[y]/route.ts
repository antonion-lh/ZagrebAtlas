import { jsonGreska } from "@/lib/odgovor";

export const dynamic = "force-dynamic";

const WMS =
  "https://geoportal.zagreb.hr/Public/Ortofoto2022_Public/GradZagreb_CDOF2022_Public/ows";

function tileBbox(x: number, y: number, z: number): [number, number, number, number] {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const nLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const sLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [west, sLat, east, nLat];
}

/**
 * XYZ pločica → WMS GetMap (orto 2022). Geoportal nema CORS, zato proxy.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await ctx.params;
  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(String(y).replace(/\.jpe?g$/i, ""));
  const max = 2 ** zi;
  if (
    !Number.isInteger(zi) ||
    !Number.isInteger(xi) ||
    !Number.isInteger(yi) ||
    zi < 8 ||
    zi > 19 ||
    xi < 0 ||
    yi < 0 ||
    xi >= max ||
    yi >= max
  ) {
    return jsonGreska(400, "Neispravna pločica");
  }
  const [west, south, east, north] = tileBbox(xi, yi, zi);
  const q = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: "ZG_CDOF2022",
    STYLES: "",
    CRS: "CRS:84",
    BBOX: `${west},${south},${east},${north}`,
    WIDTH: "256",
    HEIGHT: "256",
    FORMAT: "image/jpeg",
    TRANSPARENT: "FALSE",
  });
  try {
    const r = await fetch(`${WMS}?${q}`, {
      headers: { "User-Agent": "ZagrebAtlas/1.0 (https://zg-atlas.lakehouse.hr)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) {
      return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 504, headers: { "Cache-Control": "no-store" } });
  }
}
