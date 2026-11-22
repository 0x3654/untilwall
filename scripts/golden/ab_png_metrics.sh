#!/usr/bin/env bash
# PNG metrics for the A/B run: ImageMagick RMSE per case (runs in a container),
# plus a montage contact sheet of the worst cases.
#
# Usage: scripts/golden/ab_png_metrics.sh [threshold=0.05]

set -euo pipefail

THRESHOLD="${1:-0.05}"
AB="${AB:-.ab-results}"
OUT="${OUT:-.ab-results}"

# ab_compare.sh must have run first
[ -d "$AB" ] || { echo "no .ab-results; run ab_compare.sh first" >&2; exit 1; }

docker run --rm --name tst_untilwall_abpng \
  -v "$PWD":/work -w /work alpine:3.22 sh -c "
apk add -q --no-cache imagemagick >/dev/null 2>&1
threshold=$THRESHOLD
printf '%-28s %10s %8s\n' case rmse_norm verdict
for f in $AB/case-png-*.txt; do
  name=\$(basename \"\$f\" .txt); name=\${name#case-}
  old=\"$AB/\$name.old\"; new=\"$AB/\$name.new\"
  [ -f \"\$old\" ] && [ -f \"\$new\" ] || continue
  # compare prints to stderr: '1234.5 (0.01875)'
  line=\$(compare -metric RMSE \"\$old\" \"\$new\" null: 2>&1 || true)
  norm=\$(echo \"\$line\" | sed -n 's/.*(\([0-9.e-]*\)).*/\1/p')
  [ -n \"\$norm\" ] || { printf '%-28s %10s %8s\n' \"\$name\" 'ERROR' '?'; continue; }
  verdict=OK
  high=\$(awk -v a=\"\$norm\" -v b=\"\$threshold\" 'BEGIN{print (a>b)?1:0}')
  [ \"\$high\" = 1 ] && verdict=OVER
  printf '%-28s %10s %8s\n' \"\$name\" \"\$norm\" \"\$verdict\"
done
# contact sheet for cases above threshold
mkdir -p $AB/montage
for f in $AB/case-png-*.txt; do
  name=\$(basename \"\$f\" .txt); name=\${name#case-}
  old=\"$AB/\$name.old\"; new=\"$AB/\$name.new\"
  [ -f \"\$old\" ] || continue
  convert \"\$old\" -resize 400x400 \"\$old.small\"
  convert \"\$new\" -resize 400x400 \"\$new.small\"
  convert \"\$old.small\" \"\$new.small\" +append \"$AB/montage/\$name.png\" 2>/dev/null || true
  rm -f \"\$old.small\" \"\$new.small\"
done
montage $AB/montage/*.png -tile 2x -geometry +4+4 -label '%t' $AB/contact-sheet.png 2>/dev/null || true
echo 'contact sheet: .ab-results/contact-sheet.png'
"

# summary for humans (outside container): also print worst/mean via awk over the table above is
# done in the report step; here we just keep raw values in metrics.txt
