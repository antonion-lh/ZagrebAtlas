import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dopusteno, klijentIp, limitZaPutanju } from "@/lib/ogranicenja";

const PORUKA_LIMIT = "Previše zahtjeva. Pokušajte ponovno za trenutak.";

/** Predlet za otvoreni API: samo GET/OPTIONS + rate limit po IP. */
export function middleware(req: NextRequest) {
  const metoda = req.method.toUpperCase();

  if (metoda === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (metoda !== "GET" && metoda !== "HEAD") {
    return NextResponse.json(
      { greska: "Dopušteni su samo GET i OPTIONS." },
      {
        status: 405,
        headers: { Allow: "GET, HEAD, OPTIONS" },
      }
    );
  }

  const { mapa, max, prozorMs } = limitZaPutanju(req.nextUrl.pathname);
  const ip = klijentIp(req);
  if (!dopusteno(mapa, ip, max, prozorMs)) {
    return NextResponse.json(
      { greska: PORUKA_LIMIT },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
