import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Predlet za otvoreni API: samo GET. Zaglavlja CORS-a dodaje next.config.ts. */
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
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
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
