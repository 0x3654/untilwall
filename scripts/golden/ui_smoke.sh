#!/usr/bin/env bash
# UI wiring smoke test for the exported static UI served by the Rust backend:
# the page loads, its assets resolve, and the same-origin /goal + /api calls
# the client makes all answer correctly.
#
# Usage: NEW=http://127.0.0.1:3110 scripts/golden/ui_smoke.sh

set -euo pipefail

NEW="${NEW:-http://127.0.0.1:3110}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

PASS=0; FAIL=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1));
  else echo "FAIL  $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi
}

html="$(curl -sS -m 30 -A "$UA" "$NEW/")"

# key UI markers from src/app/page.tsx
for marker in "Until Wall" "Preview" "Dot style" "space for widgets" "bottom text" "Timezone" "iPhone Duo Inner" "1. Get link" "2. Get shortcut" "3. HELP!!!" "Made by 0x3654" "Inspired by The Life Calendar"; do
  if echo "$html" | grep -qF "$marker"; then echo "PASS  marker: $marker"; PASS=$((PASS+1));
  else echo "FAIL  marker missing: $marker"; FAIL=$((FAIL+1)); fi
done

# all assets referenced by the page must resolve
echo "$html" | grep -oE '(src|href)="[^"]+"' | sed 's/^[a-z]*="//; s/"$//' | sort -u | while read -r asset; do
  case "$asset" in
    http*|\#*|javascript:*) continue ;;
  esac
  code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$NEW$asset")"
  if [ "$code" = "200" ]; then echo "PASS  asset $asset"; else echo "FAIL  asset $asset -> $code"; fi
done

# same-origin calls the client makes
check "GET /goal preview (svg)" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -A "$UA" "$NEW/goal?start_date=2026-01-01&end_date=2026-12-31&format=svg")"
check "GET /goal preview ct" "image/svg+xml" "$(curl -sS -m 30 -o /dev/null -w '%{content_type}' -A "$UA" "$NEW/goal?start_date=2026-01-01&end_date=2026-12-31&format=svg")"
check "GET /api/stats" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$NEW/api/stats")"
check "POST /api/visit" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"visitorId":"ui-smoke"}' "$NEW/api/visit")"
check "overlay asset" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$NEW/overlay/15promax.png")"

echo
echo "ui smoke: $PASS checks passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
