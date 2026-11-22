#!/usr/bin/env bash
# Capture golden reference responses from a running untilwall instance.
#
# Usage:
#   BASE_URL=http://127.0.0.1:3100 OUT=tests/golden scripts/golden/capture.sh
#
# Output layout:
#   $OUT/<case>/body        response body (svg text or png binary)
#   $OUT/<case>/headers.txt raw response headers
#   $OUT/<case>/meta.txt    one-line summary (status, content-type, sha256, size)
#   $OUT/manifest.sha256    hashes of all bodies
#   $OUT/CAPTURE_DATE       date the responses were captured (golden SVGs are
#                           date-dependent: days passed changes daily)
#
# PNG bodies are written next to SVG ones; gitignore tests/golden/*/body for
# png cases via tests/golden/png-* naming (see .gitignore).

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3100}"
OUT="${OUT:-tests/golden}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

mkdir -p "$OUT"
date -u +"%Y-%m-%d" > "$OUT/CAPTURE_DATE"
: > "$OUT/manifest.sha256"

# capture <case-name> [key=value ...] -- extra curl args go in CURL_EXTRA
capture() {
  local name="$1"; shift
  local dir="$OUT/$name"
  mkdir -p "$dir"
  local args=(-G -sS -m 180 -A "$UA" -D "$dir/headers.txt" -o "$dir/body")
  for kv in "$@"; do
    args+=(--data-urlencode "$kv")
  done
  curl "${args[@]}" "$BASE_URL/goal"
  # persist case params (value percent-encoded, one KEY<TAB>VALUE per line)
  : > "$dir/params.txt"
  for kv in "$@"; do
    key="${kv%%=*}"
    val="${kv#*=}"
    printf '%s\t%s\n' "$key" "$(printf '%s' "$val" | jq -Rr @uri)" >> "$dir/params.txt"
  done
  local status ctype sha size
  status="$(head -1 "$dir/headers.txt" | tr -d '\r')"
  ctype="$(grep -i '^content-type:' "$dir/headers.txt" | head -1 | tr -d '\r' | cut -d' ' -f2-)"
  sha="$(sha256sum "$dir/body" | cut -d' ' -f1)"
  size="$(wc -c < "$dir/body" | tr -d ' ')"
  printf 'case=%s\n%s\ncontent-type: %s\nsha256: %s\nbytes: %s\n' \
    "$name" "$status" "$ctype" "$sha" "$size" > "$dir/meta.txt"
  printf '%s  %s/body\n' "$sha" "$name" >> "$OUT/manifest.sha256"
  echo "captured $name ($status, $ctype, $size bytes)"
}

Y1="start_date=2026-01-01&end_date=2026-12-31"

# --- ring_style matrix, format=svg (byte-parity target) ---
capture svg-style-default  start_date=2026-01-01 end_date=2026-12-31 format=svg
for s in 0 1 2 3 4 5 6 7 8 9 10 11; do
  capture "svg-style-$s" start_date=2026-01-01 end_date=2026-12-31 ring_style="$s" format=svg
done
# unknown style values: fall through to inline circles
capture svg-style-101      start_date=2026-01-01 end_date=2026-12-31 ring_style=101 format=svg
capture svg-style-abc      start_date=2026-01-01 end_date=2026-12-31 ring_style=abc format=svg

# --- text / modes ---
capture svg-showtext-0     start_date=2026-01-01 end_date=2026-12-31 show_text=0 format=svg
capture svg-elapsed        start_date=2026-01-01 end_date=2026-12-31 elapsed_mode=true format=svg
capture svg-widgets        start_date=2026-01-01 end_date=2026-12-31 has_widgets=true format=svg

# --- goal text: latin, russian, emoji, multiline, html-escape ---
capture svg-goal-latin     start_date=2026-01-01 end_date=2026-12-31 goal_text=Save money format=svg
capture svg-goal-ru        start_date=2026-01-01 end_date=2026-12-31 goal_text='Накопить на отпуск' format=svg
capture svg-goal-emoji     start_date=2026-01-01 end_date=2026-12-31 goal_text='Get ripped 💪🔥' format=svg
capture svg-goal-multiline start_date=2026-01-01 end_date=2026-12-31 goal_text='Line one
Line two' format=svg
capture svg-goal-escape    start_date=2026-01-01 end_date=2026-12-31 goal_text='<b>&"quote"</b>' format=svg
capture svg-goal-offset    start_date=2026-01-01 end_date=2026-12-31 goal_text=Goal goal_text_top_offset=7.5 format=svg

# --- offsets, widgets, dot scale ---
capture svg-offsets        start_date=2026-01-01 end_date=2026-12-31 offset_top=15 offset_bottom=25 offset_left=10 offset_right=10 format=svg
capture svg-offsets-neg    start_date=2026-01-01 end_date=2026-12-31 offset_top=-5.5 offset_bottom=-3 offset_left=-2.25 offset_right=-7 format=svg
capture svg-dotscale-05    start_date=2026-01-01 end_date=2026-12-31 dot_scale=0.5 format=svg
capture svg-dotscale-2     start_date=2026-01-01 end_date=2026-12-31 dot_scale=2 format=svg
capture svg-dotscale-abc   start_date=2026-01-01 end_date=2026-12-31 dot_scale=abc format=svg

# --- colors ---
capture svg-colors         start_date=2026-01-01 end_date=2026-12-31 'bg_color=#001230' 'past_color=#ffd700' 'current_color=#00ffcc' 'future_color=#444455' 'goal_color=#ff0055' goal_text=Colors format=svg

# --- geometry ---
capture svg-landscape      start_date=2026-01-01 end_date=2026-12-31 width=2732 height=2048 format=svg
capture svg-small          start_date=2026-01-01 end_date=2026-12-31 width=800 height=600 format=svg
capture svg-empty-width    start_date=2026-01-01 end_date=2026-12-31 width= height= format=svg

# --- extreme dates ---
capture svg-future-start   start_date=2030-01-01 end_date=2031-01-01 format=svg
capture svg-same-day       start_date=2026-11-22 end_date=2026-11-22 format=svg
capture svg-end-before-start start_date=2026-12-31 end_date=2026-01-01 format=svg
capture svg-bad-date       start_date=garbage end_date=2026-12-31 format=svg
capture svg-long-range     start_date=2000-01-01 end_date=2080-01-01 format=svg

# --- cache-buster param must not affect output ---
capture svg-cachebust      start_date=2026-01-01 end_date=2026-12-31 format=svg t=123456789

# --- NaN propagation through width ---
capture svg-width-abc      start_date=2026-01-01 end_date=2026-12-31 width=abc height=600 format=svg

# --- PNG subset (rasterization; hashes are engine-specific) ---
capture png-default        start_date=2026-01-01 end_date=2026-12-31
capture png-style-0        start_date=2026-01-01 end_date=2026-12-31 ring_style=0
capture png-style-2        start_date=2026-01-01 end_date=2026-12-31 ring_style=2
capture png-style-9        start_date=2026-01-01 end_date=2026-12-31 ring_style=9
capture png-goal-emoji     start_date=2026-01-01 end_date=2026-12-31 goal_text='Get ripped 💪🔥'
capture png-landscape      start_date=2026-01-01 end_date=2026-12-31 width=2732 height=2048
capture png-small          start_date=2026-01-01 end_date=2026-12-31 width=800 height=600
capture png-odd-size       start_date=2026-01-01 end_date=2026-12-31 width=1111 height=777
capture png-widgets-offsets start_date=2026-01-01 end_date=2026-12-31 has_widgets=true offset_top=15 offset_bottom=25 offset_left=10 offset_right=10
capture png-showtext-0     start_date=2026-01-01 end_date=2026-12-31 show_text=0
capture png-dotscale-05    start_date=2026-01-01 end_date=2026-12-31 dot_scale=0.5

# --- html=true wrapper (headers only matter; body is PNG base64) ---
mkdir -p "$OUT/html-true"
curl -G -sS -m 180 -A "$UA" -D "$OUT/html-true/headers.txt" \
  --data-urlencode start_date=2026-01-01 --data-urlencode end_date=2026-12-31 \
  --data-urlencode html=true -o "$OUT/html-true/body" "$BASE_URL/goal"
echo "captured html-true"
sha="$(sha256sum "$OUT/html-true/body" | cut -d' ' -f1)"
printf '%s  html-true/body\n' "$sha" >> "$OUT/manifest.sha256"

echo
echo "DONE. Manifest: $OUT/manifest.sha256 ($(wc -l < "$OUT/manifest.sha256" | tr -d ' ') entries)"
