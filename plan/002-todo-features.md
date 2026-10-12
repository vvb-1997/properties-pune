# Plan: TODO.md features (dashboard v2)

## Context
`TODO.md` lists 6 features. Two are marked "Do not work Now - Need research" (RERA connection, builder past history) and are **out of scope**. The 4 in scope: dark mode, nearby services, full-screen map, a Files tab. Decisions: nearby services via live OpenStreetMap lookup; files stored in a server folder tagged by property. Everything is in `index.html` (CSS lines 8-50, nav line 57, map code ~492, `renderMap`) and `server.js` (static + `/api/properties`).

Build order is easiest-first; each step is independently shippable.

## 1. Dark mode (`index.html`)
- CSS: add `[data-theme="dark"]` override of the `:root` variables (`--bg --card --ink --mute --line --accent`...). Replace hard-coded colours with variables: `input/select/textarea` `#fff`, `.b-good/.b-warn/.b-bad/.b-mute`, `.flag/.ok/.warnbox`, `button.btn.sec/.del`.
- Toggle button in `<header>` next to `#nav`; persists in localStorage key `pune_theme`; default from `prefers-color-scheme`. Apply theme before first paint (tiny inline script in `<head>`) to avoid a flash.
- Chart.js: set `Chart.defaults.color` / `borderColor` from the current theme and call existing `renderAll()` on toggle (`mkChart` already destroys/recreates charts). Radar grid colour too.
- Leaflet tiles stay light; optional CSS filter on `.leaflet-tile` in dark mode (invert + hue-rotate), keep markers unfiltered.

## 2. Full-screen map (`index.html`)
- Wrap `#map` in `#mapwrap`; add a "Full screen" button over it (Leaflet control or plain button).
- Use the Fullscreen API on `#mapwrap` (`requestFullscreen` / `exitFullscreen`; Esc exits natively). On `fullscreenchange`, set the map height to `100vh` via a class and call the existing `map.invalidateSize()` (already used at line ~243).
- Fallback if the API is unavailable (iOS Safari): CSS class `.mapfull` (`position:fixed; inset:0; z-index:1000`) toggled by the same button.

## 3. Nearby services (`index.html`)
- New `nearby(lat, lng, radiusM)`: one POST to the Overpass API (`https://overpass-api.de/api/interpreter`) with a single union query: `amenity=school|college`, `amenity=hospital|clinic`, `shop=mall`, `leisure=park|garden` within `around:radius`, `out center 80`. Compute haversine distance per hit (`center` for ways), group by the 4 categories, keep the nearest 5 each.
- Coordinates: property `lat/lng` if set, else the locality centre from `LOCALITIES` (`locByKey`), labelled "approximate" in the UI. Default radius 3 km, selectable (1/2/3/5).
- Cache results in localStorage `pune_nearby_v1`, keyed by `lat4,lng4,radius`, so each lookup runs once; a "Refresh" button bypasses the cache. Show loading and error states (Overpass can 429/timeout: one retry on the mirror `overpass.kumi.systems`, then a message).
- UI: **"Nearby"** button per property (row in the Properties table, and in the edit dialog) opening the existing `#dlg` with four lists (name + distance, sorted). On the Map tab, four checkboxes toggle Leaflet layer groups for the selected property's results (extend `renderMap`/`markers` handling).
- Does not alter scores automatically; the user still rates schools/hospitals/etc. by hand (counts shown as a hint).
- Privacy note in README: lookups send the property's coordinates (or locality centre) to the Overpass service, only on user click.

## 4. Files tab (`server.js` + `index.html`)
Server (`server.js`):
- Storage: `files/` dir (create on start) plus `files/index.json` metadata `[{id, name, size, type, propertyId, uploaded}]`; disk filename is a random id (never the user's name). Metadata writes reuse the existing serialised queue + temp-file + rename pattern.
- `GET /api/files` list. `POST /api/files` raw body streamed to disk (not the 1 MB string reader): headers `X-Filename` (URL-encoded) and optional `X-Property-Id`; cap 25 MB (abort with 413 and delete the partial file); extension allowlist: pdf, png, jpg, jpeg, webp, gif, doc, docx, xls, xlsx, txt, csv. `DELETE /api/files/<id>`.
- `GET /files/<id>`: serve with `X-Content-Type-Options: nosniff`, content type from the allowlist, `Content-Disposition` with the sanitised original name (inline for pdf/images, attachment otherwise). Never serve html/svg.
- Existing static rule (index.html + `data/` only) stays; `files/` is reachable only through the id route.
Client (`index.html`):
- New nav button "Files" + `<section id="files">`: file input (multiple), property dropdown (None + `props`), upload with progress via `fetch`, table of name / property / size / date with Open and Delete (confirm). Image/PDF links open in a new tab.
- Property deleted later: its files show "(deleted property)" and stay listed; no cascade delete.
- On `file://` (no server) show a note: "Run node server.js to use files". Export JSON does not include files (state in README).

## Docs / housekeeping
- `README.md`: dark mode, full-screen map, nearby (privacy note), Files tab + limits. Mark the 4 items done in `TODO.md`; leave the two research items untouched.
- Save this plan as `plan/002-todo-features.md`.

## Risks / limits
- Overpass is a free shared service: results depend on OSM coverage (Pune is good, but malls/gardens may be sparse) and it can rate-limit.
- Files tab has no auth; server binds localhost by default (`HOST=0.0.0.0` exposes uploads to the LAN).
- Dark-mode contrast of the badge colours needs a visual check, not just a code check.

## Verification (Chrome, via `node server.js` on :8765)
1. Dark mode: toggle, reload (persists), check all 5 tabs + the add/edit dialog + both charts + badges are readable; screenshot each.
2. Full screen: button enters/exits (Esc too), tiles fill the screen after `invalidateSize`, markers still clickable.
3. Nearby: click for a sample property; expect lists in all 4 categories for Baner with sensible distances; second click is served from cache (no network request); simulate offline -> error message. Map layers toggle.
4. Files: upload a PDF and a PNG tagged to a property; list shows both; Open works; a `.html` file and a >25 MB file are rejected with 400/413; Delete removes the file from disk and `files/index.json`; `curl` for `/files/../server.js` and a bad id returns 404.
5. Regression: add/edit/delete property still syncs to `data/properties.js`; console has no errors; `node --check server.js`.
