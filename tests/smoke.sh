#!/usr/bin/env bash
# Brza provjera: stranice odgovaraju 200, baza ima skupove.
# Uporaba: BASE=http://127.0.0.1:3200 ./tests/smoke.sh
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3200}"
cd "$(dirname "$0")/.."

greska=0

provjeri() {
  local putanja="$1"
  local kod
  kod=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE$putanja" || echo "000")
  if [[ "$kod" == "200" ]]; then
    echo "OK   $kod $putanja"
  else
    echo "FAIL $kod $putanja"
    greska=1
  fi
}

echo "== stranice =="
provjeri /
provjeri /cetvrti
provjeri /katalog
provjeri /ustanove
provjeri "/ustanove?q=ljekarna&tema=usluge"
provjeri /energija
provjeri "/energija?q=skola&spojeni=da"
provjeri /vodic
provjeri /robots.txt
provjeri /.well-known/security.txt
provjeri /api/katalog
provjeri "/api/trazi?q=ljekarna"
provjeri "/api/sloj/ljekarne?format=csv"
provjeri "/api/tablica/predsjednici_gc?format=csv"
provjeri /api/sloj/cetvrti
provjeri /api/sloj/vrtici
provjeri /api/sloj/javni_wc
provjeri /api/sloj/gtfs_rute
provjeri /api/tablica/asset_lista
provjeri "/api/tablica/gold_inventar_cetvrt?format=csv"
provjeri "/api/blizina?lon=15.98&lat=45.81"
provjeri /api/podloga/ortofoto/13/4540/2845

prvi_slug=$(docker compose exec -T db psql -U atlas -d atlas -Atc \
  "SELECT slug FROM geo.cetvrt ORDER BY naziv LIMIT 1" 2>/dev/null || true)
if [[ -n "$prvi_slug" ]]; then
  provjeri "/cetvrti/$prvi_slug"
  provjeri "/api/izvoz/cetvrt/$prvi_slug"
else
  echo "FAIL nema četvrti u bazi"
  greska=1
fi

prvi_isge=$(docker compose exec -T db psql -U atlas -d atlas -Atc \
  "SELECT id FROM energy.objekt ORDER BY id LIMIT 1" 2>/dev/null || true)
if [[ -n "$prvi_isge" ]]; then
  provjeri "/api/izvoz/energija/$prvi_isge"
else
  echo "FAIL nema ISGE objekata u bazi"
  greska=1
fi

echo "== baza =="
docker compose exec -T db psql -U atlas -d atlas -c \
  "SELECT sifra, azurnost, broj_zapisa, zadnja_sinkronizacija::timestamp(0) AS sink
   FROM meta.skup ORDER BY sifra;"

prazni=$(docker compose exec -T db psql -U atlas -d atlas -Atc \
  "SELECT count(*) FROM meta.skup WHERE aktivan AND coalesce(broj_zapisa,0)=0")
if [[ "$prazni" != "0" ]]; then
  echo "FAIL $prazni aktivnih skupova bez zapisa"
  greska=1
fi

if [[ "$greska" == "0" ]]; then
  echo "== SVE OK =="
else
  echo "== GREŠKE =="
  exit 1
fi
