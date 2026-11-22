# Endpoint contracts - captured from docker.io/0x3654/untilwall:latest

Reference: image digest `sha256:c61d2fd9b595...` (arm64), created 2026-03-24,
matches repo commit `964a0ac`. Captured 2026-11-22 against
`http://127.0.0.1:3100` (container `tst_untilwall_golden`).

All handler responses (Next.js route handlers) carry:

```
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
```

The Rust backend replicates this header verbatim for contract parity.

## GET /goal (format=png, default)

```
HTTP/1.1 200 OK
cache-control: no-store, no-cache, must-revalidate
content-disposition: inline; filename="untilwall.png"
content-type: image/png
expires: 0
pragma: no-cache
x-content-type-options: nosniff
x-robots-tag: noindex, nofollow, nosnippet
```

Body: PNG, dimensions = round(param * 300/72) (density 300 over 72dpi units;
1290x2796 -> 5375x11650, 1111x777 -> 4629x3238 i.e. 3237.5 rounds up).
Renders count as image generations in stats; format=svg does not.

## GET /goal?format=svg

```
HTTP/1.1 200 OK
cache-control: public, max-age=300
content-type: image/svg+xml
x-cache: MISS | HIT        (in-memory cache, key = all params except
                            format/html/t, URLSearchParams set() dedup:
                            first-occurrence position, last value wins;
                            capacity 200, TTL 60 min, evict oldest write)
x-robots-tag: noindex, nofollow, nosnippet
```

## GET /goal?html=true

```
HTTP/1.1 200 OK
cache-control: no-store, no-cache, must-revalidate
content-type: text/html; charset=utf-8
```

Body: fixed HTML page embedding `data:image/png;base64,...`.

## GET /api/health

```
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok","timestamp":"2026-11-22T20:11:36.400Z"}   (UTC, ms precision)
```

## POST /api/visit

```
HTTP/1.1 200 OK
content-type: application/json
{"success":true,"visitorId":"<body.visitorId || cookie visitor_id || new uuid>"}
```

Invalid JSON body is treated as `{}`. Increments totalRequests and
daily.requests; appends unknown visitor ids to uniqueVisitors.
Stats file: `<cwd>/data/stats.json`, JSON.stringify(..., null, 2), no
trailing newline, key order: totalRequests, imageGenerations,
uniqueVisitors, devices, daily, lastUpdated.

## GET /api/stats

```
HTTP/1.1 200 OK
content-type: application/json
{"totalRequests":N,"imageGenerations":N,"uniqueVisitors":N,"devices":{...},"daily":{...},"lastUpdated":"..."}
```

## Static files

- `/robots.txt`, `/overlay/*.png`: `Cache-Control: public, max-age=0`,
  weak ETag `W/"<size-hex>-<mtime-ms-hex>"`, `Last-Modified`, `Accept-Ranges: bytes`.
- `/_next/static/*`: `Cache-Control: public, max-age=31536000, immutable`.
- `/icon.svg`: `cache-control: public, immutable, no-transform, max-age=31536000`.
- `/` (homepage): prerendered HTML with `x-nextjs-*` headers (not replicated;
  static export serves the same UI differently).
- unknown path: Next 404 HTML page, `Cache-Control: private, no-cache,
  no-store, max-age=0, must-revalidate`.

## Middleware: NOT ACTIVE in the image

`src/middleware.ts` (rate limiting 60/min + attack-UA blocking) is not copied
by `src/Dockerfile` (only `app`, `components`, `lib`, `public`, `types` are),
verified live: `sqlmap/1.7` UA got 200, a burst of 70 requests all got 200.
The parity target (the image) therefore has NO rate limiting; the Rust port
does not implement it either.

## Extension: `tz` parameter (Rust backend only)

`tz` sets the day-boundary timezone as signed hours from UTC: `-5`, `0`,
`+3`, `+5.5` (range -12..+14). Semantics equal a JS container running with
that TZ: `now` truncates to local midnight and date-only strings re-pin to
local midnight, so day counts are plain local-date differences and the
calendar rolls over at local midnight.

Resolution order: `tz` param > container `TZ` env (IANA name via chrono-tz,
DST-aware, or a bare number) > UTC. Invalid/out-of-range values fall back to
the container default. The parameter participates in the SVG cache key.
Without a `tz` param and with `TZ` unset the output is byte-identical to the
Next.js reference (golden tests pin this).

`GET /api/health` additionally reports the resolved container default as
`"defaultTzOffset":<hours>` (integer or fractional); the UI fetches it on
load and preselects the matching offset in the Timezone selector (no
hardcoded default; while undiscovered no tz param is sent, which yields the
same server-side result).

Integration coverage: `rust/tests/tz_api.rs` drives the real router with an
injected clock - day-boundary shifts at Moscow midnight, container default
equivalence, UTC parity invariant, invalid/out-of-range fallback, fractional
and extreme offsets, cache-key separation, health reporting.

## Resource notes (measured, arm64, 2026-11-23)

| metric | Next.js image | Rust image |
|---|---|---|
| image size | 346 MB | 71.6 MB |
| cold start to healthy | ~180 ms | ~21 ms |
| idle RSS | 54 MiB | 1.8 MiB (tini: 0.6) |
| single PNG render (density 300) | ~290 ms / 216 MiB peak | ~570 ms / **50 MiB peak** |
| 4 concurrent PNG | 1219 ms / 546 MiB peak | ~1.1 s / ~100 MiB peak |

PNG rasterization is strip-based (2048 rows at a time, progressive PNG
encoding with png-crate streaming + Fast compression): peak RSS per render
is one strip (~44 MB at density 300) instead of a full 5375x11650 pixmap
(~250 MB, which the full-pixmap approach peaked at 500 MB with). RMSE vs
the Next.js engine stays 2.0-2.4%. Speed is ~2x slower than the
full-pixmap variant (~570 ms vs ~230 ms per render) - irrelevant for the
once-a-day wallpaper use case, and `RENDER_DENSITY=72` renders at the
device's native resolution instead (1290x2796 for a 15 Pro Max, ~17x fewer
pixels) if a host wants both fast and tiny. `RENDER_CONCURRENCY` (default
2) bounds parallel renders; both knobs are plain env vars.

## Behavioral notes pinned by the golden SVGs

- Numbers are interpolated with JS semantics: shortest round-trip floats,
  `Math.round` ties toward +Infinity, `toFixed(1)` ties pick the larger n.
- Invalid numbers propagate as literal `NaN`/`Infinity` into SVG attributes
  (see svg-bad-date, svg-width-abc, svg-dotscale-abc cases).
- `ring_style` outside 0..11 (e.g. 101, `abc`) falls through to inline
  `<circle>` elements (no `<defs>` symbols).
- end_date < start_date produces negative/NaN day counts (svg-end-before-start).
- The reference container runs with TZ=UTC; date math is UTC throughout.
