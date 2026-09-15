CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS energy;

-- Katalog učitanih skupova (površina E)
CREATE TABLE IF NOT EXISTS meta.skup (
    sifra               text PRIMARY KEY,
    naziv               text NOT NULL,
    ckan_url            text,
    paket_id            text,
    azurnost            text NOT NULL
                        CHECK (azurnost IN ('danas', 'tjedan', 'mjesec', 'godina', 'starija_snimka')),
    frekvencija_sink    text,
    zadnja_sinkronizacija timestamptz,
    broj_zapisa         integer,
    napomena            text,
    aktivan             boolean NOT NULL DEFAULT true,
    tema                text,
    tip                 text
);

CREATE TABLE IF NOT EXISTS meta.sinkronizacija (
    id              bigserial PRIMARY KEY,
    skup_sifra      text REFERENCES meta.skup (sifra),
    fetched_at      timestamptz NOT NULL DEFAULT now(),
    redaka          integer,
    uspjeh          boolean NOT NULL DEFAULT true,
    napomena        text
);

CREATE TABLE IF NOT EXISTS geo.cetvrt (
    id              integer PRIMARY KEY,
    sifra           text,
    naziv           text NOT NULL,
    slug            text UNIQUE,
    geom            geometry(MultiPolygon, 4326) NOT NULL,
    attrs           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cetvrt_geom ON geo.cetvrt USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_cetvrt_naziv ON geo.cetvrt (naziv);

CREATE TABLE IF NOT EXISTS geo.mo (
    id              integer PRIMARY KEY,
    sifra           text,
    naziv           text NOT NULL,
    slug            text,
    cetvrt_id       integer REFERENCES geo.cetvrt (id),
    geom            geometry(MultiPolygon, 4326) NOT NULL,
    attrs           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mo_geom ON geo.mo USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_mo_cetvrt ON geo.mo (cetvrt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mo_slug ON geo.mo (slug);

-- Registar naziva ulica (tablica bez geometrije; normalizacija adresa za ISGE spoj)
CREATE TABLE IF NOT EXISTS geo.ulica (
    ul_jid          text PRIMARY KEY,
    ime             text NOT NULL,
    ime_norm        text NOT NULL,
    naselje         text,
    naselje_mb      text,
    opis            text,
    datum           text
);

CREATE INDEX IF NOT EXISTS idx_ulica_norm ON geo.ulica (ime_norm);

-- Generičke točke / linije za karte (ustanove, usluge, mobilnost…)
CREATE TABLE IF NOT EXISTS geo.objekt (
    id              bigserial PRIMARY KEY,
    skup_sifra      text NOT NULL REFERENCES meta.skup (sifra),
    vanjski_kljuc   text,
    tip             text NOT NULL,
    naziv           text,
    adresa          text,
    cetvrt_id       integer REFERENCES geo.cetvrt (id),
    mo_id           integer REFERENCES geo.mo (id),
    geom            geometry(Geometry, 4326) NOT NULL,
    attrs           jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (skup_sifra, vanjski_kljuc)
);

CREATE INDEX IF NOT EXISTS idx_objekt_geom ON geo.objekt USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_objekt_skup ON geo.objekt (skup_sifra);
CREATE INDEX IF NOT EXISTS idx_objekt_tip ON geo.objekt (tip);
CREATE INDEX IF NOT EXISTS idx_objekt_cetvrt ON geo.objekt (cetvrt_id);
CREATE INDEX IF NOT EXISTS idx_objekt_mo ON geo.objekt (mo_id);

-- ISGE (površina D): objekti i mjesečna potrošnja po energentu.
-- Puna definicija (uklj. pg_trgm/unaccent, funkcije normalizacije adresa) je u ingest/sync.py MIGRACIJE;
-- sync.py ih primjenjuje idempotentno pri svakom pokretanju.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

INSERT INTO meta.skup (sifra, naziv, ckan_url, paket_id, azurnost, frekvencija_sink, napomena)
VALUES
    (
        'cetvrti',
        'Gradske četvrti',
        'https://data.zagreb.hr/dataset/gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba',
        'gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba',
        'godina',
        'rucno',
        'Granice 17 četvrti (SHP)'
    ),
    (
        'prometnice',
        'Zatvaranje prometnica',
        'https://data.zagreb.hr/dataset/prometnice',
        'prometnice',
        'danas',
        'dnevno',
        'Waze/CKAN linije zatvaranja'
    ),
    (
        'vrtici',
        'Gradski vrtići — kontakt',
        'https://data.zagreb.hr/dataset/gradski_vrtici_grada_zagreba',
        'gradski_vrtici_grada_zagreba',
        'tjedan',
        'tjedno',
        'Naziv, adresa, X/Y, četvrt'
    ),
    (
        'osnovne',
        'Geoportal Osnovne škole',
        'https://data.zagreb.hr/dataset/geoportal-osnovne-skole',
        'geoportal-osnovne-skole',
        'starija_snimka',
        'rucno',
        'Geoportal dump ~2022.'
    ),
    (
        'srednje',
        'Geoportal Srednje škole',
        'https://data.zagreb.hr/dataset/geoportal-srednje-skole',
        'geoportal-srednje-skole',
        'starija_snimka',
        'rucno',
        'Geoportal dump ~2022.'
    )
ON CONFLICT (sifra) DO NOTHING;
