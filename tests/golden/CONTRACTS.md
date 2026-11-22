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

## Behavioral notes pinned by the golden SVGs

- Numbers are interpolated with JS semantics: shortest round-trip floats,
  `Math.round` ties toward +Infinity, `toFixed(1)` ties pick the larger n.
- Invalid numbers propagate as literal `NaN`/`Infinity` into SVG attributes
  (see svg-bad-date, svg-width-abc, svg-dotscale-abc cases).
- `ring_style` outside 0..11 (e.g. 101, `abc`) falls through to inline
  `<circle>` elements (no `<defs>` symbols).
- end_date < start_date produces negative/NaN day counts (svg-end-before-start).
- The reference container runs with TZ=UTC; date math is UTC throughout.
