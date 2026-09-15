import type { NextConfig } from "next";

// Sigurnosna zaglavlja. CSP dopušta MapLibre (WebGL, blob workeri) i OSM pločice.
const CSP = [
  "default-src 'self'",
  // MapLibre GL JS kompajlira shadere (eval) i WASM; Next.js u devu isto koristi eval.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  // MapLibre glyph PBF-ovi za brojeve na klasterima
  "font-src 'self' data: https://demotiles.maplibre.org",
  "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://demotiles.maplibre.org",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
      {
        // Otvoreni API: dopušteno s bilo koje domene
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
    ];
  },
};

export default nextConfig;
