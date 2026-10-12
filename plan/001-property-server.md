# Plan: property-saving server for Pune dashboard

## Context
Dashboard (`index.html`) saves properties only in browser localStorage. `data/properties.js` (`window.SAMPLE_PROPERTIES`) is read once on first load. User wants a server that accepts property details (same attributes as the add/edit form) and saves them into `data/properties.js`. Decisions: keep localStorage as the working copy and have the server mirror it into the file; keep the 3 sample entries until deleted.

## Approach
Zero-dependency Node server (Node v22 is installed; no `package.json`, no npm install).

### 1. New `server.js` (project root)
- `http` module only. Bind `127.0.0.1` by default; port 8765 (matches the existing test convention); `HOST=0.0.0.0` env opt-in for phone use on the same Wi-Fi.
- Static: serve `index.html`, `data/*` (path-normalised, reject `..`), so `python3 -m http.server` is no longer needed.
- `GET /api/properties` -> JSON array read from `data/properties.js` (evaluate with `vm.runInNewContext` on `{window:{}}`, take `window.SAMPLE_PROPERTIES`).
- `PUT /api/properties` -> body is the full array (same shape `persist()` already holds in `props`).
  - Validate at the boundary: body <= 1 MB, JSON array, each item an object with string `id` and `name`, numeric `price`/`carpet`/`bhk` when present, `scores` an object of 1-5 ints, `locality` in the localities list. Reject with 400 + message otherwise.
  - Write atomically: temp file in `data/`, then `rename`. Keep header comment and `window.SAMPLE_PROPERTIES = [...]` format, one object per line (`JSON.stringify` per item) so the file stays diff-friendly and `node --check` valid. Escape `</script>`-style sequences not needed (file is loaded as .js).
  - Serialise writes (simple promise chain) to avoid interleaved writes.
- Localities list for validation: load `data/localities.js` the same `vm` way.

### 2. Edit `index.html` (small)
- `persist()` (line ~433): after `save(LS.props, props)`, add `syncServer()`.
- `syncServer()`: if `location.protocol` is `http(s):`, `fetch('/api/properties', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(props)})`; on failure show a small non-blocking "server not reachable, saved in browser only" note. On `file://` do nothing, so current behaviour still works.
- Reuse: existing `persist()` is already called from save, delete and import paths, so no other call sites change.
- No change to the load order (`load(LS.props) ?? SAMPLE_PROPERTIES`): a fresh browser/device gets the server file's content.

### 3. Docs
- `README.md`: add "Run with server: `node server.js`, open http://localhost:8765". Note the file is overwritten from the browser's copy on each save.
- `.claude/settings.local.json`: allow `Bash(node server.js)` / `node --check server.js` if wanted (optional).

## Known limits (state in README, no extra code)
- Last write wins: two devices with different localStorage copies will overwrite each other's file content. Fine for a single user; upgrade to per-item upsert/merge if used from multiple devices.
- No auth; localhost bind by default. Using `HOST=0.0.0.0` exposes read/write to the LAN.

## Verification
1. `node --check server.js`; `node server.js`.
2. `curl localhost:8765/api/properties` returns the 3 samples.
3. `curl -X PUT` with a valid array -> 200 and `data/properties.js` rewritten; `node --check data/properties.js` passes. Invalid body (non-array, bad scores, unknown locality, `..` path) -> 400/404, file unchanged.
4. Browser at http://localhost:8765: add, edit, delete a property; confirm file content updates each time; clear localStorage and reload to confirm the file content is loaded.
5. Export/Import JSON still round-trips and import also syncs the file.
6. Open via `file://` still works (no fetch attempted).
