# Plan 004: Dashboard v2 (clubs 002 + 003 + layout/clone)

Single reference for the TODO.md feature set. Details of 002 and 003 stay in their files.

## Scope
| Part | Source | Status |
|------|--------|--------|
| Dark mode, full-screen map, nearby services, Files tab | plan/002 | Done |
| Files viewer: magic-byte check at upload, in-page pop-up viewer | plan/003 | Done |
| Wider centre content (Properties table horizontal scroll) | this plan | Done |
| Clone property | this plan | Done |

## Wider layout (`index.html`)
- `main{max-width:min(1800px,98vw)}` (was 1200px). `.tw{overflow-x:auto}` stays as fallback on narrow screens.

## Clone property (`index.html`)
- "Clone" button in the Properties row actions (`data-clone`).
- `cloneProp(id)`: deep copy via JSON, new `uid()`, name + " (copy)", `sample` flag dropped, `persist()`, then opens the edit dialog on the copy.
- Files are not copied (they stay tagged to the original property).

## Verification (Chrome, `node server.js`)
1. Properties tab at 1440px+: no horizontal scrollbar; at narrow width the table scrolls inside `.tw`.
2. Clone a property: new row "<name> (copy)", edit dialog opens, all fields/scores equal; Cancel keeps the copy; editing the copy does not change the original.
3. Reload: clone persists; `data/properties.js` synced; console clean.

Note: plan 005 changed Clone. It now duplicates an offering inside the same building (`cloneUnit`), not a whole property.
