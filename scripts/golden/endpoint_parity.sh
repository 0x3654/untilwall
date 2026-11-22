#!/usr/bin/env bash
# Endpoint contract parity checklist: old (Next.js) vs new (Rust) server.
#
# Usage: OLD=http://127.0.0.1:3100 NEW=http://127.0.0.1:3110 \
#        scripts/golden/endpoint_parity.sh

set -euo pipefail

OLD="${OLD:-http://127.0.0.1:3100}"
NEW="${NEW:-http://127.0.0.1:3110}"
OUT="${OUT:-.ab-results/endpoints}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

mkdir -p "$OUT"
PASS=0; FAIL=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS  $1"
    PASS=$((PASS+1))
  else
    echo "FAIL  $1: old=[$2] new=[$3]"
    FAIL=$((FAIL+1))
  fi
}

status_of() { curl -sS -m 30 -A "$UA" -o /dev/null -w '%{http_code}' "$1"; }
ct_of() { curl -sS -m 30 -A "$UA" -o /dev/null -w '%{content_type}' "$1"; }

# --- /goal headers: status + content-type + cache headers
for base in OLD NEW; do
  url="${!base}"
  curl -sS -m 180 -A "$UA" -D "$OUT/$base-goal.h" -o /dev/null \
    "$url/goal?start_date=2026-01-01&end_date=2026-12-31"
  curl -sS -m 30 -A "$UA" -D "$OUT/$base-goal-svg.h" -o /dev/null \
    "$url/goal?start_date=2026-01-01&end_date=2026-12-31&format=svg"
done
norm() { tr -d '\r' < "$1" | grep -iE '^HTTP/|^content-type:|^cache-control:|^x-cache:|^x-robots-tag:|^x-content-type-options:|^content-disposition:|^pragma:|^expires:|^vary:' | sort; }
check "/goal png status+headers" "$(norm "$OUT/OLD-goal.h")" "$(norm "$OUT/NEW-goal.h")"
check "/goal svg status+headers" "$(norm "$OUT/OLD-goal-svg.h")" "$(norm "$OUT/NEW-goal-svg.h")"

# x-cache MISS then HIT on the new server (unique param per run: the
# previous run's entry is still inside the 60-minute TTL otherwise)
cc="cachecheck=$(date +%s)"
curl -sS -m 30 -A "$UA" -D "$OUT/new-miss.h" -o /dev/null \
  "$NEW/goal?start_date=2024-01-01&end_date=2024-12-31&format=svg&$cc"
curl -sS -m 30 -A "$UA" -D "$OUT/new-hit.h" -o /dev/null \
  "$NEW/goal?start_date=2024-01-01&end_date=2024-12-31&format=svg&$cc"
check "x-cache MISS" "miss" "$(grep -i '^x-cache:' "$OUT/new-miss.h" | tr -d '\r' | awk '{print tolower($2)}')"
check "x-cache HIT"  "hit"  "$(grep -i '^x-cache:' "$OUT/new-hit.h" | tr -d '\r' | awk '{print tolower($2)}')"

# --- /api/health: status + content-type + body shape
# (the Rust server additionally reports defaultTzOffset - a conscious tz
# extension - so old keys must be a SUBSET of new keys here)
check "health status" "$(status_of "$OLD/api/health")" "$(status_of "$NEW/api/health")"
check "health ct" "$(ct_of "$OLD/api/health")" "$(ct_of "$NEW/api/health")"
old_h="$(curl -sS -m 30 "$OLD/api/health" | jq -r 'keys|sort|join(",")')"
new_h="$(curl -sS -m 30 "$NEW/api/health" | jq -r 'keys|sort|join(",")')"
missing="$(comm -23 <(echo "$old_h" | tr ',' '\n') <(echo "$new_h" | tr ',' '\n') | tr '\n' ',')"
check "health body keys (old subset of new)" "" "$missing"
check "health status field" "ok" "$(curl -sS -m 30 "$NEW/api/health" | jq -r .status)"

# --- POST /api/visit
ov="$(curl -sS -m 30 -X POST -H 'Content-Type: application/json' -d '{"visitorId":"parity-check-123"}' "$OLD/api/visit")"
nv="$(curl -sS -m 30 -X POST -H 'Content-Type: application/json' -d '{"visitorId":"parity-check-123"}' "$NEW/api/visit")"
check "visit body" "$ov" "$nv"
ov2="$(curl -sS -m 30 -X POST -H 'Content-Type: application/json' -d 'not-json' "$OLD/api/visit" | jq -r .success)"
nv2="$(curl -sS -m 30 -X POST -H 'Content-Type: application/json' -d 'not-json' "$NEW/api/visit" | jq -r .success)"
check "visit invalid json -> success:true" "$ov2" "$nv2"

# --- GET /api/stats: same key set and value types
old_sk="$(curl -sS -m 30 "$OLD/api/stats" | jq -r 'keys|join(",")')"
new_sk="$(curl -sS -m 30 "$NEW/api/stats" | jq -r 'keys|join(",")')"
check "stats body keys" "$old_sk" "$new_sk"

# --- static assets
check "robots.txt body" \
  "$(curl -sS -m 30 "$OLD/robots.txt")" "$(curl -sS -m 30 "$NEW/robots.txt")"
check "robots.txt status" "$(status_of "$OLD/robots.txt")" "$(status_of "$NEW/robots.txt")"
check "overlay png bytes" \
  "$(curl -sS -m 60 "$OLD/overlay/15promax.png" | sha256sum)" \
  "$(curl -sS -m 60 "$NEW/overlay/15promax.png" | sha256sum)"
check "overlay png ct" "$(ct_of "$OLD/overlay/15promax.png")" "$(ct_of "$NEW/overlay/15promax.png")"
check "icon.svg ct" "$(ct_of "$OLD/icon.svg")" "$(ct_of "$NEW/icon.svg")"

# --- pages
check "homepage status" "$(status_of "$OLD/")" "$(status_of "$NEW/")"
check "homepage ct" "$(ct_of "$OLD/")" "$(ct_of "$NEW/")"
check "404 status" "$(status_of "$OLD/noexist")" "$(status_of "$NEW/noexist")"
check "404 ct" "$(ct_of "$OLD/noexist")" "$(ct_of "$NEW/noexist")"

# --- html=true mode
check "goal html=true ct" \
  "$(ct_of "$OLD/goal?start_date=2026-01-01&end_date=2026-12-31&html=true")" \
  "$(ct_of "$NEW/goal?start_date=2026-01-01&end_date=2026-12-31&html=true")"
ohtml="$(curl -sS -m 180 -A "$UA" "$OLD/goal?start_date=2026-01-01&end_date=2026-12-31&html=true")"
nhtml="$(curl -sS -m 180 -A "$UA" "$NEW/goal?start_date=2026-01-01&end_date=2026-12-31&html=true")"
check "html wrapper (base64 stripped)" \
  "$(echo "$ohtml" | sed 's|base64,[^"]*|base64,X|')" \
  "$(echo "$nhtml" | sed 's|base64,[^"]*|base64,X|')"

echo
echo "endpoint parity: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
