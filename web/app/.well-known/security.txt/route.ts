export const dynamic = "force-static";

const TIJELO = `Contact: https://github.com/antonion-lh/ZagrebAtlas/security/advisories/new
Expires: 2027-09-15T00:00:00.000Z
Preferred-Languages: hr, en
Canonical: https://zg-atlas.lakehouse.hr/.well-known/security.txt
Policy: https://github.com/antonion-lh/ZagrebAtlas
`;

export function GET() {
  return new Response(TIJELO, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
