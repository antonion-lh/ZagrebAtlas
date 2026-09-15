#!/usr/bin/env python3
"""Ingest otvorenih skupova u PostGIS (Zagreb Gradski atlas)."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from io import BytesIO, TextIOWrapper
from pathlib import Path
from typing import Callable

import httpx
import psycopg
import shapefile
from pyproj import Transformer

from skupovi import CKAN_API, SKUPOVI, Skup

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://atlas:atlas@127.0.0.1:5434/atlas"
)

ZG_LON = (15.5, 16.5)
ZG_LAT = (45.5, 46.2)


def u_zagrebu(lon: float, lat: float) -> bool:
    return ZG_LON[0] <= lon <= ZG_LON[1] and ZG_LAT[0] <= lat <= ZG_LAT[1]


def slugify(text: str) -> str:
    t = text.lower().strip()
    for a, b in {
        "č": "c",
        "ć": "c",
        "š": "s",
        "ž": "z",
        "đ": "d",
        "dž": "dz",
    }.items():
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-") or "x"


# ---------------------------------------------------------------------------
# Shema / migracije (idempotentno; init.sql vrijedi samo za svježu bazu)
# ---------------------------------------------------------------------------

MIGRACIJE = [
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS tema text",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS tip text",
    "ALTER TABLE geo.objekt ADD COLUMN IF NOT EXISTS mo_id integer REFERENCES geo.mo (id)",
    "CREATE INDEX IF NOT EXISTS idx_objekt_mo ON geo.objekt (mo_id)",
    "ALTER TABLE geo.mo ADD COLUMN IF NOT EXISTS slug text",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_mo_slug ON geo.mo (slug)",
    """
    CREATE TABLE IF NOT EXISTS geo.ulica (
        ul_jid      text PRIMARY KEY,
        ime         text NOT NULL,
        ime_norm    text NOT NULL,
        naselje     text,
        naselje_mb  text,
        opis        text,
        datum       text
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ulica_norm ON geo.ulica (ime_norm)",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS geometrija text",
    # ---- lokalna demokracija ----
    "CREATE SCHEMA IF NOT EXISTS uprava",
    """
    CREATE TABLE IF NOT EXISTS uprava.predsjednik_gc (
        cetvrt_id       integer PRIMARY KEY REFERENCES geo.cetvrt (id),
        cetvrt_naziv    text NOT NULL,
        ime             text NOT NULL,
        adresa          text,
        telefon         text,
        email           text,
        email_podrucni  text
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS uprava.predsjednik_mo (
        mo_id           integer PRIMARY KEY REFERENCES geo.mo (id),
        mo_naziv        text NOT NULL,
        cetvrt_id       integer REFERENCES geo.cetvrt (id),
        ime             text NOT NULL,
        adresa          text,
        telefon         text,
        email           text
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS uprava.clan_vijeca (
        id              bigserial PRIMARY KEY,
        razina          text NOT NULL CHECK (razina IN ('gc', 'mo')),
        vanjski_id      text,
        cetvrt_id       integer REFERENCES geo.cetvrt (id),
        mo_id           integer REFERENCES geo.mo (id),
        jedinica_naziv  text NOT NULL,
        prezime_ime     text NOT NULL,
        funkcija        text,
        stranka         text,
        opis_promjena   text,
        aktivan         boolean NOT NULL DEFAULT true
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_clan_cetvrt ON uprava.clan_vijeca (razina, cetvrt_id)",
    "CREATE INDEX IF NOT EXISTS idx_clan_mo ON uprava.clan_vijeca (razina, mo_id)",
    """
    CREATE TABLE IF NOT EXISTS uprava.prostor_ms (
        id              bigserial PRIMARY KEY,
        mo_id           integer REFERENCES geo.mo (id),
        cetvrt_id       integer REFERENCES geo.cetvrt (id),
        mo_naziv        text,
        cetvrt_naziv    text,
        prostorija      text NOT NULL,
        broj_termina    integer NOT NULL DEFAULT 0,
        rezervacija     jsonb
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_prostor_mo ON uprava.prostor_ms (mo_id)",
    "CREATE INDEX IF NOT EXISTS idx_prostor_cetvrt ON uprava.prostor_ms (cetvrt_id)",
    # ---- katalog E: CKAN metapodaci i asset lista ----
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS ckan_naslov text",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS ckan_opis text",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS ckan_izmjena timestamptz",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS licenca text",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS izdavac text",
    "ALTER TABLE meta.skup ADD COLUMN IF NOT EXISTS resursi jsonb",
    # ---- energija (ISGE) ----
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS unaccent",
    "CREATE SCHEMA IF NOT EXISTS energy",
    "DROP TABLE IF EXISTS energy.isge_mjesec",
    "DROP TABLE IF EXISTS energy.spoj",
    """
    CREATE TABLE IF NOT EXISTS energy.objekt (
        id              serial PRIMARY KEY,
        kljuc           text NOT NULL UNIQUE,
        naziv           text NOT NULL,
        adresa          text,
        mjesto          text,
        posta           text,
        adresa_norm     text,
        kucni_broj      text,
        cetvrt_id       integer REFERENCES geo.cetvrt (id),
        mo_id           integer REFERENCES geo.mo (id),
        geo_objekt_id   bigint REFERENCES geo.objekt (id) ON DELETE SET NULL,
        geo_skup        text,
        geo_naziv       text,
        metoda          text,
        pouzdanost      text CHECK (pouzdanost IN ('visoka', 'srednja', 'niska')),
        geom            geometry(Point, 4326),
        broj_mjerila    integer NOT NULL DEFAULT 0,
        energenti       text[] NOT NULL DEFAULT '{}',
        od              date,
        "do"            date,
        kwh_ukupno      numeric,
        eur_ukupno      numeric
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_energy_objekt_cetvrt ON energy.objekt (cetvrt_id)",
    "CREATE INDEX IF NOT EXISTS idx_energy_objekt_geom ON energy.objekt USING gist (geom)",
    "CREATE INDEX IF NOT EXISTS idx_energy_objekt_naziv_trgm ON energy.objekt USING gin (naziv gin_trgm_ops)",
    """
    CREATE TABLE IF NOT EXISTS energy.potrosnja (
        objekt_id       integer NOT NULL REFERENCES energy.objekt (id) ON DELETE CASCADE,
        energent        text NOT NULL,
        godina          integer NOT NULL,
        mjesec          integer NOT NULL CHECK (mjesec BETWEEN 1 AND 12),
        kolicina        numeric,
        kwh             numeric,
        eur             numeric,
        PRIMARY KEY (objekt_id, energent, godina, mjesec)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_potrosnja_god ON energy.potrosnja (godina, mjesec)",
    "ALTER TABLE geo.objekt ADD COLUMN IF NOT EXISTS adresa_norm text",
    "ALTER TABLE geo.objekt ADD COLUMN IF NOT EXISTS kucni_broj text",
    "CREATE INDEX IF NOT EXISTS idx_objekt_adresa_norm ON geo.objekt (adresa_norm, kucni_broj)",
    "CREATE SCHEMA IF NOT EXISTS okolis",
    """
    CREATE TABLE IF NOT EXISTS okolis.zrak_dan (
        postaja     text NOT NULL,
        paket_id    text NOT NULL,
        datum       date NOT NULL,
        polutant    text NOT NULL,
        jedinica    text,
        vrijednost  numeric,
        PRIMARY KEY (postaja, datum, polutant)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_zrak_postaja ON okolis.zrak_dan (postaja, datum)",
    """
    CREATE TABLE IF NOT EXISTS meta.portal_skup (
        id          serial PRIMARY KEY,
        naziv       text NOT NULL,
        opis        text,
        ucestalost  text,
        poveznica   text,
        uvjeti      text,
        paket_id    text,
        atlas_sifra text REFERENCES meta.skup (sifra),
        stanje      text NOT NULL DEFAULT 'nije_u_atlasu'
                    CHECK (stanje IN ('u_atlasu', 'nije_u_atlasu', 'nije_ckan'))
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_portal_stanje ON meta.portal_skup (stanje)",
    "CREATE INDEX IF NOT EXISTS idx_portal_paket ON meta.portal_skup (paket_id)",
    """
    CREATE TABLE IF NOT EXISTS meta.geokod (
        upit        text PRIMARY KEY,
        lon         double precision,
        lat         double precision,
        izvor       text,
        fetched_at  timestamptz NOT NULL DEFAULT now()
    )
    """,
    r"""
    CREATE OR REPLACE FUNCTION geo.norm_adresa(a text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
        -- "Adamovec, Ulica X 75" / "Augusta Šenoe 42, Sesvete" → segment s kućnim brojem
        SELECT NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(
            lower(unaccent(coalesce(
                (SELECT s FROM unnest(string_to_array(a, ',')) AS s WHERE s ~ '\d' LIMIT 1), a, ''))),
            '(^|,)\s*(zagreb|sesvete|10\d{3})\M[^,]*', '', 'g'),
            '\m(ulica|ul\.|cesta|put|aleja|trg|avenija|av\.|prilaz|odvojak|setaliste|naselje|sv\.|sveti|svetog|svete|sveta)\M', ' ', 'g'),
            '[^a-z0-9]+', ' ', 'g')), '')
    $$
    """,
    r"""
    CREATE OR REPLACE FUNCTION geo.kucni_broj(a text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
        SELECT lower((regexp_match(coalesce(a, ''), '(\d+)\s*([a-zA-Z](?![a-zA-Z]))?'))[1]
               || coalesce((regexp_match(coalesce(a, ''), '(\d+)\s*([a-zA-Z](?![a-zA-Z]))?'))[2], ''))
    $$
    """,
    r"""
    CREATE OR REPLACE FUNCTION geo.ulica_norm(a text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
        SELECT NULLIF(btrim(regexp_replace(coalesce(geo.norm_adresa(a), ''), '\s*\d.*$', '')), '')
    $$
    """,
]


def migracije(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        for sql in MIGRACIJE:
            cur.execute(sql)
    conn.commit()


def ensure_skup(conn: psycopg.Connection, s: Skup) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta.skup
                (sifra, naziv, ckan_url, paket_id, azurnost, frekvencija_sink, napomena, tema, tip, geometrija)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (sifra) DO UPDATE SET
                naziv = EXCLUDED.naziv,
                ckan_url = EXCLUDED.ckan_url,
                paket_id = EXCLUDED.paket_id,
                azurnost = EXCLUDED.azurnost,
                frekvencija_sink = EXCLUDED.frekvencija_sink,
                napomena = EXCLUDED.napomena,
                tema = EXCLUDED.tema,
                tip = EXCLUDED.tip,
                geometrija = EXCLUDED.geometrija
            """,
            (
                s.sifra,
                s.naziv,
                s.ckan_url,
                s.paket_id,
                s.azurnost,
                s.frekvencija,
                s.napomena or None,
                s.tema,
                s.tip or None,
                s.geometrija,
            ),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# CKAN / preuzimanje
# ---------------------------------------------------------------------------


def ckan_resource_url(paket_id: str, prefer: str = "SHP", ime_sadrzi: str | None = None) -> str:
    r = httpx.get(f"{CKAN_API}/package_show", params={"id": paket_id}, timeout=60, headers=UA)
    r.raise_for_status()
    resources = r.json()["result"]["resources"]
    prefer_u = prefer.upper()
    if ime_sadrzi:
        imena = [
            res
            for res in resources
            if ime_sadrzi.lower() in (res.get("name") or res.get("description") or "").lower()
            and res.get("url")
        ]
        if prefer_u:
            fmt = [res for res in imena if (res.get("format") or "").upper() == prefer_u]
            if fmt:
                return fmt[-1]["url"]
        if imena:
            return imena[-1]["url"]
    if prefer_u == "GEOJSON":
        geo = [
            res
            for res in resources
            if (res.get("format") or "").upper() == "GEOJSON" and res.get("url")
        ]
        # 1. ArcGIS hub download s eksplicitnim WGS84
        for res in geo:
            if "spatialRefId=4326" in res["url"]:
                return res["url"]
        # 2. ArcGIS hub download bez SRID-a → dodaj
        for res in geo:
            url = res["url"]
            if "opendata.arcgis.com" in url:
                sep = "&" if "?" in url else "?"
                return f"{url}{sep}spatialRefId=4326&where=1%3D1"
        # 3. FeatureServer replica cache / CKAN upload (već WGS84)
        for res in geo:
            return res["url"]
    for res in resources:
        if (res.get("format") or "").upper() == prefer_u and res.get("url"):
            return res["url"]
    for res in resources:
        if res.get("url"):
            return res["url"]
    raise RuntimeError(f"Nema resursa za paket {paket_id}")


UA = {"User-Agent": "ZagrebAtlas/1.0 (https://zg-atlas.lakehouse.hr; otvoreni podaci)"}


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=180, headers=UA) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    return dest


def unzip_shp(zip_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(out_dir)
    shps = list(out_dir.rglob("*.shp"))
    if not shps:
        raise RuntimeError(f"Nema .shp u {zip_path}")
    return shps[0]


def detect_epsg(prj_path: Path | None) -> int:
    if prj_path and prj_path.exists():
        text = prj_path.read_text(encoding="utf-8", errors="ignore").upper()
        if "WGS_1984" in text or "GCS_WGS" in text or "4326" in text:
            return 4326
        if "3765" in text or "HTRS96" in text:
            return 3765
    return 3765


def rings_to_wgs84(parts: list, transformer: Transformer) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for part in parts:
        ring = []
        for x, y in part:
            lon, lat = transformer.transform(x, y)
            ring.append([lon, lat])
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) >= 4:
            rings.append(ring)
    return rings


def shp_multipolygons(shp_path: Path):
    """Generator (rec: dict, geom: dict) u WGS84 za poligonski SHP."""
    prj = shp_path.with_suffix(".prj")
    epsg = detect_epsg(prj if prj.exists() else None)
    transformer = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    sf = shapefile.Reader(str(shp_path), encoding="cp1250")
    fields = [f[0] for f in sf.fields[1:]]
    for sr in sf.shapeRecords():
        rec = {fields[j]: sr.record[j] for j in range(len(fields))}
        shape = sr.shape
        if not shape.points:
            continue
        parts = list(shape.parts) + [len(shape.points)]
        rings_xy = [shape.points[a:b] for a, b in zip(parts, parts[1:])]
        rings = rings_to_wgs84(rings_xy, transformer)
        if not rings:
            continue
        yield rec, {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}, epsg


# ---------------------------------------------------------------------------
# Zajedničko
# ---------------------------------------------------------------------------


def zavrsi_skup(conn: psycopg.Connection, sifra: str, n: int, napomena: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE meta.skup
            SET broj_zapisa = %s, zadnja_sinkronizacija = now()
            WHERE sifra = %s
            """,
            (n, sifra),
        )
        cur.execute(
            """
            INSERT INTO meta.sinkronizacija (skup_sifra, redaka, napomena)
            VALUES (%s, %s, %s)
            """,
            (sifra, n, napomena or None),
        )
    conn.commit()


def pridruzi_prostor(conn: psycopg.Connection, skup_sifra: str | None = None) -> None:
    """Postavi cetvrt_id i mo_id za objekte kojima nedostaju (PostGIS ST_Intersects)."""
    uvjet = "AND o.skup_sifra = %s" if skup_sifra else ""
    params = (skup_sifra,) if skup_sifra else ()
    with conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE geo.objekt o
            SET cetvrt_id = c.id
            FROM geo.cetvrt c
            WHERE o.cetvrt_id IS NULL {uvjet}
              AND ST_Intersects(c.geom, o.geom)
            """,
            params,
        )
        # Točke do 500 m izvan granice (npr. Sljeme) pridruži najbližoj četvrti.
        # Dalje od toga ostaju bez četvrti (izvan grada: Zaprešić, Stupnik…).
        cur.execute(
            f"""
            UPDATE geo.objekt o
            SET cetvrt_id = (
                SELECT c2.id FROM geo.cetvrt c2
                WHERE ST_DWithin(c2.geom::geography, o.geom::geography, 500)
                ORDER BY c2.geom <-> o.geom
                LIMIT 1
            )
            WHERE o.cetvrt_id IS NULL {uvjet}
            """,
            params,
        )
        cur.execute(
            f"""
            UPDATE geo.objekt o
            SET mo_id = m.id
            FROM geo.mo m
            WHERE o.mo_id IS NULL {uvjet}
              AND ST_Intersects(m.geom, ST_PointOnSurface(o.geom))
            """,
            params,
        )
        cur.execute(
            f"""
            UPDATE geo.objekt o
            SET mo_id = (
                SELECT m2.id FROM geo.mo m2
                WHERE m2.cetvrt_id = o.cetvrt_id
                  AND ST_DWithin(m2.geom::geography, o.geom::geography, 500)
                ORDER BY m2.geom <-> o.geom
                LIMIT 1
            )
            WHERE o.mo_id IS NULL AND o.cetvrt_id IS NOT NULL {uvjet}
            """,
            params,
        )
    conn.commit()


def zamijeni_objekte(conn: psycopg.Connection, sifra: str, rows: list[tuple]) -> None:
    """rows: (skup_sifra, vanjski_kljuc, tip, naziv, adresa, geojson, attrs_json)."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM geo.objekt WHERE skup_sifra = %s", (sifra,))
        cur.executemany(
            """
            INSERT INTO geo.objekt (
                skup_sifra, vanjski_kljuc, tip, naziv, adresa, geom, attrs
            ) VALUES (
                %s, %s, %s, %s, %s,
                ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                %s::jsonb
            )
            ON CONFLICT (skup_sifra, vanjski_kljuc) DO NOTHING
            """,
            [r for r in rows if r[5] is not None],
        )
    conn.commit()
    pridruzi_prostor(conn, sifra)


def _prvo(props: dict, kandidati: tuple[str, ...]) -> str | None:
    for k in kandidati:
        v = props.get(k)
        if v is not None and str(v).strip() not in ("", "None", "null"):
            # Izvori znaju imati prijelome redaka i višestruke razmake
            return re.sub(r"\s+", " ", str(v)).strip()
    return None


def preuzmi_tekst(meta: Skup, ime: str, ime_sadrzi: str | None = None) -> str:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format, ime_sadrzi=ime_sadrzi)
    path = DATA_DIR / meta.sifra / ime
    print(f"Preuzimam {url}")
    download(url, path)
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1250")


def citaj_csv(text: str) -> list[dict]:
    first = text.splitlines()[0] if text else ""
    delim = ";" if first.count(";") > first.count(",") else ","
    return [
        {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        for r in csv.DictReader(text.splitlines(), delimiter=delim)
    ]


def kljuc_jedinice(naziv: str) -> str:
    """Normalizirani ključ: bez prefiksa 'Mjesni odbor' / 'Gradska četvrt', slugified."""
    t = re.sub(r"^\s*(mjesni\s+odbor|gradska\s+četvrt|gradska\s+cetvrt|mo|gč|gc)\s+", "", naziv, flags=re.I)
    return slugify(t)


def mape_jedinica(conn: psycopg.Connection) -> tuple[dict[str, int], dict[str, tuple[int, int | None]]]:
    """ključ(naziv) -> id za četvrti i MO (MO nazivi su jedinstveni u gradu)."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, naziv FROM geo.cetvrt")
        cetvrti = {kljuc_jedinice(n): i for i, n in cur.fetchall()}
        cur.execute("SELECT id, naziv, cetvrt_id FROM geo.mo")
        mo = {kljuc_jedinice(n): (i, c) for i, n, c in cur.fetchall()}
    return cetvrti, mo


def _bool(v: object) -> bool:
    return str(v).strip().upper() in ("TRUE", "1", "DA", "YES", "T")


# ---------------------------------------------------------------------------
# Prostor: četvrti, MO, ulice
# ---------------------------------------------------------------------------


def sync_cetvrti(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    zip_path = DATA_DIR / meta.sifra / "cetvrti.zip"
    print(f"Preuzimam {url}")
    download(url, zip_path)
    shp = unzip_shp(zip_path, DATA_DIR / meta.sifra / "shp")

    rows = []
    epsg = 3765
    for i, (rec, geom, epsg) in enumerate(shp_multipolygons(shp)):
        naziv = str(rec.get("JMS_IME") or rec.get("NAZIV") or f"Četvrt {i + 1}").strip()
        sifra = str(rec.get("JMS_MB") or rec.get("SIFRA") or i + 1)
        try:
            oid = int(float(sifra.replace(",", ".")))
        except ValueError:
            oid = i + 1
        rows.append(
            (
                oid,
                sifra,
                naziv,
                slugify(naziv),
                json.dumps(geom),
                json.dumps({k: (None if v == "" else v) for k, v in rec.items()}, default=str),
            )
        )

    with conn.cursor() as cur:
        cur.execute("UPDATE geo.objekt SET cetvrt_id = NULL, mo_id = NULL")
        cur.execute("DELETE FROM geo.mo")
        cur.execute("DELETE FROM geo.cetvrt")
        cur.executemany(
            """
            INSERT INTO geo.cetvrt (id, sifra, naziv, slug, geom, attrs)
            VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s::jsonb)
            """,
            rows,
        )
    conn.commit()
    pridruzi_prostor(conn)
    zavrsi_skup(conn, meta.sifra, len(rows), f"epsg_izvor={epsg}")
    print(f"Učitano {len(rows)} četvrti")


def sync_mo(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    zip_path = DATA_DIR / meta.sifra / "mo.zip"
    print(f"Preuzimam {url}")
    download(url, zip_path)
    shp = unzip_shp(zip_path, DATA_DIR / meta.sifra / "shp")

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM geo.cetvrt")
        cetvrti = {r[0] for r in cur.fetchall()}

    rows = []
    slugovi: set[str] = set()
    for i, (rec, geom, _) in enumerate(shp_multipolygons(shp)):
        naziv = str(rec.get("JMS_IME") or f"MO {i + 1}").strip()
        sifra = str(rec.get("JMS_MB") or i + 1)
        try:
            oid = int(float(sifra))
        except ValueError:
            oid = i + 1
        try:
            cetvrt_id = int(float(str(rec.get("MBR_NADR") or "")))
        except ValueError:
            cetvrt_id = None
        if cetvrt_id not in cetvrti:
            cetvrt_id = None
        slug = slugify(naziv)
        if slug in slugovi:
            slug = f"{slug}-{oid}"
        slugovi.add(slug)
        rows.append(
            (
                oid,
                sifra,
                naziv,
                slug,
                cetvrt_id,
                json.dumps(geom),
                json.dumps({k: (None if v == "" else v) for k, v in rec.items()}, default=str),
            )
        )

    with conn.cursor() as cur:
        cur.execute("UPDATE geo.objekt SET mo_id = NULL")
        cur.execute("DELETE FROM geo.mo")
        cur.executemany(
            """
            INSERT INTO geo.mo (id, sifra, naziv, slug, cetvrt_id, geom, attrs)
            VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s::jsonb)
            """,
            rows,
        )
        # MO bez MBR_NADR: pridruži četvrt prostorno
        cur.execute(
            """
            UPDATE geo.mo m SET cetvrt_id = c.id
            FROM geo.cetvrt c
            WHERE m.cetvrt_id IS NULL
              AND ST_Intersects(c.geom, ST_PointOnSurface(m.geom))
            """
        )
    conn.commit()
    pridruzi_prostor(conn)
    zavrsi_skup(conn, meta.sifra, len(rows))
    print(f"Učitano {len(rows)} mjesnih odbora")


def normaliziraj_ulicu(ime: str) -> str:
    t = slugify(ime).replace("-", " ")
    t = re.sub(r"\b(ulica|ul|trg|cesta|put|prilaz|odvojak|aleja|avenija|av)\b", "", t)
    return re.sub(r"\s+", " ", t).strip()


def sync_ulice(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    path = DATA_DIR / meta.sifra / "rpj_ulica.csv"
    print(f"Preuzimam {url}")
    download(url, path)
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1250")
    first = text.splitlines()[0] if text else ""
    delim = ";" if first.count(";") > first.count(",") else ","

    rows = []
    for rec in csv.DictReader(text.splitlines(), delimiter=delim):
        jid = (rec.get("UL_JID") or "").strip()
        ime = (rec.get("UL_IME") or "").strip()
        if not jid or not ime:
            continue
        opis = next((v for k, v in rec.items() if k and k.startswith("Opis")), None)
        rows.append(
            (
                jid,
                ime,
                normaliziraj_ulicu(ime),
                (rec.get("NA_IME") or "").strip() or None,
                (rec.get("NA_MB") or "").strip() or None,
                (opis or "").strip() or None,
                (rec.get("datum_a") or "").strip() or None,
            )
        )

    with conn.cursor() as cur:
        cur.execute("DELETE FROM geo.ulica")
        cur.executemany(
            """
            INSERT INTO geo.ulica (ul_jid, ime, ime_norm, naselje, naselje_mb, opis, datum)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ul_jid) DO NOTHING
            """,
            rows,
        )
    conn.commit()
    zavrsi_skup(conn, meta.sifra, len(rows))
    print(f"Učitano {len(rows)} ulica")


# ---------------------------------------------------------------------------
# Živo: prometnice
# ---------------------------------------------------------------------------


def polyline_geojson(polyline: str | None) -> dict | None:
    if not polyline or not str(polyline).strip():
        return None
    parts = str(polyline).replace(",", " ").split()
    nums: list[float] = []
    for p in parts:
        try:
            nums.append(float(p))
        except ValueError:
            continue
    if len(nums) < 2:
        return None
    pts: list[list[float]] = []
    for i in range(0, len(nums) - 1, 2):
        a, b = nums[i], nums[i + 1]
        if u_zagrebu(b, a):  # Waze: lat lon
            pts.append([b, a])
        elif u_zagrebu(a, b):
            pts.append([a, b])
    if not pts:
        return None
    dedup = [pts[0]]
    for p in pts[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    if len(dedup) == 1:
        return {"type": "Point", "coordinates": dedup[0]}
    return {"type": "LineString", "coordinates": dedup}


def sync_prometnice(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    path = DATA_DIR / meta.sifra / "data.json"
    print(f"Preuzimam {url}")
    download(url, path)
    raw = json.loads(path.read_text(encoding="utf-8"))
    recs = raw if isinstance(raw, list) else []
    if isinstance(raw, dict):
        for key in ("incidents", "data", "results", "records"):
            if isinstance(raw.get(key), list):
                recs = raw[key]
                break

    rows = []
    for rec in recs:
        if not isinstance(rec, dict):
            continue
        typ = str(rec.get("type") or "").upper()
        if "ROAD_CLOSED" not in typ:
            continue
        ulica = str(rec.get("street") or "").strip()
        geom = polyline_geojson(str(rec.get("polyline") or ""))
        if not ulica and not geom:
            continue
        uid = hashlib.sha256(
            f"{ulica}|{rec.get('expectedStartTime')}|{rec.get('expectedEndTime')}|{rec.get('polyline')}".encode()
        ).hexdigest()[:24]
        attrs = {
            "tip": typ,
            "podtip": rec.get("subtype"),
            "smjer": rec.get("direction"),
            "od": rec.get("expectedStartTime"),
            "do": rec.get("expectedEndTime"),
        }
        rows.append(
            (
                meta.sifra,
                uid,
                meta.tip,
                ulica or "Zatvorena prometnica",
                None,
                json.dumps(geom) if geom else None,
                json.dumps(attrs, ensure_ascii=False),
            )
        )

    zamijeni_objekte(conn, meta.sifra, rows)
    zavrsi_skup(conn, meta.sifra, len(rows))
    print(f"Učitano {len(rows)} zatvaranja prometnica")


# ---------------------------------------------------------------------------
# Vrtići (CSV s X/Y) — gradski i privatni imaju isti oblik
# ---------------------------------------------------------------------------


def sync_vrtici_csv(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    path = DATA_DIR / meta.sifra / "data.csv"
    print(f"Preuzimam {url}")
    download(url, path)

    rows = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for rec in csv.DictReader(f):
            naziv = (rec.get("Naziv") or "").strip()
            if not naziv:
                continue
            try:
                lon = float((rec.get("X") or "").replace(",", "."))
                lat = float((rec.get("Y") or "").replace(",", "."))
            except ValueError:
                continue
            if not u_zagrebu(lon, lat):
                continue
            sid = (rec.get("Id") or rec.get("ID") or "").strip() or hashlib.sha256(
                f"{naziv}|{rec.get('Adresa')}".encode()
            ).hexdigest()[:12]
            attrs = {
                "telefon": rec.get("Telefon") or None,
                "email": rec.get("Email") or None,
                "web": rec.get("Web") or None,
                "vrsta": rec.get("VrstaVrtica") or None,
                "maticni_podrucni": rec.get("TipVrtica") or None,
                "cetvrt_naziv": rec.get("GradskaCetvrt") or None,
            }
            rows.append(
                (
                    meta.sifra,
                    sid,
                    meta.tip,
                    naziv,
                    (rec.get("Adresa") or "").strip() or None,
                    json.dumps({"type": "Point", "coordinates": [lon, lat]}),
                    json.dumps(attrs, ensure_ascii=False),
                )
            )

    zamijeni_objekte(conn, meta.sifra, rows)
    zavrsi_skup(conn, meta.sifra, len(rows))
    print(f"Učitano {len(rows)} ({meta.sifra})")


# ---------------------------------------------------------------------------
# Geoportal točkasti GeoJSON (generički)
# ---------------------------------------------------------------------------


def _tocka(geom: dict | None) -> list[float] | None:
    if not geom or not isinstance(geom, dict):
        return None
    t = geom.get("type")
    c = geom.get("coordinates")
    if t == "Point" and isinstance(c, list) and len(c) >= 2:
        return [float(c[0]), float(c[1])]
    if t == "MultiPoint" and isinstance(c, list) and c:
        p = c[0]
        if isinstance(p, list) and len(p) >= 2:
            return [float(p[0]), float(p[1])]
    return None


def _dijelovi_poligona(geom: dict) -> list[dict]:
    """MultiPolygon → zasebni Polygon (npr. pješačke zone kao jedan CKAN zapis)."""
    if geom.get("type") == "Polygon" and geom.get("coordinates"):
        return [geom]
    if geom.get("type") == "MultiPolygon":
        return [{"type": "Polygon", "coordinates": p} for p in (geom.get("coordinates") or []) if p]
    return [geom]


def _geom_za_bazu(geom: dict | None, meta: Skup) -> dict | None:
    """Točkasti skupovi → Point unutar Zagreba; poligonski → izvorni (Multi)Polygon."""
    if not geom or not isinstance(geom, dict):
        return None
    if meta.geometrija == "poligon":
        if geom.get("type") in ("Polygon", "MultiPolygon") and geom.get("coordinates"):
            return geom
        return None
    if meta.geometrija == "linija":
        if geom.get("type") in ("LineString", "MultiLineString") and geom.get("coordinates"):
            return geom
        return None
    coords = _tocka(geom)
    if not coords or not u_zagrebu(*coords):
        return None
    return {"type": "Point", "coordinates": coords}


def sync_geoportal(conn: psycopg.Connection, meta: Skup) -> None:
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    path = DATA_DIR / meta.sifra / "data.geojson"
    print(f"Preuzimam {url}")
    download(url, path)
    fc = json.loads(path.read_text(encoding="utf-8"))
    feats = fc.get("features") if isinstance(fc, dict) else []
    if not isinstance(feats, list):
        raise RuntimeError(f"Neočekivan GeoJSON za {meta.sifra}")

    KANONSKA = ("naziv", "adresa", "telefon", "email", "web", "cetvrt_naziv", "vrsta")
    rows = []
    preskoceno = 0
    for feat in feats:
        if not isinstance(feat, dict):
            continue
        props = feat.get("properties") or {}
        if not isinstance(props, dict):
            continue
        geom = _geom_za_bazu(feat.get("geometry"), meta)
        if not geom:
            preskoceno += 1
            continue
        kan = {k: _prvo(props, meta.polja.get(k, ())) for k in KANONSKA}
        # Izvor ponekad stavi web u polje telefona (npr. domovi zdravlja)
        tel = kan.get("telefon") or ""
        if "www." in tel or "http" in tel or "@" in tel:
            if "@" in tel and not kan.get("email"):
                kan["email"] = tel
            elif "@" not in tel and not kan.get("web"):
                kan["web"] = tel
            kan["telefon"] = None
        naziv = kan["naziv"]
        if not naziv:
            if kan["vrsta"] and kan["adresa"]:
                naziv = f"{kan['vrsta'][:1].upper()}{kan['vrsta'][1:]} · {kan['adresa']}"
            else:
                kratki = re.sub(r"^Geoportal\s+", "", meta.naziv)
                if kan["adresa"]:
                    naziv = f"{kratki} · {kan['adresa']}"
                else:
                    naziv = f"{kratki} #{props.get('OBJECTID', '')}".strip()
        oid = str(
            props.get("OBJECTID")
            or props.get("objectid")
            or props.get("GlobalID")
            or hashlib.sha256(f"{naziv}|{kan['adresa']}".encode()).hexdigest()[:12]
        )
        iskoristeni = {k for kand in meta.polja.values() for k in kand}
        ostalo = {
            k: v
            for k, v in props.items()
            if k not in iskoristeni
            and k not in ("OBJECTID", "objectid", "GlobalID", "Shape__Area", "Shape__Length")
            and v not in (None, "", " ")
        }
        attrs = {k: v for k, v in kan.items() if k not in ("naziv", "adresa") and v}
        if ostalo:
            attrs["ostalo"] = ostalo
        dijelovi = _dijelovi_poligona(geom) if meta.sifra == "pjesacke_zone" else [geom]
        for i, g in enumerate(dijelovi):
            oid_i = oid if len(dijelovi) == 1 else f"{oid}-{i + 1}"
            naziv_i = naziv if len(dijelovi) == 1 else f"{naziv} ({i + 1})"
            rows.append(
                (
                    meta.sifra,
                    oid_i,
                    meta.tip,
                    naziv_i,
                    kan["adresa"],
                    json.dumps(g),
                    json.dumps(attrs, ensure_ascii=False, default=str),
                )
            )

    zamijeni_objekte(conn, meta.sifra, rows)
    if meta.geometrija == "poligon":
        # Poligoni koji pokrivaju više četvrti ne pripadaju jednoj
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE geo.objekt SET cetvrt_id = NULL, mo_id = NULL WHERE skup_sifra = %s",
                (meta.sifra,),
            )
        conn.commit()
    nap = f"preskočeno_bez_geometrije={preskoceno}" if preskoceno else ""
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} ({meta.sifra}){' · ' + nap if nap else ''}")


# ---------------------------------------------------------------------------
# Lokalna demokracija (tablice na dosjeu)
# ---------------------------------------------------------------------------


def sync_predsjednici_gc(conn: psycopg.Connection, meta: Skup) -> None:
    text = preuzmi_tekst(meta, "data.json")
    recs = json.loads(text)
    if isinstance(recs, dict):
        recs = next((v for v in recs.values() if isinstance(v, list)), [])
    cetvrti, _ = mape_jedinica(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT id, naziv FROM geo.cetvrt")
        naziv_po_id = dict(cur.fetchall())
    rows = []
    nespojeno = []
    for r in recs:
        if not isinstance(r, dict):
            continue
        naziv = str(r.get("GradskaCetvrt") or "").strip()
        cid = cetvrti.get(kljuc_jedinice(naziv))
        if cid is None:
            nespojeno.append(naziv)
            continue
        rows.append(
            (
                cid,
                naziv_po_id.get(cid, naziv),
                str(r.get("Predsjednik") or "").strip(),
                str(r.get("Adresa") or "").strip() or None,
                str(r.get("Telefon") or "").strip() or None,
                str(r.get("Email") or "").strip() or None,
                str(r.get("EmailPodrucni") or "").strip() or None,
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM uprava.predsjednik_gc")
        cur.executemany(
            """
            INSERT INTO uprava.predsjednik_gc
                (cetvrt_id, cetvrt_naziv, ime, adresa, telefon, email, email_podrucni)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (cetvrt_id) DO UPDATE SET
                ime = EXCLUDED.ime, adresa = EXCLUDED.adresa, telefon = EXCLUDED.telefon,
                email = EXCLUDED.email, email_podrucni = EXCLUDED.email_podrucni
            """,
            rows,
        )
    conn.commit()
    nap = f"nespojeno={nespojeno}" if nespojeno else ""
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} predsjednika GČ{' · ' + nap if nap else ''}")


def sync_predsjednici_mo(conn: psycopg.Connection, meta: Skup) -> None:
    recs = citaj_csv(preuzmi_tekst(meta, "data.csv"))
    cetvrti, mo = mape_jedinica(conn)
    rows = []
    nespojeno = 0
    for r in recs:
        mo_naziv = r.get("mjesni_odbor") or ""
        m = mo.get(kljuc_jedinice(mo_naziv))
        if not m:
            nespojeno += 1
            continue
        mo_id, cid = m
        if cid is None:
            cid = cetvrti.get(kljuc_jedinice(r.get("gradska_cetvrt") or ""))
        rows.append(
            (
                mo_id,
                mo_naziv,
                cid,
                (r.get("predsjednik_mo") or "").strip().title(),
                r.get("adresa_mjesni_odbor") or None,
                r.get("telefon1_predsjednika_mo") or None,
                r.get("email_predsjednika_mo") or None,
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM uprava.predsjednik_mo")
        cur.executemany(
            """
            INSERT INTO uprava.predsjednik_mo
                (mo_id, mo_naziv, cetvrt_id, ime, adresa, telefon, email)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (mo_id) DO UPDATE SET
                ime = EXCLUDED.ime, adresa = EXCLUDED.adresa,
                telefon = EXCLUDED.telefon, email = EXCLUDED.email
            """,
            rows,
        )
    conn.commit()
    nap = f"nespojeno_mo={nespojeno}" if nespojeno else ""
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} predsjednika MO{' · ' + nap if nap else ''}")


def sync_clanovi_vijeca(conn: psycopg.Connection, meta: Skup) -> None:
    razina = meta.tip  # 'gc' ili 'mo'
    recs = citaj_csv(preuzmi_tekst(meta, "data.csv"))
    cetvrti, mo = mape_jedinica(conn)
    rows = []
    nespojeno = 0
    for r in recs:
        ime = r.get("prezime_ime") or ""
        if not ime:
            continue
        if razina == "gc":
            jed = r.get("gradska_cetvrt") or ""
            cid = cetvrti.get(kljuc_jedinice(jed))
            mo_id = None
            if cid is None:
                nespojeno += 1
        else:
            jed = r.get("mjesni_odbor") or ""
            m = mo.get(kljuc_jedinice(jed))
            mo_id, cid = m if m else (None, None)
            if m is None:
                nespojeno += 1
        rows.append(
            (
                razina,
                r.get("id") or None,
                cid,
                mo_id,
                jed,
                ime,
                (r.get("funkcija") or "").lower() or None,
                r.get("politicka_stranka") or None,
                r.get("opis_promjena") or None,
                _bool(r.get("aktivan", "TRUE")),
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM uprava.clan_vijeca WHERE razina = %s", (razina,))
        cur.executemany(
            """
            INSERT INTO uprava.clan_vijeca
                (razina, vanjski_id, cetvrt_id, mo_id, jedinica_naziv, prezime_ime,
                 funkcija, stranka, opis_promjena, aktivan)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
    conn.commit()
    nap = f"nespojeno={nespojeno}" if nespojeno else ""
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} članova vijeća ({razina}){' · ' + nap if nap else ''}")


def sync_prostori_ms(conn: psycopg.Connection, meta: Skup) -> None:
    text = preuzmi_tekst(meta, "data.json")
    recs = json.loads(text)
    if isinstance(recs, dict):
        recs = next((v for v in recs.values() if isinstance(v, list)), [])
    cetvrti, mo = mape_jedinica(conn)
    rows = []
    for r in recs:
        if not isinstance(r, dict):
            continue
        prostorija = str(r.get("prostorija") or "").strip()
        if not prostorija:
            continue
        mo_naziv = str(r.get("mjesni_odbor") or "").strip() or None
        c_naziv = str(r.get("gradska_cetvrt") or "").strip() or None
        m = mo.get(kljuc_jedinice(mo_naziv)) if mo_naziv else None
        mo_id, cid = m if m else (None, None)
        if cid is None and c_naziv:
            cid = cetvrti.get(kljuc_jedinice(c_naziv))
        rez = r.get("rezervacija")
        termina = 0
        if isinstance(rez, dict):
            dani = rez.get("dani") if isinstance(rez.get("dani"), dict) else {}
            termina = sum(1 for d in dani.values() if isinstance(d, dict) and (d.get("starthour") or ""))
        rows.append(
            (
                mo_id,
                cid,
                mo_naziv,
                c_naziv,
                prostorija,
                termina,
                json.dumps(rez, ensure_ascii=False) if rez is not None else None,
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM uprava.prostor_ms")
        cur.executemany(
            """
            INSERT INTO uprava.prostor_ms
                (mo_id, cetvrt_id, mo_naziv, cetvrt_naziv, prostorija, broj_termina, rezervacija)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            rows,
        )
    conn.commit()
    zavrsi_skup(conn, meta.sifra, len(rows))
    print(f"Učitano {len(rows)} prostorija mjesne samouprave")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Energija: ISGE potrošnja i trošak gradskih objekata (površina D)
# ---------------------------------------------------------------------------

ISGE_SKUPOVI_ZA_SPAJANJE = (
    "vrtici", "privatni_vrtici", "osnovne", "srednje", "ucenicki_domovi", "visoka",
    "studentski_restorani", "studentska_naselja", "odgojno",
    "zdravstvo", "domovi_zdravlja", "stariji", "osi", "domovi_djeca", "odmorko",
    "soc_skrb", "beskucnici", "branitelji",
    "sport", "kultura",
    "reciklazna", "trznice", "garaze", "vatrogasci",
    "sjedista_gc", "sjedista_mo", "podrucni_uredi",
)


def _broj(v: str) -> float | None:
    v = (v or "").strip().replace(" ", "")
    if not v:
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return None


def sync_isge(conn: psycopg.Connection, meta: Skup) -> None:
    """CSV 01/2019–06/2024, ~420k redaka po mjerilu/mjesecu → agregat po objektu/energentu/mjesecu."""
    url = ckan_resource_url(meta.paket_id, meta.preferirani_format)
    path = DATA_DIR / meta.sifra / "isge.csv"
    print(f"Preuzimam {url}")
    download(url, path)

    objekti: dict[str, dict] = {}
    agg: dict[tuple[str, str, int, int], list[float]] = {}
    storno = 0
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rdr = csv.reader(fh, delimiter=";")
        hdr = next(rdr)
        # stupci: naziv, posta, mjesto, adresa, energent, mjerilo, godina, mjesec, kolicina, kwh, eur
        if len(hdr) < 11:
            raise RuntimeError(f"Neočekivano zaglavlje ISGE: {hdr}")
        for r in rdr:
            if len(r) < 11:
                continue
            naziv = re.sub(r"\s+", " ", r[0]).strip()
            adresa = re.sub(r"\s+", " ", r[3]).strip()
            if not naziv:
                continue
            kljuc = slugify(f"{naziv}|{adresa}")[:200]
            o = objekti.setdefault(
                kljuc,
                {"naziv": naziv, "adresa": adresa or None, "posta": r[1].strip() or None,
                 "mjesto": r[2].strip() or None, "mjerila": set(), "energenti": set()},
            )
            o["mjerila"].add(r[5].strip())
            energent = r[4].strip() or "Nepoznato"
            o["energenti"].add(energent)
            try:
                god, mj = int(r[6]), int(r[7])
            except ValueError:
                continue
            kol, kwh, eur = _broj(r[8]), _broj(r[9]), _broj(r[10])
            # Korekcijski/storno redovi (negativne količine) ne ulaze u zbroj; brojimo ih za katalog E.
            if any(v is not None and v < 0 for v in (kol, kwh, eur)):
                storno += 1
                continue
            k = (kljuc, energent, god, mj)
            a = agg.setdefault(k, [0.0, 0.0, 0.0])
            for i, v in enumerate((kol, kwh, eur)):
                if v is not None:
                    a[i] += v

    with conn.cursor() as cur:
        cur.execute("SELECT kljuc, id FROM energy.objekt")
        postojeci = dict(cur.fetchall())
        cur.executemany(
            """
            INSERT INTO energy.objekt (kljuc, naziv, adresa, mjesto, posta, adresa_norm, kucni_broj,
                                       broj_mjerila, energenti)
            VALUES (%s, %s, %s, %s, %s, geo.norm_adresa(%s), geo.kucni_broj(%s), %s, %s)
            ON CONFLICT (kljuc) DO UPDATE SET
                naziv = EXCLUDED.naziv, adresa = EXCLUDED.adresa, mjesto = EXCLUDED.mjesto,
                posta = EXCLUDED.posta, adresa_norm = EXCLUDED.adresa_norm,
                kucni_broj = EXCLUDED.kucni_broj, broj_mjerila = EXCLUDED.broj_mjerila,
                energenti = EXCLUDED.energenti
            """,
            [
                (k, o["naziv"], o["adresa"], o["mjesto"], o["posta"], o["adresa"], o["adresa"],
                 len(o["mjerila"]), sorted(o["energenti"]))
                for k, o in objekti.items()
            ],
        )
        cur.execute("SELECT kljuc, id FROM energy.objekt")
        ids = dict(cur.fetchall())
        nestali = [i for k, i in postojeci.items() if k not in objekti]
        if nestali:
            cur.execute("DELETE FROM energy.objekt WHERE id = ANY(%s)", (nestali,))

        cur.execute("TRUNCATE energy.potrosnja")
        with cur.copy(
            "COPY energy.potrosnja (objekt_id, energent, godina, mjesec, kolicina, kwh, eur) FROM STDIN"
        ) as cp:
            for (k, energent, god, mj), (kol, kwh, eur) in agg.items():
                cp.write_row((ids[k], energent, god, mj, round(kol, 4), round(kwh, 4), round(eur, 4)))

        cur.execute(
            """
            UPDATE energy.objekt o SET
                od = s.od, "do" = s.do, kwh_ukupno = s.kwh, eur_ukupno = s.eur
            FROM (
                SELECT objekt_id,
                       make_date(min(godina * 100 + mjesec) / 100, min(godina * 100 + mjesec) % 100, 1) AS od,
                       make_date(max(godina * 100 + mjesec) / 100, max(godina * 100 + mjesec) % 100, 1) AS do,
                       sum(kwh) AS kwh, sum(eur) AS eur
                FROM energy.potrosnja GROUP BY objekt_id
            ) s WHERE s.objekt_id = o.id
            """
        )
    conn.commit()

    n_spojeno = spoji_isge(conn)
    n_karta = isge_na_kartu(conn, meta)
    zavrsi_skup(
        conn,
        meta.sifra,
        len(objekti),
        f"{len(agg)} agregiranih mjeseci; storno_iskljuceno={storno}; "
        f"{n_spojeno}/{len(objekti)} objekata spojeno na registar, {n_karta} na karti",
    )
    print(
        f"Učitano {len(objekti)} objekata ISGE, {len(agg)} redaka potrošnje; spojeno {n_spojeno}, na karti {n_karta}"
    )


_ISGE_KAND_SQL = """
    SELECT e.id AS eid, g.id AS gid, g.skup_sifra, g.naziv, g.geom, g.cetvrt_id, g.mo_id,
           similarity(unaccent(lower(e.naziv)), unaccent(lower(g.naziv))) AS sim,
           row_number() OVER (
               PARTITION BY e.id
               ORDER BY similarity(unaccent(lower(e.naziv)), unaccent(lower(g.naziv))) DESC, g.id
           ) AS rn
    FROM energy.objekt e
    JOIN geo.objekt g ON g.skup_sifra = ANY(%s) AND ({spoj})
    WHERE e.geo_objekt_id IS NULL
"""

_ISGE_UPDATE_SQL = """
    UPDATE energy.objekt e SET
        geo_objekt_id = k.gid, geo_skup = k.skup_sifra, geo_naziv = k.naziv,
        geom = k.geom, cetvrt_id = k.cetvrt_id, mo_id = k.mo_id,
        metoda = %s, pouzdanost = {pouzdanost}
    FROM kand k WHERE k.eid = e.id AND k.rn = 1 AND k.sim >= %s
"""


def spoji_isge(conn: psycopg.Connection) -> int:
    """Entity resolution ISGE objekt → geo.objekt: adresa (ulica + kućni broj), zatim sličnost naziva."""
    skupovi = list(ISGE_SKUPOVI_ZA_SPAJANJE)
    koraci = [
        # (spoj uvjet, metoda, pouzdanost-izraz, min sim)
        (
            "geo.ulica_norm(e.adresa) = geo.ulica_norm(g.adresa) AND e.kucni_broj <> '' AND e.kucni_broj = g.kucni_broj",
            "adresa",
            "CASE WHEN k.sim >= 0.3 THEN 'visoka' ELSE 'srednja' END",
            0.0,
        ),
        (
            "geo.ulica_norm(e.adresa) IS NOT NULL AND geo.ulica_norm(e.adresa) = geo.ulica_norm(g.adresa)",
            "ulica+naziv",
            "'srednja'",
            0.45,
        ),
        # samo naziv; MS/MO objekti ("Gradska četvrt X - MO Y") ne smiju pasti na sjedište GČ
        (
            "unaccent(lower(e.naziv)) %% unaccent(lower(g.naziv)) AND unaccent(lower(e.naziv)) NOT LIKE 'gradska cetvrt%%'"
            " AND g.skup_sifra NOT IN ('sjedista_mo', 'sjedista_gc')",
            "naziv",
            "'niska'",
            0.6,
        ),
    ]
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE geo.objekt SET adresa_norm = geo.norm_adresa(adresa), kucni_broj = geo.kucni_broj(adresa)
            WHERE adresa IS NOT NULL AND (adresa_norm IS NULL OR kucni_broj IS NULL)
            """
        )
        cur.execute(
            """
            UPDATE energy.objekt SET geo_objekt_id = NULL, geo_skup = NULL, geo_naziv = NULL,
                                     metoda = NULL, pouzdanost = NULL, geom = NULL, cetvrt_id = NULL, mo_id = NULL
            """
        )
        for spoj, metoda, pouz, min_sim in koraci:
            sql = "WITH kand AS (" + _ISGE_KAND_SQL.format(spoj=spoj) + ")" + _ISGE_UPDATE_SQL.format(pouzdanost=pouz)
            cur.execute(sql, (skupovi, metoda, min_sim))
        # četvrt iz naziva ("Gradska četvrt TREŠNJEVKA - JUG - MS Gajevo") ili iz mjesta (Sesvete)
        cur.execute("SELECT id, naziv FROM geo.cetvrt")
        for cid, cnaziv in cur.fetchall():
            cur.execute(
                """
                UPDATE energy.objekt SET cetvrt_id = %s, metoda = coalesce(metoda, 'naziv četvrti')
                WHERE cetvrt_id IS NULL
                  AND unaccent(lower(naziv)) LIKE '%%gradska cetvrt ' || unaccent(lower(%s)) || '%%'
                """,
                (cid, cnaziv),
            )
        cur.execute(
            """
            UPDATE energy.objekt e SET cetvrt_id = c.id, metoda = coalesce(e.metoda, 'mjesto')
            FROM geo.cetvrt c
            WHERE e.cetvrt_id IS NULL AND lower(e.mjesto) = 'sesvete' AND lower(c.naziv) = 'sesvete'
            """
        )
        cur.execute("SELECT count(*) FROM energy.objekt WHERE geo_objekt_id IS NOT NULL")
        n = cur.fetchone()[0]
    conn.commit()
    return n


def isge_na_kartu(conn: psycopg.Connection, meta: Skup) -> int:
    """Spojeni ISGE objekti kao točkasti sloj (skup 'isge') s godišnjim sažecima u attrs."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.naziv, e.adresa, ST_AsGeoJSON(e.geom), e.geo_skup, e.geo_naziv, e.pouzdanost,
                   e.energenti, e.od, e."do",
                   (SELECT jsonb_object_agg(godina, jsonb_build_object('kwh', round(kwh), 'eur', round(eur)))
                      FROM (SELECT godina, sum(kwh) kwh, sum(eur) eur
                              FROM energy.potrosnja p WHERE p.objekt_id = e.id GROUP BY godina) g) AS godine
            FROM energy.objekt e WHERE e.geom IS NOT NULL
            """
        )
        rows = []
        for eid, naziv, adresa, gj, gskup, gnaziv, pouz, energenti, od, do, godine in cur.fetchall():
            godine = godine or {}
            zadnja_puna = max((g for g in godine if int(g) < do.year), default=None) if do else None
            attrs = {
                "energy_id": eid,
                "spojen_na_skup": gskup,
                "spojen_na": gnaziv,
                "pouzdanost": pouz,
                "energenti": ", ".join(energenti or []),
                "razdoblje": f"{od:%m/%Y} – {do:%m/%Y}" if od and do else None,
                "godine": godine,
            }
            if zadnja_puna is not None:
                attrs["zadnja_puna_godina"] = int(zadnja_puna)
                attrs["kwh_zadnja_puna_godina"] = godine[zadnja_puna]["kwh"]
                attrs["eur_zadnja_puna_godina"] = godine[zadnja_puna]["eur"]
            rows.append((meta.sifra, str(eid), meta.tip, naziv, adresa, gj, json.dumps(attrs, ensure_ascii=False)))
    zamijeni_objekte(conn, meta.sifra, rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Korpus v1.3: GTFS, asset lista, zrak 2023, geokodirani CSV-ovi
# ---------------------------------------------------------------------------

GTFS_URL = "https://www.zet.hr/gtfs-scheduled/latest"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
ZRAK_PAKETI = {
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-dordiceva-2023": "Đorđićeva ulica",
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-ksaver-2023": "Ksaverska cesta",
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-siget-2023": "Siget",
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-pescenica-2023": "Peščenica",
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-susedgrad-2023": "Susedgrad",
    "podaci-o-kvaliteti-zraka-u-gradu-zagrebu-prilaz-baruna-filipovica-2023": "Prilaz baruna Filipovića",
}


def _dekodiraj(raw: bytes) -> str:
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig")
    for enc in ("utf-8", "cp1250", "iso-8859-2"):
        try:
            t = raw.decode(enc)
            if "\ufffd" not in t[:800]:
                return t
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _xlsx_redovi(raw: bytes) -> list[list[str]]:
    """Minimalni čitač .xlsx (prvi list s 'Datum' u zaglavlju)."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(BytesIO(raw))
    strings: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", ns):
            strings.append("".join(t.text or "" for t in si.findall(".//m:t", ns)))

    def colrow(ref: str) -> tuple[int, int]:
        m = re.match(r"([A-Z]+)(\d+)", ref or "")
        if not m:
            return 0, 0
        n = 0
        for c in m.group(1):
            n = n * 26 + (ord(c) - 64)
        return n, int(m.group(2))

    sheets = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
    best: list[list[str]] = []
    for name in sheets:
        root = ET.fromstring(z.read(name))
        grid: dict[tuple[int, int], str] = {}
        max_c = 0
        max_r = 0
        for c in root.findall(".//m:c", ns):
            ref = c.get("r") or ""
            col, row = colrow(ref)
            if not col:
                continue
            v = c.find("m:v", ns)
            if v is None or v.text is None:
                continue
            val = strings[int(float(v.text))] if c.get("t") == "s" else v.text
            grid[(row, col)] = val
            max_c = max(max_c, col)
            max_r = max(max_r, row)
        if max_r < 2:
            continue
        redovi = [[grid.get((r, c), "") for c in range(1, max_c + 1)] for r in range(1, max_r + 1)]
        hdr = " ".join(redovi[0]).lower()
        if "datum" in hdr and len(redovi) > len(best):
            best = redovi
        elif not best:
            best = redovi
    return best


def _excel_datum(v: str) -> date | None:
    v = (v or "").strip()
    if not v:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", v):
        y, m, d = (int(x) for x in v[:10].split("-"))
        return date(y, m, d)
    try:
        n = int(float(v.replace(",", ".")))
    except ValueError:
        return None
    if n < 20000 or n > 60000:
        return None
    return date(1899, 12, 30) + timedelta(days=n)


def geokod_nominatim(conn: psycopg.Connection, upit: str) -> tuple[float, float] | None:
    """Best-effort točka u Zagrebu; predmemorija u meta.geokod. 1 zahtjev/s prema Nominatimu."""
    upit = re.sub(r"\s+", " ", upit).strip()
    if len(upit) < 4:
        return None
    with conn.cursor() as cur:
        cur.execute("SELECT lon, lat FROM meta.geokod WHERE upit = %s", (upit,))
        row = cur.fetchone()
        if row:
            return (row[0], row[1]) if row[0] is not None and row[1] is not None else None
    time.sleep(1.05)
    try:
        r = httpx.get(
            NOMINATIM,
            params={
                "q": upit,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "hr",
                "viewbox": "15.6,46.05,16.4,45.6",
            },
            headers=UA,
            timeout=30,
        )
        r.raise_for_status()
        hits = r.json()
        lon = lat = None
        if hits:
            lon, lat = float(hits[0]["lon"]), float(hits[0]["lat"])
            if not u_zagrebu(lon, lat):
                lon = lat = None
    except Exception as e:  # noqa: BLE001
        print(f"  (geokod '{upit[:40]}': {type(e).__name__})")
        lon = lat = None
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta.geokod (upit, lon, lat, izvor)
            VALUES (%s, %s, %s, 'nominatim')
            ON CONFLICT (upit) DO UPDATE SET lon = EXCLUDED.lon, lat = EXCLUDED.lat, fetched_at = now()
            """,
            (upit, lon, lat),
        )
    conn.commit()
    return (lon, lat) if lon is not None and lat is not None else None


def geokod_raskrize(conn: psycopg.Connection, ulice: list[str]) -> tuple[float, float] | None:
    """Sjecište dviju ulica preko Overpassa, inače Nominatim prve ulice."""
    cisti = [re.sub(r"\s+", " ", u).strip() for u in ulice if u.strip()]
    if not cisti:
        return None
    kljuc = " ∩ ".join(cisti)
    with conn.cursor() as cur:
        cur.execute("SELECT lon, lat FROM meta.geokod WHERE upit = %s", (kljuc,))
        row = cur.fetchone()
        if row and row[0] is not None:
            return (row[0], row[1])
        if row and row[0] is None:
            pass  # stari promašaj — pokušaj opet s Overpassom
    if len(cisti) >= 2:
        def rx(s: str) -> str:
            s = re.sub(r"^\s*(ulica|ul\.|cesta|trg|prilaz)\s+", "", s, flags=re.I)
            jezgra = (s.split() or [s])[0][:10]
            return re.sub(r"[^\wčćšžđČĆŠŽĐ]", ".", jezgra)

        q = (
            '[out:json][timeout:20];'
            f'way(45.68,15.72,45.98,16.28)["highway"]["name"~"{rx(cisti[0])}",i]->.a;'
            f'way(45.68,15.72,45.98,16.28)["highway"]["name"~"{rx(cisti[1])}",i]->.b;'
            'node(w.a)(w.b); out 1;'
        )
        try:
            time.sleep(1.05)
            r = httpx.post(
                "https://overpass-api.de/api/interpreter",
                content=q.encode("utf-8"),
                headers={**UA, "Content-Type": "text/plain; charset=utf-8"},
                timeout=40,
            )
            r.raise_for_status()
            els = (r.json() or {}).get("elements") or []
            if els and "lon" in els[0]:
                lon, lat = float(els[0]["lon"]), float(els[0]["lat"])
                if u_zagrebu(lon, lat):
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO meta.geokod (upit, lon, lat, izvor)
                            VALUES (%s, %s, %s, 'overpass')
                            ON CONFLICT (upit) DO UPDATE SET lon = EXCLUDED.lon, lat = EXCLUDED.lat,
                                izvor = EXCLUDED.izvor, fetched_at = now()
                            """,
                            (kljuc, lon, lat),
                        )
                    conn.commit()
                    return (lon, lat)
        except Exception as e:  # noqa: BLE001
            print(f"  (overpass '{kljuc[:40]}': {type(e).__name__})")
    pt = geokod_nominatim(conn, f"{cisti[0]}, Zagreb")
    if pt:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO meta.geokod (upit, lon, lat, izvor)
                VALUES (%s, %s, %s, 'nominatim-ulica')
                ON CONFLICT (upit) DO UPDATE SET lon = EXCLUDED.lon, lat = EXCLUDED.lat,
                    izvor = EXCLUDED.izvor, fetched_at = now()
                """,
                (kljuc, pt[0], pt[1]),
            )
        conn.commit()
    return pt


def toccka_iz_adrese(conn: psycopg.Connection, adresa: str, naziv: str = "") -> dict | None:
    """Geometrija postojećeg objekta s istom ulicom i kućnim brojem, inače None."""
    if not (adresa or "").strip():
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ST_AsGeoJSON(geom)
            FROM geo.objekt
            WHERE adresa IS NOT NULL
              AND geo.kucni_broj(adresa) <> ''
              AND geo.kucni_broj(adresa) = geo.kucni_broj(%s)
              AND geo.ulica_norm(adresa) = geo.ulica_norm(%s)
            ORDER BY similarity(unaccent(lower(coalesce(naziv,''))), unaccent(lower(%s))) DESC NULLS LAST
            LIMIT 1
            """,
            (adresa, adresa, naziv or adresa),
        )
        row = cur.fetchone()
    if not row:
        return None
    return json.loads(row[0])


def sync_signalizatori(conn: psycopg.Connection, meta: Skup) -> None:
    recs = citaj_csv(preuzmi_tekst(meta, "data.csv"))
    rows = []
    bez = 0
    for i, r in enumerate(recs, start=1):
        raskrize = (r.get("NAZIV RASKRIŽJA") or r.get("NAZIV RASKRIZJA") or "").strip()
        if not raskrize:
            continue
        n_ur = r.get("BROJ UREĐAJA") or r.get("BROJ UREDAJA") or ""
        ulice = re.split(r"\s*[-–/]\s*", raskrize)
        pt = geokod_raskrize(conn, ulice)
        if not pt:
            bez += 1
            continue
        geom = {"type": "Point", "coordinates": [pt[0], pt[1]]}
        attrs = {"vrsta": "zvučni signalizator", "broj_uredaja": str(n_ur).strip() or None}
        rows.append(
            (
                meta.sifra,
                str(i),
                meta.tip,
                raskrize.title(),
                raskrize,
                json.dumps(geom),
                json.dumps({k: v for k, v in attrs.items() if v}, ensure_ascii=False),
            )
        )
    zamijeni_objekte(conn, meta.sifra, rows)
    nap = f"geokodirano={len(rows)}; bez_koordinate={bez}"
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} signalizatora · {nap}")


def sync_zeleni_otoci(conn: psycopg.Connection, meta: Skup) -> None:
    recs = citaj_csv(preuzmi_tekst(meta, "data.csv"))
    rows = []
    bez = 0
    for i, r in enumerate(recs, start=1):
        ulica = (r.get("ULICA") or "").strip()
        opis = (r.get("LOKACIJA (OPIS)") or r.get("LOKACIJA") or "").strip()
        cetvrt = (r.get("GRADSKA ČETVRT") or r.get("GRADSKA CETVRT") or "").strip()
        if not ulica and not opis:
            continue
        naziv = ulica or opis
        geom_obj = toccka_iz_adrese(conn, ulica, naziv)
        if not geom_obj:
            upit = f"{ulica}, {cetvrt}, Zagreb" if cetvrt else f"{ulica}, Zagreb"
            pt = geokod_nominatim(conn, upit)
            if not pt:
                bez += 1
                continue
            geom_obj = {"type": "Point", "coordinates": [pt[0], pt[1]]}
        attrs = {"vrsta": "zeleni otok", "opis": opis or None, "cetvrt_naziv": cetvrt or None}
        rows.append(
            (
                meta.sifra,
                str(i),
                meta.tip,
                naziv,
                ulica or None,
                json.dumps(geom_obj),
                json.dumps({k: v for k, v in attrs.items() if v}, ensure_ascii=False),
            )
        )
    zamijeni_objekte(conn, meta.sifra, rows)
    nap = f"tocaka={len(rows)}; bez_koordinate={bez}"
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} zelenih otoka · {nap}")


def sync_odgojno(conn: psycopg.Connection, meta: Skup) -> None:
    recs = citaj_csv(preuzmi_tekst(meta, "data.csv"))
    rows = []
    bez = 0
    for i, r in enumerate(recs, start=1):
        naziv = (r.get("Ustanova") or "").strip()
        adresa = (r.get("Adresa ustanove") or "").strip()
        if not naziv:
            continue
        geom_obj = toccka_iz_adrese(conn, adresa, naziv) if adresa else None
        if not geom_obj and adresa:
            pt = geokod_nominatim(conn, f"{adresa}, Zagreb, Hrvatska")
            if pt:
                geom_obj = {"type": "Point", "coordinates": [pt[0], pt[1]]}
        if not geom_obj:
            bez += 1
            continue
        attrs = {
            "vrsta": (r.get("Tip ustanove") or r.get("Vrsta programa/ ustanove") or "").strip() or None,
            "osnivac": (r.get("Osnivač") or r.get("Osnivac") or "").strip() or None,
            "maticni_podrucni": (r.get("Matični/ područni") or "").strip() or None,
            "maticna": (r.get("Matična ustanova") or "").strip() or None,
            "cetvrt_naziv": (r.get("Gradska četvrt_U") or "").strip() or None,
        }
        rows.append(
            (
                meta.sifra,
                str(i),
                meta.tip,
                naziv,
                adresa or None,
                json.dumps(geom_obj),
                json.dumps({k: v for k, v in attrs.items() if v}, ensure_ascii=False),
            )
        )
    zamijeni_objekte(conn, meta.sifra, rows)
    nap = f"sa_geometrijom={len(rows)}; bez_koordinate={bez}"
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} odgojno-obrazovnih · {nap}")


def sync_gtfs(conn: psycopg.Connection, meta: Skup) -> None:
    path = DATA_DIR / meta.sifra / "gtfs.zip"
    print(f"Preuzimam {GTFS_URL}")
    download(GTFS_URL, path)
    with zipfile.ZipFile(path) as z:
        def citaj(ime: str) -> list[dict]:
            with z.open(ime) as fh:
                return list(csv.DictReader(TextIOWrapper(fh, encoding="utf-8-sig")))

        rute = {r["route_id"]: r for r in citaj("routes.txt")}
        trips = citaj("trips.txt")
        # shape_id → točke
        tocke: dict[str, list[tuple[int, float, float]]] = {}
        with z.open("shapes.txt") as fh:
            rdr = csv.DictReader(TextIOWrapper(fh, encoding="utf-8-sig"))
            for row in rdr:
                sid = (row.get("shape_id") or "").strip().strip('"')
                try:
                    lat = float(row["shape_pt_lat"])
                    lon = float(row["shape_pt_lon"])
                    seq = int(float(row["shape_pt_sequence"]))
                except (KeyError, ValueError):
                    continue
                tocke.setdefault(sid, []).append((seq, lon, lat))
        info = {}
        if "feed_info.txt" in z.namelist():
            inf = citaj("feed_info.txt")
            info = inf[0] if inf else {}

    # jedan shape po (ruta, smjer) — onaj s najviše točaka
    najbolji: dict[tuple[str, str], tuple[str, int]] = {}
    for t in trips:
        rid, sid = t.get("route_id"), (t.get("shape_id") or "").strip().strip('"')
        if not rid or not sid or sid not in tocke:
            continue
        smjer = t.get("direction_id") or "0"
        n = len(tocke[sid])
        kljuc = (rid, smjer)
        if kljuc not in najbolji or n > najbolji[kljuc][1]:
            najbolji[kljuc] = (sid, n)

    rows = []
    for (rid, smjer), (sid, _) in najbolji.items():
        r = rute.get(rid) or {}
        pts = [(lon, lat) for _, lon, lat in sorted(tocke[sid])]
        if len(pts) < 2:
            continue
        geom = {"type": "LineString", "coordinates": pts}
        kratki = (r.get("route_short_name") or rid).strip().strip('"')
        dugi = (r.get("route_long_name") or "").strip().strip('"')
        tip_gtfs = (r.get("route_type") or "").strip()
        vrsta = "tramvaj" if tip_gtfs == "0" else "autobus" if tip_gtfs == "3" else f"gtfs-{tip_gtfs}"
        naziv = f"{kratki} · {dugi}" if dugi else kratki
        attrs = {
            "vrsta": vrsta,
            "linija": kratki,
            "smjer": smjer,
            "route_id": rid,
            "route_type": tip_gtfs,
        }
        rows.append(
            (
                meta.sifra,
                f"{rid}:{smjer}",
                meta.tip,
                naziv,
                dugi or None,
                json.dumps(geom),
                json.dumps(attrs, ensure_ascii=False),
            )
        )
    zamijeni_objekte(conn, meta.sifra, rows)
    nap = (
        f"rute={len(rute)}; linija_na_karti={len(rows)}; "
        f"feed={info.get('feed_start_date','')}–{info.get('feed_end_date','')}"
    )
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitano {len(rows)} GTFS linija · {nap}")


def sync_asset_lista(conn: psycopg.Connection, meta: Skup) -> None:
    """Katalog E: CKAN paketi (što je na Portalu) + retci asset liste koji nisu CKAN."""
    with conn.cursor() as cur:
        cur.execute("SELECT sifra, paket_id, ckan_url, naziv FROM meta.skup")
        atlas = list(cur.fetchall())
    po_paketu = {p: s for s, p, _, _ in atlas if p}
    po_nazivu = {kljuc_jedinice(n): s for s, _, _, n in atlas if n}

    paketi: list[dict] = []
    start = 0
    while True:
        r = httpx.get(
            f"{CKAN_API}/package_search",
            params={"rows": 100, "start": start},
            timeout=60,
            headers=UA,
            follow_redirects=True,
        )
        r.raise_for_status()
        rez = r.json()["result"]
        paketi.extend(rez.get("results") or [])
        if start + 100 >= int(rez.get("count") or 0):
            break
        start += 100

    rows = []
    videni: set[str] = set()
    for p in paketi:
        name = p.get("name") or ""
        if not name or name in videni:
            continue
        videni.add(name)
        sifra = po_paketu.get(name)
        stanje = "u_atlasu" if sifra else "nije_u_atlasu"
        org = (p.get("organization") or {}).get("title")
        rows.append(
            (
                p.get("title") or name,
                (p.get("notes") or "").strip()[:2000] or None,
                org,
                f"https://data.zagreb.hr/dataset/{name}",
                p.get("license_title") or p.get("license_id"),
                name,
                sifra,
                stanje,
            )
        )

    recs = citaj_csv(preuzmi_tekst(meta, "data.csv", ime_sadrzi="2025"))
    for r in recs:
        naziv = (r.get("NAZIV SKUPA PODATAKA") or r.get("Naziv") or "").strip()
        if not naziv:
            continue
        poveznica = (r.get("POVEZNICA") or "").strip()
        if not poveznica.startswith("http"):
            for v in r.values():
                if isinstance(v, str) and "data.zagreb.hr/dataset/" in v:
                    poveznica = v.strip()
                    break
        m = re.search(r"data\.zagreb\.hr/dataset/([^/?#]+)", poveznica or "", re.I)
        paket = m.group(1) if m else None
        if paket and paket in videni:
            continue
        sifra = po_paketu.get(paket or "") or po_nazivu.get(kljuc_jedinice(naziv))
        if sifra:
            stanje = "u_atlasu"
        elif paket:
            stanje = "nije_u_atlasu"
        else:
            stanje = "nije_ckan"
        if paket:
            videni.add(paket)
        rows.append(
            (
                naziv,
                (r.get("KRATAK OPIS SKUPA PODATAKA") or "").strip() or None,
                (r.get("UČESTALOST OBJAVE/AŽURIRANJA") or "").strip() or None,
                poveznica or None,
                (r.get("UVJETI KORIŠTENJA (DOZVOLE)") or "").strip() or None,
                paket,
                sifra,
                stanje,
            )
        )

    with conn.cursor() as cur:
        cur.execute("DELETE FROM meta.portal_skup")
        cur.executemany(
            """
            INSERT INTO meta.portal_skup
                (naziv, opis, ucestalost, poveznica, uvjeti, paket_id, atlas_sifra, stanje)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
    conn.commit()
    n_u = sum(1 for x in rows if x[7] == "u_atlasu")
    nap = (
        f"portal={len(rows)}; ckan={len(paketi)}; u_atlasu={n_u}; "
        f"nije_u_atlasu={sum(1 for x in rows if x[7]=='nije_u_atlasu')}; "
        f"nije_ckan={sum(1 for x in rows if x[7]=='nije_ckan')}"
    )
    zavrsi_skup(conn, meta.sifra, len(rows), nap)
    print(f"Učitana asset lista · {nap}")


def sync_zrak_2023(conn: psycopg.Connection, meta: Skup) -> None:
    n_dat = 0
    with conn.cursor() as cur:
        cur.execute("DELETE FROM okolis.zrak_dan")
    for paket, postaja in ZRAK_PAKETI.items():
        try:
            r = httpx.get(f"{CKAN_API}/package_show", params={"id": paket}, timeout=60, follow_redirects=True, headers=UA)
            r.raise_for_status()
            resursi = r.json()["result"].get("resources") or []
        except Exception as e:  # noqa: BLE001
            print(f"  (zrak {paket}: {type(e).__name__})")
            continue
        xlsx = [
            res
            for res in resursi
            if (res.get("format") or "").upper() == "XLSX" and res.get("url")
        ]
        for res in xlsx:
            dest = DATA_DIR / "zrak_2023" / f"{paket}-{res.get('id','x')}.xlsx"
            try:
                download(res["url"], dest)
                tab = _xlsx_redovi(dest.read_bytes())
            except Exception as e:  # noqa: BLE001
                print(f"  (zrak datoteka {res.get('name')}: {type(e).__name__})")
                continue
            if not tab:
                continue
            hdr = tab[0]
            stupci = []
            for i, h in enumerate(hdr):
                h = (h or "").strip()
                if i == 0:
                    continue
                m = re.match(r"(.+?)\s*\[(.+?)\]", h)
                if m:
                    stupci.append((i, m.group(1).strip(), m.group(2).strip()))
                elif h:
                    stupci.append((i, h, None))
            batch = []
            for red in tab[1:]:
                d = _excel_datum(red[0] if red else "")
                if not d or d.year != 2023:
                    continue
                for i, pol, jed in stupci:
                    if i >= len(red) or not str(red[i]).strip():
                        continue
                    try:
                        val = float(str(red[i]).replace(",", "."))
                    except ValueError:
                        continue
                    batch.append((postaja, paket, d, pol, jed, val))
            if batch:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO okolis.zrak_dan (postaja, paket_id, datum, polutant, jedinica, vrijednost)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (postaja, datum, polutant) DO UPDATE SET vrijednost = EXCLUDED.vrijednost
                        """,
                        batch,
                    )
                conn.commit()
                n_dat += len({b[2] for b in batch})
        print(f"  zrak {postaja}: OK")

    # sažetak 2023. na pinove postaja
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT postaja,
                   avg(vrijednost) FILTER (WHERE polutant ILIKE 'PM10%') AS pm10,
                   avg(vrijednost) FILTER (WHERE polutant ILIKE 'NO2%') AS no2,
                   count(*) FILTER (WHERE polutant ILIKE 'PM10%' AND vrijednost > 50) AS dana_pm10_50
            FROM okolis.zrak_dan GROUP BY postaja
            """
        )
        sazetak = {p: (pm10, no2, n50) for p, pm10, no2, n50 in cur.fetchall()}
        cur.execute("SELECT id, naziv, attrs FROM geo.objekt WHERE skup_sifra = 'kvaliteta_zraka'")
        for oid, naziv, attrs in cur.fetchall():
            hit = None
            nlow = unaccent_simple(naziv or "")
            for postaja, v in sazetak.items():
                if unaccent_simple(postaja) in nlow or nlow in unaccent_simple(postaja):
                    hit = (postaja, v)
                    break
            if not hit:
                continue
            postaja, (pm10, no2, n50) = hit
            a = dict(attrs or {})
            a["zrak_2023_postaja"] = postaja
            if pm10 is not None:
                a["pm10_2023_srednje"] = round(float(pm10), 1)
            if no2 is not None:
                a["no2_2023_srednje"] = round(float(no2), 1)
            a["dana_pm10_preko_50_2023"] = int(n50 or 0)
            cur.execute("UPDATE geo.objekt SET attrs = %s::jsonb WHERE id = %s", (json.dumps(a, ensure_ascii=False), oid))
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM okolis.zrak_dan")
        n = cur.fetchone()[0]
    nap = f"dnevnih_mjerenja={n}; postaja={len(ZRAK_PAKETI)}"
    zavrsi_skup(conn, meta.sifra, n, nap)
    print(f"Učitano {n} dnevnih mjerenja zraka 2023. · {nap}")


def unaccent_simple(s: str) -> str:
    t = (s or "").lower()
    for a, b in (("č", "c"), ("ć", "c"), ("š", "s"), ("ž", "z"), ("đ", "d"), ("ö", "o")):
        t = t.replace(a, b)
    return t


def osvjezi_ckan_meta(conn: psycopg.Connection, meta: Skup) -> None:
    """CKAN package_show: resursi, licenca, izdavač, datum izmjene (katalog E)."""
    if not meta.ckan or not meta.paket_id:
        return
    try:
        r = httpx.get(
            f"{CKAN_API}/package_show",
            params={"id": meta.paket_id},
            timeout=60,
            follow_redirects=True,
            headers=UA,
        )
        r.raise_for_status()
        p = r.json()["result"]
    except Exception as e:  # noqa: BLE001 — metapodaci nisu kritični za ingest
        print(f"  (CKAN meta {meta.sifra}: {type(e).__name__})")
        return
    resursi = [
        {
            "naziv": res.get("name") or res.get("description") or res.get("format"),
            "format": (res.get("format") or "").upper() or None,
            "url": res.get("url"),
            "velicina": res.get("size"),
            "izmjena": res.get("last_modified") or res.get("created"),
        }
        for res in p.get("resources", [])
        if res.get("url")
    ]
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE meta.skup SET
                ckan_naslov = %s, ckan_opis = %s, ckan_izmjena = %s, licenca = %s, izdavac = %s, resursi = %s::jsonb
            WHERE sifra = %s
            """,
            (
                p.get("title"),
                (p.get("notes") or "").strip()[:2000] or None,
                p.get("metadata_modified"),
                p.get("license_title") or p.get("license_id"),
                (p.get("organization") or {}).get("title") or p.get("author") or p.get("maintainer"),
                json.dumps(resursi, ensure_ascii=False),
                meta.sifra,
            ),
        )
    conn.commit()


HANDLERI: dict[str, Callable[[psycopg.Connection, Skup], None]] = {
    "isge": sync_isge,
    "cetvrti": sync_cetvrti,
    "mo": sync_mo,
    "ulice": sync_ulice,
    "prometnice": sync_prometnice,
    "vrtici_csv": sync_vrtici_csv,
    "geoportal": sync_geoportal,
    "predsjednici_gc": sync_predsjednici_gc,
    "predsjednici_mo": sync_predsjednici_mo,
    "clanovi_vijeca": sync_clanovi_vijeca,
    "prostori_ms": sync_prostori_ms,
    "signalizatori": sync_signalizatori,
    "zeleni_otoci": sync_zeleni_otoci,
    "odgojno": sync_odgojno,
    "gtfs": sync_gtfs,
    "asset_lista": sync_asset_lista,
    "zrak_2023": sync_zrak_2023,
}


def main() -> None:
    svi = list(SKUPOVI.keys())
    parser = argparse.ArgumentParser(description="Atlas ingest")
    parser.add_argument(
        "--skupovi",
        nargs="+",
        default=["all"],
        help="Šifre skupova, tema (npr. tema:skrb_zdravlje) ili 'all'. Dostupno: " + " ".join(svi),
    )
    parser.add_argument(
        "--nastavi",
        action="store_true",
        help="Ne prekidaj na grešci jednog skupa; zabilježi i idi dalje",
    )
    parser.add_argument(
        "--samo-meta",
        action="store_true",
        help="Ne preuzimaj podatke; samo osvježi CKAN metapodatke (resursi, licenca, datum izmjene)",
    )
    args = parser.parse_args()

    odabrani: list[str] = []
    for s in args.skupovi:
        if s == "all":
            odabrani.extend(svi)
        elif s.startswith("tema:"):
            tema = s.split(":", 1)[1]
            odabrani.extend(k for k, v in SKUPOVI.items() if v.tema == tema)
        elif s in SKUPOVI:
            odabrani.append(s)
        else:
            raise SystemExit(f"Nepoznat skup: {s}")
    # bez duplikata, zadržan redoslijed registra
    odabrani = [k for k in svi if k in set(odabrani)]

    greske: list[str] = []
    with psycopg.connect(DATABASE_URL) as conn:
        migracije(conn)
        # Metapodaci registra (tema, tip, geometrija, ažurnost) uvijek su usklađeni za sve skupove
        for meta in SKUPOVI.values():
            ensure_skup(conn, meta)
        for sifra in odabrani:
            meta = SKUPOVI[sifra]
            fn = HANDLERI[meta.handler]
            try:
                if not args.samo_meta:
                    fn(conn, meta)
                osvjezi_ckan_meta(conn, meta)
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                msg = f"{sifra}: {type(e).__name__}: {e}"
                print(f"GREŠKA {msg}")
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO meta.sinkronizacija (skup_sifra, redaka, uspjeh, napomena)
                        VALUES (%s, 0, false, %s)
                        """,
                        (sifra, msg[:500]),
                    )
                conn.commit()
                if not args.nastavi:
                    raise
                greske.append(msg)

    if greske:
        print(f"\nZavršeno s {len(greske)} greškom/greškama:")
        for g in greske:
            print("  -", g)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
