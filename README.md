# Zagreb Gradski atlas

Javna aplikacija nad otvorenim podacima Grada Zagreba.

- **Uživo:** [zg-atlas.lakehouse.hr](https://zg-atlas.lakehouse.hr)
- **Kôd:** [github.com/antonion-lh/ZagrebAtlas](https://github.com/antonion-lh/ZagrebAtlas) (MIT)
- **Podaci:** [data.zagreb.hr](https://data.zagreb.hr), Otvorena dozvola (OD)

**Nije** Zagreb Open Finance Radar — nema proračuna, isplata, PKA ni OIB-a.

## Stog

- PostgreSQL 16 + PostGIS
- Python ingest (CKAN / Geoportal / GTFS)
- Next.js + MapLibre

## Lokalni razvoj

```bash
cd atlas
cp .env.example .env          # uskladi INGEST_UID/GID s `id -u` / `id -g`
docker compose up -d db       # pričekaj healthy
docker compose run --rm ingest python sync.py            # svi skupovi
docker compose run --rm ingest python sync.py --skupovi prometnice   # jedan skup
docker compose up -d web
./tests/smoke.sh              # stranice + broj zapisa
```

- Karta: http://127.0.0.1:3200  
- Četvrti: http://127.0.0.1:3200/cetvrti  
- Katalog: http://127.0.0.1:3200/katalog  
- Baza: `127.0.0.1:5434` · korisnik/lozinka/baza `atlas`

Portovi namjerno različiti od Radara (5433/3100).

### Periodično osvježavanje

Skica u compose-u (profil `cron`): svaki sat prometnice, 05h prostori MS, ponedjeljak 04h vrtići.

```bash
docker compose --profile cron up -d cron
```

U produkciji zamijeniti systemd timerom / crontabom koji zove `sync.py --skupovi ...`.

## Skupovi u bazi

Registar je u [`ingest/skupovi.py`](ingest/skupovi.py) (šifra, CKAN paket, tema, tip, ažurnost,
mapiranje polja). Dodavanje Geoportal točkastog sloja = jedan `_geoportal(...)` unos.

| Tema | Skupovi |
| --- | --- |
| Prostor | četvrti (17), mjesni odbori (218), registar ulica (5.489, tablica) |
| Danas i ovaj tjedan | zatvaranje prometnica (dnevno) |
| Ustanove i obrazovanje | gradski vrtići, privatni/vjerski vrtići, odgojno-obrazovni objekti, OŠ, SŠ, učenički domovi, visoka učilišta, studentski restorani, studentska naselja |
| Skrb i zdravlje | zdravstvene ustanove, domovi zdravlja, domovi za starije, ustanove OSI, domovi za djecu, Odmorko, HZSR, ustanove za beskućnike, ustanove za branitelje |
| Sport i kultura | sportski objekti, kulturne ustanove, javna igrališta |
| Okoliš i komunalno | reciklažna dvorišta, podzemni i polupodzemni spremnici, javni zdenci (mjesečno), pojilice, zeleni otoci (2016.), površine za pse, gradski vrtovi, postaje kvalitete zraka, dnevna mjerenja zraka 2023. (tablica) |
| Mobilnost | stajališta ZET bus i tram, stajališta HŽ, javne garaže, parkirališta za bicikle, javni bicikli, EV punionice, taxi stajališta, biciklističke staze, pješačke zone, ZET GTFS rute (statično) |
| Svakodnevne usluge | tržnice, ljekarne, benzinske, besplatni WiFi, javni WC-i, zvučni signalizatori, vatrogasci, policija |
| Lokalna demokracija i uprava | sjedišta GČ, sjedišta MO, područni uredi, područni odsjeci (poligoni), predsjednici GČ i MO, članovi vijeća GČ i MO, prostori mjesne samouprave (dnevno) |
| Meta | asset lista Portala (Portal vs. Atlas) |

| Energija | ISGE — potrošnja i trošak gradskih objekata (1.254 objekta, 10 energenata, 01/2019–06/2024) |

Korpus v1.3 (35–45 ugovorenih) je pokriven; dodatni skupovi (policija, vatrogasci, taxi, garaže…) ostaju.

### ISGE i spajanje na registar (entity resolution)

CSV od ~420k redaka (po mjernom mjestu i mjesecu) agregira se u `energy.potrosnja`
(objekt × energent × mjesec) i `energy.objekt`. Korekcijski/storno redovi (negativne količine) isključeni
su iz zbroja. Objekti se spajaju na `geo.objekt` u tri koraka
(`spoji_isge`): ista normalizirana ulica + kućni broj (pouzdanost *visoka* ako je i naziv sličan, inače
*srednja*), ista ulica + sličnost naziva ≥ 0,45 (*srednja*), samo sličnost naziva ≥ 0,6 (*niska*; ne na
sjedišta MO/GČ). Normalizacija adresa je u SQL funkcijama `geo.norm_adresa`, `geo.kucni_broj`,
`geo.ulica_norm` (unaccent, bez „ulica/cesta/trg/sv.”, segment s kućnim brojem). Nespojenima se četvrt
pokušava izvući iz naziva („Gradska četvrt X – MS Y”) ili mjesta (Sesvete). Trenutno: 1.018/1.254 spojeno
(81 %), 1.053 s četvrti. Voda nema kWh — prikazuje se u m³ i izdvaja iz energetskih zbrojeva.

Linije i poligoni se u `/api/sloj` pojednostavljuju (`ST_SimplifyPreserveTopology`, 6 decimala), pa
biciklističke staze idu u ~1,6 MB.

```bash
docker compose run --rm ingest python sync.py --skupovi tema:skrb_zdravlje   # po temi
docker compose run --rm ingest python sync.py --nastavi                       # ne staj na grešci
```

Shema se migrira idempotentno iz `sync.py` (`MIGRACIJE`); `db/init.sql` vrijedi za svježu bazu.
Sheme: `meta` (katalog, sinkronizacije), `geo` (četvrti, MO, ulice, objekti), `uprava` (predsjednici,
vijeća, prostori MS), `energy` (ISGE, Faza 4).

Napomene o spajanju: MO nazivi su jedinstveni u gradu, pa se tablice spajaju po normaliziranom nazivu
(`kljuc_jedinice`). Nespojeni redovi bilježe se u `meta.sinkronizacija.napomena`.

## Površine (A–E)

| | Status |
| --- | --- |
| A Karta + inspector | radi: pretraga, OSM ili ortofoto 2022 (WMS proxy), objekti u blizini, presjek radova i biciklističkih/pješačkih geometrija, GTFS rute, WC, signalizatori… |
| B Dosje četvrti | radi: predsjednik GČ, sjedište, vijeće, prostori MS, područni ured, MO, inventar, izvoz |
| C Katalog ustanova | radi: `/ustanove` + poveznica na energetski dosje kad postoji pouzdan ISGE spoj |
| D Energetski dosje ISGE | radi: serije, kriza 2022., sezona zima/ljeto, medijan kohorte, CSV |
| E Katalog podataka | radi: CKAN, asset lista Portal vs. Atlas, udio spoja ISGE, javni backlog, gold CSV, izvoz |

## Preuzimanja i API

| Putanja | Format | Sadržaj |
| --- | --- | --- |
| `/api/katalog` | JSON | katalog skupova s izvorima i Atlasovim distribucijama |
| `/api/trazi?q=` | JSON | lokalna pretraga četvrti, mjesnih odbora i objekata |
| `/api/sloj/{sifra}` | GeoJSON | sloj (WGS84); `?format=csv` → CSV s lon/lat i spljoštenim atributima |
| `/api/tablica/{sifra}` | JSON / CSV | tablice: vijeća, ISGE, asset lista, zrak 2023., gold agregati (`gold_objekti`, `gold_isge_godina`, `gold_inventar_cetvrt`) |
| `/api/izvoz/cetvrt/{slug}` | CSV / GeoJSON | dosje četvrti |
| `/api/izvoz/energija/{id}` | CSV | mjesečna potrošnja ISGE objekta |
| `/api/blizina` | JSON | točke u krugu (inspector) |
| `/api/presjek` | JSON | zatvaranje ∩ biciklističke staze / pješačke zone |

CKAN metapodaci (resursi, licenca, datum izmjene) osvježavaju se uz svaki ingest; samo metapodaci:
`docker compose run --rm ingest python sync.py --samo-meta`.

## Pristupačnost (WCAG 2.2 AA)

Skip link, vidljiv fokus, `aria-current` u navigaciji, naslovi stranica po ruti, `lang="hr"`, tablice s
`caption`/`scope`, responzivne tablice-kartice na uskim zaslonima, mete ≥ 44 px u navigaciji i na karti,
`prefers-reduced-motion`, sticky zaglavlje s vodoravnim scrollom stavki, karta kao bottom sheet na mobitelu.
Automatski axe-core prolaz (wcag2a/aa, 2.1, 2.2, best-practice) na svim rutama, desktop i 390 px: 0 nalaza.
Karta zahtijeva WebGL; bez njega se prikazuje tekstualni popis, a sav sadržaj postoji i u dosjeu/katalogu.
Vodič za korisnike: `/vodic`.

## Sigurnost (hardening)

- CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, bez `X-Powered-By`
- API: samo GET/OPTIONS; CORS `*`; rate limit po IP (stroži za ortofoto i velike CSV izvoze)
- Velike tablice (`isge_potrosnja`, `gold_objekti`, `gold_isge_godina`) samo kao CSV
- Web kontejner: non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`
- DB upiti: `statement_timeout` 20 s; ortofoto proxy s timeoutom i validacijom zoom/koordinata
- `security.txt` na `/.well-known/security.txt`

## Licenca

Kôd: [MIT](LICENSE). Podaci: Grad Zagreb, [Otvorena dozvola (OD)](https://data.gov.hr/otvorena-dozvola) — navedite izvor (`data.zagreb.hr`).

## Produkcija

Na ovom stroju Atlas ide iza [lakehouse-edge](https://github.com/antonion-lh) (`zg-atlas.lakehouse.hr`
→ `atlas-edge:3000`), isto kao Radar na `zagreb.lakehouse.hr`.

```bash
cp .env.example .env.prod          # INGEST_UID/GID = `id -u` / `id -g`
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm ingest python sync.py --nastavi
./tests/smoke.sh                   # ili BASE=https://zg-atlas.lakehouse.hr ./tests/smoke.sh
```

Cron osvježava dnevne/tjedne skupove i jednom tjedno CKAN metapodatke (`--samo-meta`).

Samostalni host (vlastiti TLS, Let's Encrypt): `Caddyfile` +
`docker compose -f docker-compose.prod.yml --profile caddy --env-file .env.prod up -d`.

## GitHub

Repo: [github.com/antonion-lh/ZagrebAtlas](https://github.com/antonion-lh/ZagrebAtlas).
CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Najava (kratko): „Zagreb Gradski atlas je karta i dosjei nad otvorenim podacima Grada — ustanove,
lokalna demokracija, energija ISGE — svaki sloj s oznakom ažurnosti. Podaci OD, kôd MIT.
https://zg-atlas.lakehouse.hr”

