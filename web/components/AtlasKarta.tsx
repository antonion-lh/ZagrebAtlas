"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import {
  AZURNOST,
  AZURNOST_OPIS,
  TEME,
  TIP_NAZIV,
  formatDatum,
  kratkiNaziv,
  type CetvrtKratko,
  type SlojMeta,
} from "@/lib/slojevi-ui";
import { atributSkriven, nazivAtributa } from "@/lib/hr";

type Props = {
  slojevi: SlojMeta[];
  cetvrti: CetvrtKratko[];
};

type Odabir = {
  sloj: SlojMeta;
  props: Record<string, unknown>;
};

type Pogodak = {
  vrsta: "cetvrt" | "mo" | "objekt";
  id: string;
  naziv: string;
  adresa: string | null;
  skup: string;
  tip: string | null;
  cetvrt: string | null;
  cetvrt_slug: string | null;
  lon: number;
  lat: number;
};

const ZADANO_UKLJUCENO = ["cetvrti", "prometnice"];

const SRC = (s: string) => `s-${s}`;

function filtriraj(fc: FeatureCollection, cetvrtId: number | null): FeatureCollection {
  if (cetvrtId === null) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.filter((f) => f.properties?.cetvrt_id === cetvrtId),
  };
}

function idSlojeva(m: SlojMeta): string[] {
  const s = m.sifra;
  if (m.vrsta === "poligon") return [`${s}-fill`, `${s}-line`];
  if (m.vrsta === "linija") return [`${s}-ln`, `${s}-pt`];
  return [`${s}-cl`, `${s}-cl-n`, `${s}-pt`];
}

function dodajSloj(map: maplibregl.Map, m: SlojMeta, fc: FeatureCollection) {
  const s = m.sifra;
  if (map.getSource(SRC(s))) return;

  if (m.vrsta === "poligon") {
    map.addSource(SRC(s), { type: "geojson", data: fc, promoteId: "id" });
    // poligoni idu ispod svih točkastih/linijskih slojeva
    const prviNePoligon = map
      .getStyle()
      .layers.find((l) => l.id !== "osm" && !l.id.endsWith("-fill") && !l.id.endsWith("-line"))?.id;
    const jeCetvrt = s === "cetvrti";
    const jeMo = s === "mo";
    map.addLayer(
      {
        id: `${s}-fill`,
        type: "fill",
        source: SRC(s),
        paint: { "fill-color": m.boja, "fill-opacity": jeCetvrt ? 0.12 : jeMo ? 0.05 : 0.1 },
      },
      prviNePoligon
    );
    map.addLayer(
      {
        id: `${s}-line`,
        type: "line",
        source: SRC(s),
        paint: {
          "line-color": jeMo ? m.boja : jeCetvrt ? m.boja : "#1f2937",
          "line-width": jeCetvrt ? 1.4 : jeMo ? 0.8 : 1.6,
          "line-dasharray": jeMo ? [2, 2] : [1, 0],
        },
      },
      prviNePoligon
    );
    return;
  }

  if (m.vrsta === "linija") {
    const jeZatvaranje = s === "prometnice";
    map.addSource(SRC(s), { type: "geojson", data: fc });
    map.addLayer({
      id: `${s}-ln`,
      type: "line",
      source: SRC(s),
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": m.boja,
        "line-width": jeZatvaranje ? 4 : ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2.5, 17, 4],
        "line-opacity": jeZatvaranje ? 0.9 : 0.75,
      },
    });
    map.addLayer({
      id: `${s}-pt`,
      type: "circle",
      source: SRC(s),
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": m.boja,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    });
    return;
  }

  map.addSource(SRC(s), {
    type: "geojson",
    data: fc,
    cluster: true,
    clusterRadius: 38,
    clusterMaxZoom: 14,
  });
  map.addLayer({
    id: `${s}-cl`,
    type: "circle",
    source: SRC(s),
    filter: ["has", "point_count"],
    paint: {
      "circle-color": m.boja,
      "circle-opacity": 0.85,
      "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 40, 20],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
  map.addLayer({
    id: `${s}-cl-n`,
    type: "symbol",
    source: SRC(s),
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 11,
    },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: `${s}-pt`,
    type: "circle",
    source: SRC(s),
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 5.5,
      "circle-color": m.boja,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "#fff",
    },
  });
}

export function AtlasKarta({ slojevi, cetvrti }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cacheRef = useRef<Map<string, FeatureCollection>>(new Map());
  const [spremna, setSpremna] = useState(false);
  const [ukljuceno, setUkljuceno] = useState<Set<string>>(
    () => new Set(ZADANO_UKLJUCENO.filter((s) => slojevi.some((m) => m.sifra === s)))
  );
  const [ucitava, setUcitava] = useState<Set<string>>(new Set());
  const [greske, setGreske] = useState<Record<string, string>>({});
  const [cetvrtId, setCetvrtId] = useState<number | null>(null);
  const [odabir, setOdabir] = useState<Odabir | null>(null);
  const [panelOtvoren, setPanelOtvoren] = useState(true);
  const [bezWebGL, setBezWebGL] = useState(false);
  const [urlSpreman, setUrlSpreman] = useState(false);
  const [trazi, setTrazi] = useState("");
  const [pogoci, setPogoci] = useState<Pogodak[]>([]);
  const [traziIde, setTraziIde] = useState(false);
  const [legendaQ, setLegendaQ] = useState("");
  const [kopirano, setKopirano] = useState(false);

  // URL parametri: ?cetvrt=<id|slug>&sloj=a,b,c (dosje → karta)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("cetvrt");
    if (c) {
      const hit = cetvrti.find((x) => String(x.id) === c || x.slug === c);
      if (hit) setCetvrtId(hit.id);
    }
    const s = q.get("sloj");
    if (s) {
      const zeljeni = s.split(",").filter((x) => slojevi.some((m) => m.sifra === x));
      if (zeljeni.length) setUkljuceno(new Set(["cetvrti", ...zeljeni]));
    }
    setUrlSpreman(true);
  }, [cetvrti, slojevi]);

  useEffect(() => {
    const q = trazi.trim();
    if (q.length < 2) {
      setPogoci([]);
      setTraziIde(false);
      return;
    }
    const c = cetvrti.find((x) => x.id === cetvrtId);
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setTraziIde(true);
      const qs = new URLSearchParams({ q });
      if (c) qs.set("cetvrt", c.slug);
      fetch(`/api/trazi?${qs}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { pogoci?: Pogodak[] }) => setPogoci(d.pogoci || []))
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setPogoci([]);
        })
        .finally(() => setTraziIde(false));
    }, 280);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [trazi, cetvrtId, cetvrti]);

  useEffect(() => {
    if (!urlSpreman) return;
    const q = new URLSearchParams();
    const c = cetvrti.find((x) => x.id === cetvrtId);
    if (c) q.set("cetvrt", c.slug);
    const aktivni = [...ukljuceno].filter((s) => s !== "cetvrti").sort();
    const zadano = ZADANO_UKLJUCENO.filter((s) => s !== "cetvrti" && slojevi.some((m) => m.sifra === s)).sort();
    if (aktivni.join(",") !== zadano.join(",")) q.set("sloj", aktivni.join(","));
    const qs = q.toString();
    const cilj = qs ? `/?${qs}` : "/";
    if (`${window.location.pathname}${window.location.search}` !== cilj) {
      window.history.replaceState(null, "", cilj);
    }
  }, [urlSpreman, cetvrtId, ukljuceno, cetvrti, slojevi]);

  const slojPoSifri = useMemo(() => new Map(slojevi.map((m) => [m.sifra, m])), [slojevi]);
  const cetvrtIdRef = useRef<number | null>(null);
  cetvrtIdRef.current = cetvrtId;

  // --- inicijalizacija karte ---
  useEffect(() => {
    if (!ref.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
        center: [15.98, 45.81],
        zoom: 11,
        attributionControl: { compact: true },
      });
    } catch {
      // Preglednik bez WebGL-a: umjesto rušenja stranice prikaži popis i poveznice.
      setBezWebGL(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      const platno = map.getCanvas();
      platno.tabIndex = 0;
      platno.setAttribute(
        "aria-label",
        "Karta otvorenih podataka Zagreba. Kad je u fokusu, strelice pomiču prikaz, plus i minus približuju i udaljuju."
      );
      setSpremna(true);
    });

    // klik: prvo točke/linije, pa MO, pa četvrti
    map.on("click", (e) => {
      if (!map.isStyleLoaded()) return;
      const style = map.getStyle();
      const ids = style.layers.map((l) => l.id).filter((id) => id !== "osm");
      const redoslijed = [
        ...ids.filter((id) => id.endsWith("-pt") || id.endsWith("-ln")),
        ...ids.filter((id) => id.endsWith("-cl")),
        ...ids.filter(
          (id) => id.endsWith("-fill") && id !== "mo-fill" && id !== "cetvrti-fill"
        ),
        ...ids.filter((id) => id === "mo-fill"),
        ...ids.filter((id) => id === "cetvrti-fill"),
      ];
      const feats = map.queryRenderedFeatures(e.point, { layers: redoslijed });
      if (!feats.length) {
        setOdabir(null);
        return;
      }
      // odaberi feature iz sloja s najvišim prioritetom (redoslijed gore)
      const f = redoslijed
        .map((lid) => feats.find((x) => x.layer.id === lid))
        .find(Boolean);
      if (!f) return;

      if (f.properties && "point_count" in f.properties) {
        const src = map.getSource(f.source) as maplibregl.GeoJSONSource;
        const cid = f.properties.cluster_id as number;
        src.getClusterExpansionZoom(cid).then((z) => {
          const g = f.geometry;
          if (g.type === "Point") {
            map.easeTo({ center: g.coordinates as [number, number], zoom: Math.min(z, 18) });
          }
        });
        return;
      }
      const sifra = f.source.replace(/^s-/, "");
      const meta = slojPoSifri.get(sifra);
      if (!meta) return;
      setOdabir({ sloj: meta, props: { ...(f.properties || {}) } });
    });

    map.on("mousemove", (e) => {
      if (!map.isStyleLoaded()) return;
      const ids = map
        .getStyle()
        .layers.map((l) => l.id)
        .filter((id) => /-(pt|ln|cl|fill)$/.test(id));
      const feats = map.queryRenderedFeatures(e.point, { layers: ids });
      map.getCanvas().style.cursor = feats.length ? "pointer" : "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setSpremna(false);
    };
  }, [slojPoSifri]);

  // --- učitavanje i vidljivost slojeva ---
  const osiguraj = useCallback(
    async (sifra: string) => {
      const map = mapRef.current;
      const meta = slojPoSifri.get(sifra);
      if (!map || !meta) return;
      if (map.getSource(SRC(sifra))) return;
      let fc = cacheRef.current.get(sifra);
      if (!fc) {
        setUcitava((s) => new Set(s).add(sifra));
        try {
          const r = await fetch(`/api/sloj/${sifra}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          fc = (await r.json()) as FeatureCollection;
          cacheRef.current.set(sifra, fc);
          setGreske((g) => {
            const { [sifra]: _, ...rest } = g;
            return rest;
          });
        } catch (e) {
          setGreske((g) => ({ ...g, [sifra]: "nije se učitalo" }));
          return;
        } finally {
          setUcitava((s) => {
            const n = new Set(s);
            n.delete(sifra);
            return n;
          });
        }
      }
      const m2 = mapRef.current;
      if (!m2 || m2.getSource(SRC(sifra))) return;
      if (!m2.isStyleLoaded()) {
        m2.once("styledata", () => {
          if (mapRef.current && !mapRef.current.getSource(SRC(sifra))) {
            dodajSloj(mapRef.current, meta, filtriraj(fc as FeatureCollection, cetvrtIdRef.current));
          }
        });
        return;
      }
      dodajSloj(m2, meta, filtriraj(fc, cetvrtIdRef.current));
    },
    [slojPoSifri]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremna) return;
    for (const m of slojevi) {
      const on = ukljuceno.has(m.sifra);
      if (on) {
        if (!map.getSource(SRC(m.sifra))) void osiguraj(m.sifra);
      }
      for (const lid of idSlojeva(m)) {
        if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", on ? "visible" : "none");
      }
    }
  }, [ukljuceno, spremna, slojevi, osiguraj]);

  // nakon lazy dodavanja sloja vidljivost mora odgovarati stanju
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremna) return;
    const t = setInterval(() => {
      if (!map.isStyleLoaded()) return;
      for (const m of slojevi) {
        for (const lid of idSlojeva(m)) {
          if (map.getLayer(lid)) {
            const zeljeno = ukljuceno.has(m.sifra) ? "visible" : "none";
            if (map.getLayoutProperty(lid, "visibility") !== zeljeno) {
              map.setLayoutProperty(lid, "visibility", zeljeno);
            }
          }
        }
      }
    }, 400);
    return () => clearInterval(t);
  }, [ukljuceno, spremna, slojevi]);

  // --- filter po četvrti ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremna) return;
    for (const [sifra, fc] of cacheRef.current) {
      const src = map.getSource(SRC(sifra)) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      // granice četvrti ostaju sve (istaknemo odabranu); poligoni bez četvrti (odsjeci) ostaju
      if (sifra === "cetvrti" || fc.features.every((f) => f.properties?.cetvrt_id == null)) continue;
      src.setData(filtriraj(fc, cetvrtId));
    }
    if (map.getLayer("cetvrti-line")) {
      map.setPaintProperty(
        "cetvrti-line",
        "line-width",
        cetvrtId === null ? 1.4 : ["case", ["==", ["get", "id"], cetvrtId], 3, 0.8]
      );
      map.setPaintProperty(
        "cetvrti-fill",
        "fill-opacity",
        cetvrtId === null ? 0.12 : ["case", ["==", ["get", "id"], cetvrtId], 0.05, 0.16]
      );
    }
    if (cetvrtId !== null) {
      const c = cetvrti.find((x) => x.id === cetvrtId);
      if (c) map.fitBounds(c.bbox, { padding: 40, duration: 600 });
    }
  }, [cetvrtId, spremna, cetvrti]);

  const toggle = (sifra: string, on: boolean) =>
    setUkljuceno((s) => {
      const n = new Set(s);
      if (on) n.add(sifra);
      else n.delete(sifra);
      return n;
    });

  const otvoriPogodak = (p: Pogodak) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [p.lon, p.lat],
        zoom: p.vrsta === "cetvrt" ? 12.4 : p.vrsta === "mo" ? 14 : 16,
        duration: 700,
      });
    }
    if (p.vrsta === "cetvrt") {
      const hit = cetvrti.find((x) => String(x.id) === p.id || x.slug === p.cetvrt_slug);
      if (hit) setCetvrtId(hit.id);
    }
    const meta = slojPoSifri.get(p.skup);
    if (meta) {
      toggle(p.skup, true);
      setOdabir({
        sloj: meta,
        props: {
          id: p.id,
          naziv: p.naziv,
          adresa: p.adresa,
          tip: p.tip,
          cetvrt: p.cetvrt,
          cetvrt_slug: p.cetvrt_slug,
          slug: p.vrsta === "cetvrt" ? p.cetvrt_slug : undefined,
        },
      });
    }
    setTrazi("");
    setPogoci([]);
  };

  const kopirajPoveznicu = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setKopirano(true);
      window.setTimeout(() => setKopirano(false), 2000);
    } catch {
      setKopirano(false);
    }
  };

  const qLegenda = legendaQ.trim().toLocaleLowerCase("hr");
  const grupe = TEME.map((t) => ({
    tema: t,
    slojevi: slojevi.filter((m) => {
      if (m.tema !== t.sifra) return false;
      if (!qLegenda) return true;
      return kratkiNaziv(m.naziv).toLocaleLowerCase("hr").includes(qLegenda);
    }),
  })).filter((g) => g.slojevi.length);

  if (bezWebGL) {
    return (
      <div className="stranica">
        <h1>Karta grada</h1>
        <p role="alert" className="uvod">
          Ovaj preglednik ne crta kartu (nema WebGL). Isti podaci su u{" "}
          <a href="/cetvrti">dosjeima četvrti</a>, u <a href="/ustanove">popisu ustanova</a> i u{" "}
          <a href="/katalog">katalogu</a>.
        </p>
        {grupe.map(({ tema, slojevi: ss }) => (
          <section key={tema.sifra}>
            <h2>{tema.naziv}</h2>
            <ul>
              {ss.map((m) => (
                <li key={m.sifra}>
                  {kratkiNaziv(m.naziv)} · {m.broj}{" "}
                  <span className={`azurnost azurnost-${m.azurnost}`}>
                    {AZURNOST[m.azurnost] || m.azurnost}
                  </span>{" "}
                  · <a href={`/api/sloj/${m.sifra}`}>GeoJSON</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="karta-okvir">
      {panelOtvoren ? (
        <aside className="karta-panel" aria-label="Slojevi karte">
          <button
            type="button"
            className="karta-zatvori"
            aria-label="Sakrij slojeve"
            onClick={() => setPanelOtvoren(false)}
          >
            ×
          </button>
          <h1>Karta grada</h1>
          <p className="karta-muted karta-uvod">
            Grad objavljuje otvorene podatke. Ovdje su na jednom mjestu. Uključite sloj kad vam treba.
          </p>

          <div className="karta-pretraga">
            <label>
              <span className="karta-muted">Traži u Zagrebu</span>
              <input
                type="search"
                value={trazi}
                onChange={(e) => setTrazi(e.target.value)}
                placeholder="škola, ljekarna, Ilica…"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            {trazi.trim().length >= 2 ? (
              <ul className="karta-pogoci" role="listbox" aria-label="Pogoci pretrage">
                {traziIde && !pogoci.length ? (
                  <li className="karta-muted">Tražim…</li>
                ) : !pogoci.length ? (
                  <li className="karta-muted">Nema pogotka. Probajte drugi naziv ili adresu.</li>
                ) : (
                  pogoci.map((p) => (
                    <li key={`${p.vrsta}-${p.id}`}>
                      <button type="button" onClick={() => otvoriPogodak(p)}>
                        <strong>{p.naziv}</strong>
                        <span className="karta-muted">
                          {[
                            p.vrsta === "cetvrt" ? "gradska četvrt" : p.vrsta === "mo" ? "mjesni odbor" : null,
                            p.adresa,
                            p.cetvrt && p.vrsta !== "cetvrt" ? p.cetvrt : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <label>
            <span className="karta-muted">Četvrt</span>
            <select
              value={cetvrtId ?? ""}
              onChange={(e) => setCetvrtId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Cijeli grad</option>
              {cetvrti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naziv}
                </option>
              ))}
            </select>
          </label>
          {cetvrtId !== null ? (
            <p className="karta-poveznica">
              <a href={`/cetvrti/${cetvrti.find((c) => c.id === cetvrtId)?.slug}`}>Dosje ove četvrti</a>
            </p>
          ) : null}

          <div className="karta-alat">
            <button
              type="button"
              className="gumb-tekst"
              onClick={() => setUkljuceno(new Set(["cetvrti", "prometnice"]))}
            >
              Samo granice i zatvaranja
            </button>
            <button type="button" className="gumb-tekst" onClick={kopirajPoveznicu}>
              {kopirano ? "Poveznica je u međuspremniku" : "Kopiraj poveznicu"}
            </button>
          </div>

          <label>
            <span className="karta-muted">U legendi</span>
            <input
              type="search"
              value={legendaQ}
              onChange={(e) => setLegendaQ(e.target.value)}
              placeholder="npr. vrtić, ZET, zrak"
              autoComplete="off"
            />
          </label>

          {grupe.map(({ tema, slojevi: ss }) => {
            const imaUkljucen = ss.some((m) => ukljuceno.has(m.sifra));
            const otvori = imaUkljucen || Boolean(qLegenda) || tema.sifra === "zivo" || tema.sifra === "prostor";
            return (
              <details key={tema.sifra} className="karta-tema" open={otvori ? true : undefined}>
                <summary>
                  {tema.naziv}{" "}
                  <span className="karta-muted">
                    ({ss.filter((m) => ukljuceno.has(m.sifra)).length}/{ss.length})
                  </span>
                </summary>
                <ul>
                  {ss.map((m) => (
                    <li key={m.sifra}>
                      <label>
                        <input
                          type="checkbox"
                          checked={ukljuceno.has(m.sifra)}
                          onChange={(e) => toggle(m.sifra, e.target.checked)}
                        />
                        <span>
                          <span
                            className={`karta-tocka ${m.vrsta === "poligon" ? "kvadrat" : m.vrsta === "linija" ? "crta" : ""}`}
                            style={{ background: m.boja }}
                          />
                          {kratkiNaziv(m.naziv)}{" "}
                          <span className="karta-muted">· {m.broj}</span>{" "}
                          <span className={`azurnost azurnost-${m.azurnost}`}>
                            {AZURNOST[m.azurnost] || m.azurnost}
                          </span>
                          {ucitava.has(m.sifra) ? <span className="karta-muted"> … učitavam</span> : null}
                          {greske[m.sifra] ? <span className="karta-upozorenje"> · {greske[m.sifra]}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          <p className="karta-muted karta-tipkovnica">
            Kliknite kartu pa strelice, plus i minus. Popis bez karte:{" "}
            <a href="/ustanove">ustanove</a>, <a href="/cetvrti">četvrti</a>.
          </p>
        </aside>
      ) : (
        <button type="button" className="karta-gumb" onClick={() => setPanelOtvoren(true)}>
          Slojevi
        </button>
      )}

      {odabir ? <Inspector odabir={odabir} onClose={() => setOdabir(null)} /> : null}

      <div ref={ref} className="karta-platno" />
    </div>
  );
}

const SKRIVENO = new Set([
  "id",
  "skup",
  "naziv",
  "adresa",
  "tip",
  "cetvrt_id",
  "cetvrt",
  "cetvrt_slug",
  "mo",
  "ostalo",
  "slug",
  "telefon",
  "email",
  "web",
  "cetvrt_naziv",
]);

function Inspector({ odabir, onClose }: { odabir: Odabir; onClose: () => void }) {
  const { sloj, props } = odabir;
  const naziv = String(props.naziv || sloj.naziv);
  const tip = typeof props.tip === "string" ? TIP_NAZIV[props.tip] || props.tip : null;

  let ostalo: Record<string, unknown> = {};
  if (typeof props.ostalo === "string" && props.ostalo) {
    try {
      ostalo = JSON.parse(props.ostalo) as Record<string, unknown>;
    } catch {
      ostalo = {};
    }
  }
  const dodatno = Object.entries(props).filter(
    ([k, v]) => !SKRIVENO.has(k) && !atributSkriven(k) && v !== null && v !== "" && v !== undefined
  );

  const web = typeof props.web === "string" && props.web ? props.web : null;
  const webHref = web ? (web.startsWith("http") ? web : `https://${web}`) : null;

  return (
    <aside className="karta-inspector" aria-label="Pregled objekta">
      <button type="button" className="karta-zatvori" aria-label="Zatvori" onClick={onClose}>
        ×
      </button>
      <h2>{naziv}</h2>
      <div className="karta-muted" style={{ fontSize: "0.86rem" }}>
        {tip || sloj.naziv}
        {sloj.sifra === "cetvrti" ? " · gradska četvrt" : ""}
        {sloj.sifra === "mo" ? " · mjesni odbor" : ""}
      </div>

        {sloj.sifra === "cetvrti" && typeof props.slug === "string" ? (
        <p className="karta-poveznica">
          <a href={`/cetvrti/${props.slug}`}>Dosje ove četvrti</a>
        </p>
      ) : null}
      {sloj.sifra === "isge" && props.energy_id ? (
        <p className="karta-poveznica">
          <a href={`/energija/${String(props.energy_id)}`}>Potrošnja energije ovog objekta</a>
        </p>
      ) : null}

      <dl>
        {props.adresa ? (
          <>
            <dt>Adresa</dt>
            <dd>{String(props.adresa)}</dd>
          </>
        ) : null}
        {props.telefon ? (
          <>
            <dt>Telefon</dt>
            <dd>{String(props.telefon)}</dd>
          </>
        ) : null}
        {props.email ? (
          <>
            <dt>E-pošta</dt>
            <dd>
              <a href={`mailto:${String(props.email)}`}>{String(props.email)}</a>
            </dd>
          </>
        ) : null}
        {webHref ? (
          <>
            <dt>Stranica</dt>
            <dd>
              <a href={webHref} target="_blank" rel="noreferrer">
                {web}
              </a>
            </dd>
          </>
        ) : null}
        {sloj.sifra === "prometnice" ? (
          <>
            <dt>Od</dt>
            <dd>{formatDatum(props.od as string)}</dd>
            <dt>Do</dt>
            <dd>{formatDatum(props.do as string)}</dd>
          </>
        ) : null}
        {props.cetvrt && sloj.sifra !== "cetvrti" ? (
          <>
            <dt>Četvrt</dt>
            <dd>
              {props.cetvrt_slug ? (
                <a href={`/cetvrti/${String(props.cetvrt_slug)}`}>{String(props.cetvrt)}</a>
              ) : (
                String(props.cetvrt)
              )}
            </dd>
          </>
        ) : null}
        {props.mo ? (
          <>
            <dt>Mjesni odbor</dt>
            <dd>{String(props.mo)}</dd>
          </>
        ) : null}
        {dodatno
          .filter(([k]) => !(sloj.sifra === "prometnice" && (k === "od" || k === "do")))
          .filter(([k]) => !(sloj.sifra === "isge" && (k === "godine" || k === "energy_id")))
          .map(([k, v]) => (
            <Red key={k} k={k} v={v} />
          ))}
        {Object.entries(ostalo)
          .filter(([k, v]) => !atributSkriven(k) && v !== null && v !== "" && v !== undefined)
          .map(([k, v]) => (
            <Red key={`o-${k}`} k={k} v={v} />
          ))}
      </dl>

      <div className="izvor">
        <div>
          Izvor: {sloj.naziv}{" "}
          <span className={`azurnost azurnost-${sloj.azurnost}`}>
            {AZURNOST[sloj.azurnost] || sloj.azurnost}
          </span>
        </div>
        <div style={{ marginTop: "0.25rem" }}>{AZURNOST_OPIS[sloj.azurnost]}</div>
        <div style={{ marginTop: "0.25rem" }}>
          Preuzeto u Atlas: {formatDatum(sloj.sink)}
          {sloj.ckan_url ? (
            <>
              {" · "}
              <a href={sloj.ckan_url} target="_blank" rel="noreferrer">
                izvor na data.zagreb.hr
              </a>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function Red({ k, v }: { k: string; v: unknown }) {
  const txt = typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <>
      <dt>{nazivAtributa(k)}</dt>
      <dd>{txt}</dd>
    </>
  );
}
