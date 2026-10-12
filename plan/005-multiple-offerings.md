# Plan: Buildings with multiple offerings (units) + per-offering files

## Context
Today one property = one flat row (one BHK/price). A building can sell 2 BHK and 3 BHK (different price, carpet, EMI), and some documents are shared (RERA cert, brochure, layout of the tower) while others differ per offering (floor plan, price sheet). Chosen design: **Building entity with nested units**, and **files tagged to a building + any subset of its offerings** (empty subset = shared by all).

Everything lives in `index.html` (~780 lines) and `server.js`; data in `data/properties.js` (`window.SAMPLE_PROPERTIES`) mirrored by `PUT /api/properties`; files in `files/index.json`.

## Data model
Building (shared; one record):
`{id, name, builder, locality, lat, lng, status, possession, rera, reraNo, visitDate, broker, link, notes, scores, units:[...]}`
Unit (offering):
`{id, bhk, price, carpet, sba, nego, notes}`
Assumption (say if wrong): status/possession/RERA/broker/location/ratings are building-level. All 14 ratings (water, schools, builder...) describe the building, so a building's offerings share one score; price/EMI/rate-vs-market differ per offering.

**Migration (idempotent `migrate(arr)`, run on load from localStorage/`SAMPLE_PROPERTIES` and on JSON import):** an item without `units` becomes a building with one unit; building `id` = old id, unit `id` = old id (separate namespaces). Then `persist()` once so the server file is rewritten in the new shape. Export becomes `version: 2`; import accepts v1 (migrated).

## Key trick: flatten, don't rewrite
Add `listings()` = `buildings.flatMap(b => b.units.map(u => ({...b, ...u, id: u.id, buildingId: b.id, label}))`, where `label` = building name, plus ` · 2 BHK` when the building has >1 unit. `enrich()` then runs on listings, so `finance`, `scoreOf`, `rateInfo`, `dealBreakers`, the Properties table, filters, sort, Overview shortlist/charts and Compare keep working with a mechanical change (`props.map(enrich)` -> `listings().map(enrich)`, `p.name` -> `p.label` in display spots). Rename state var `props` -> `buildings` only where it is mutated.

## index.html changes
1. **State/migrate/persist**: `buildings` (was `props`); `migrate()`; `persist()` unchanged otherwise. Export/import version 2.
2. **Properties table**: one row per offering (flattened). Name cell shows building name + builder + "N offerings" note; BHK column distinguishes rows. Buttons: **Edit** (opens building dialog), **Nearby** (building id), **Clone** (duplicates that offering inside the same building, then opens the dialog; replaces the whole-property clone from plan 004).
3. **Edit dialog (`openForm(buildingId)`)**: building fields + ratings + notes as today, minus BHK/price/carpet/sba/nego. New **Offerings** section: one mini-row per unit (BHK select, price, carpet, saleable, negotiation room, notes) with "Add offering" and per-row remove (last unit cannot be removed; delete the building instead). New building starts with one blank unit. Save writes building + units; unit ids via existing `uid()`.
4. **Delete building** removes all its units; files stay listed as "(deleted building)" as before (no cascade).
5. **Compare**: checkbox list is per offering (`label`); radar/table unchanged. `cmpSel` holds unit ids.
6. **Map**: iterate `buildings`: one marker per building (not per unit); popup lists each offering `2 BHK ₹x Cr`. **Nearby** keyed by building (`coordsOf(building)`); cache key unchanged.
7. **Localities count** ("N visited") counts buildings.
8. **Files tab**:
   - Upload form: Building select + checkbox list of that building's offerings; default "All offerings (shared)"; ticking specific ones scopes the file to them.
   - List column "Applies to": building name plus `All offerings` badge or `2 BHK, 3 BHK`. Filter select (building -> optionally offering): an offering filter shows its own files **plus** the building's shared files.
   - **Tag** button per row to change building/offerings afterwards (PATCH).
   - Legacy files (`propertyId` only) resolve client-side: building id = `propertyId`, treated as shared. No data migration on disk.
   - Viewer dialog header shows the same "Applies to" text.

## server.js changes
- `validate(arr)`: buildings: `id` unique non-empty string, `name` string, known `locality`, `scores` as today, `units` non-empty array; each unit `id` unique across the whole file, `bhk/price/carpet/sba/nego` finite numbers; building `lat/lng` finite.
- `upload()`: read `X-Building-Id` (<=64 chars) and `X-Unit-Ids` (comma list, each <=64, max 20); store `buildingId`, `unitIds` (array) in meta; keep writing `propertyId = buildingId` for backward compatibility.
- New `PATCH /api/files/<id>` (JSON body `{buildingId, unitIds}`, same size/format checks, via `updateIndex`); 404 if unknown.
- No change to serving, magic-byte check, or delete.

## Docs
- `README.md`: buildings/offerings model, shared vs per-offering files, migration note, export v2.
- `TODO.md`: add item "Multiple offerings per building" -> Done; new `plan/005-multiple-offerings.md` (copy of this plan). Note in plan 004 that Clone is now per offering.

## Risks / limits
- Behaviour change: ratings are per building, so you cannot rate a 3 BHK differently from the 2 BHK of the same building (e.g. facing/floor). Floor/facing go in unit notes. Say if you want optional per-offering score overrides.
- Existing browser data and `data/properties.js` get rewritten in the new shape on first load; keep a copy via Export JSON first. Old v1 exports still import.
- No automatic merging of existing duplicate rows (e.g. two rows named the same building); merge by hand: open the building, add offerings, delete the old row.
- Unit ids are not reused across buildings; deleting a unit leaves files scoped only to it with an empty-looking tag set (shown as "(removed offering)"); they are not silently turned into shared files.

## Verification (Chrome via `node server.js`, port 8765; `node --check server.js`)
1. Back up with Export JSON. Reload: all 5 existing rows appear as before (one offering each); `data/properties.js` is now building/units shape; console clean.
2. Add building "Test Towers" with 2 BHK and 3 BHK offerings: two table rows, different price/EMI/rate, same score; filter by BHK 3 shows one; Overview and Compare list both with `· 2 BHK` / `· 3 BHK` labels.
3. Clone an offering: new unit in the same building, no new building. Remove an offering; last-unit remove blocked. Delete building removes both rows.
4. Map: one marker for Test Towers listing both offerings; Nearby works from the row button.
5. Files: upload A as shared (All offerings), B tagged to 2 BHK only, C tagged to 2 BHK + 3 BHK. Filter "Test Towers - 3 BHK" shows A and C; "2 BHK" shows A, B, C. Tag button changes B to 3 BHK and the list updates. Legacy file (old `propertyId`) shows under its building as shared.
6. `curl` PUT of old-shape array -> 400; PUT with duplicate unit id -> 400; PATCH unknown file -> 404; upload with 21 unit ids -> 400.
7. Dark mode and viewer still fine; import a v1 export and a v2 export.
