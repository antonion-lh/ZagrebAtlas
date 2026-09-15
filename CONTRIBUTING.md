# Doprinosi

Atlas je otvoreni kôd (MIT). Podaci su Grada Zagreba (Otvorena dozvola).

## Lokalni razvoj

```bash
cp .env.example .env   # INGEST_UID / INGEST_GID = `id -u` / `id -g`
docker compose up -d db web
docker compose run --rm ingest python sync.py --nastavi --skupovi all
# http://127.0.0.1:3200
./tests/smoke.sh
```

Dodavanje Geoportal točkastog sloja: jedan `_geoportal(...)` u `ingest/skupovi.py`, zatim
`docker compose run --rm ingest python sync.py --skupovi <sifra>`. Nakon toga se sloj
pojavljuje na karti, u dosjeu, u katalogu ustanova i u `/katalog` (preuzimanja se
generiraju iz `geometrija` i `sifra`).

## Što ne raditi

- Ne commitati `data/`, `.env`, dumpove baze.
- Ne mijenjati izvorne podatke u ingestu (samo normalizacija i spajanje); ako je izvor kriv, ostaje kriv i nosi oznaku ažurnosti.
- Ne dodavati treće strane skripte (analitika, fontovi s CDN-a) bez CSP ažuriranja i vodiča.

## Prijave

Issue: krivi spoj ISGE, kriva četvrt, nedostajući skup, pristupačnost — [github.com/antonion-lh/ZagrebAtlas/issues](https://github.com/antonion-lh/ZagrebAtlas/issues).
PR: jedan skup / jedna površina po PR-u.
