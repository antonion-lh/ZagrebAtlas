import { bojaEnergenta, fmtKwh, VODA } from "@/lib/energija";

type Stup = { oznaka: string; dijelovi: { energent: string; v: number }[]; kratka?: string };

/**
 * Složeni stupčasti graf (SVG, bez klijentskog JS-a). Voda se ne crta (nema kWh).
 */
export function SlozeniStupci({
  stupci,
  visina = 180,
  naslov,
}: {
  stupci: Stup[];
  visina?: number;
  naslov: string;
}) {
  const cisti = stupci.map((s) => ({ ...s, dijelovi: s.dijelovi.filter((d) => d.energent !== VODA && d.v > 0) }));
  const max = Math.max(1, ...cisti.map((s) => s.dijelovi.reduce((a, d) => a + d.v, 0)));
  const energenti = Array.from(new Set(cisti.flatMap((s) => s.dijelovi.map((d) => d.energent))));
  const n = cisti.length;
  const sirina = Math.max(320, Math.min(900, n * 28 + 40));
  const lijevo = 8;
  const dno = 22;
  const graf = visina - dno - 6;
  const korak = (sirina - lijevo * 2) / Math.max(1, n);
  const w = Math.max(3, korak * 0.7);
  const svakiN = n > 24 ? Math.ceil(n / 12) : n > 12 ? 2 : 1;

  return (
    <figure style={{ margin: "0.5rem 0 0" }}>
      <figcaption style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
        {naslov} · max {fmtKwh(max)}
      </figcaption>
      <svg
        viewBox={`0 0 ${sirina} ${visina}`}
        width="100%"
        style={{ maxWidth: sirina, display: "block" }}
        role="img"
        aria-label={naslov}
      >
        <title>{naslov}</title>
        <line x1={lijevo} x2={sirina - lijevo} y1={6 + graf} y2={6 + graf} stroke="var(--line)" />
        {cisti.map((s, i) => {
          let y = 6 + graf;
          const x = lijevo + i * korak + (korak - w) / 2;
          const ukupno = s.dijelovi.reduce((a, d) => a + d.v, 0);
          return (
            <g key={s.oznaka}>
              <title>{`${s.oznaka}: ${fmtKwh(ukupno)}${s.dijelovi.map((d) => `\n${d.energent}: ${fmtKwh(d.v)}`).join("")}`}</title>
              {s.dijelovi.map((d) => {
                const h = (d.v / max) * graf;
                y -= h;
                return <rect key={d.energent} x={x} y={y} width={w} height={h} fill={bojaEnergenta(d.energent)} />;
              })}
              {i % svakiN === 0 ? (
                <text x={x + w / 2} y={visina - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">
                  {s.kratka ?? s.oznaka}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 0.9rem", fontSize: "0.82rem", marginTop: "0.3rem" }}>
        {energenti.map((e) => (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, background: bojaEnergenta(e), borderRadius: 2, display: "inline-block" }} />
            {e}
          </span>
        ))}
      </div>
    </figure>
  );
}
