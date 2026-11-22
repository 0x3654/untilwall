#!/usr/bin/env bash
# A/B compare the reference (Next.js) and new (Rust) untilwall servers.
#
# Usage:
#   OLD=http://127.0.0.1:3100 NEW=http://127.0.0.1:3110 scripts/golden/ab_compare.sh
#
# - SVG cases: byte comparison + header comparison (must be identical)
# - PNG cases: ImageMagick RMSE (rasterizers differ; warn threshold 5%)
# - writes per-case results into .ab-results/ and prints a summary table

set -euo pipefail

OLD="${OLD:-http://127.0.0.1:3100}"
NEW="${NEW:-http://127.0.0.1:3110}"
GOLDEN_ROOT="${GOLDEN_ROOT:-tests/golden}"
OUT="${OUT:-.ab-results}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

mkdir -p "$OUT"
rm -f "$OUT"/case-*.txt

# header keys we compare (values must match; Date/Connection/Content-Length excluded)
COMPARE_HEADERS='^content-type:|^cache-control:|^x-cache:|^x-robots-tag:|^x-content-type-options:|^content-disposition:|^pragma:|^expires:|^vary:'

collect_headers() { # $1=url $2=outfile
  curl -sS -m 180 -A "$UA" -D "$2" -o /dev/null "$1"
  tr -d '\r' < "$2" | grep -iE "$COMPARE_HEADERS" | sort > "$2.filtered"
}

for case_dir in "$GOLDEN_ROOT"/*/; do
  case_name="$(basename "$case_dir")"
  params_file="$case_dir/params.txt"
  [ -f "$params_file" ] || continue

  # build query from params.txt (values are percent-encoded already)
  query=""
  while IFS=$'\t' read -r key value; do
    [ -n "$key" ] || continue
    query+="${query:+&}${key}=${value}"
  done < "$params_file"

  old_url="$OLD/goal?$query"
  new_url="$NEW/goal?$query"

  # fetch both
  curl -sS -m 180 -A "$UA" -o "$OUT/$case_name.old" "$old_url"
  curl -sS -m 180 -A "$UA" -o "$OUT/$case_name.new" "$new_url"
  collect_headers "$old_url" "$OUT/$case_name.old.h"
  collect_headers "$new_url" "$OUT/$case_name.new.h"

  # figure out format from body magic
  kind="svg"
  if head -c 4 "$OUT/$case_name.old" | grep -q $'\x89PNG' 2>/dev/null || head -c 8 "$OUT/$case_name.old" | od -An -tx1 | grep -q '89 50 4e 47'; then
    kind="png"
  fi

  {
    printf 'case=%s\nkind=%s\n' "$case_name" "$kind"
    if [ "$kind" = "svg" ]; then
      if cmp -s "$OUT/$case_name.old" "$OUT/$case_name.new"; then
        printf 'svg_bytes=IDENTICAL\n'
      else
        printf 'svg_bytes=DIFFER\n'
        diff <(head -c 4000 "$OUT/$case_name.old") <(head -c 4000 "$OUT/$case_name.new") | head -6 || true
      fi
    else
      printf 'png=deferred\n'
    fi
    if diff -q "$OUT/$case_name.old.h.filtered" "$OUT/$case_name.new.h.filtered" >/dev/null; then
      printf 'headers=MATCH\n'
    else
      printf 'headers=DIFFER\n'
      diff "$OUT/$case_name.old.h.filtered" "$OUT/$case_name.new.h.filtered" | head -10 || true
    fi
  } > "$OUT/case-$case_name.txt"
done

echo "Fetched all cases. Run scripts/golden/ab_png_metrics.sh for PNG RMSE."
echo "Summary (svg bytes / headers):"
grep -H -E 'svg_bytes=|headers=' "$OUT"/case-svg-*.txt | sed "s|$OUT/case-||; s|\.txt:|: |" || true
echo
echo "PNG cases:"
grep -H -E 'png=deferred' "$OUT"/case-png-*.txt | sed "s|$OUT/case-||; s|\.txt:|: |" || true
