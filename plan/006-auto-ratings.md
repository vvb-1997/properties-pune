# Plan 006: Auto-ratings from Google Maps + free map data

## Context
Dashboard scores 14 criteria 1-5, all by hand (`CRITERIA` in `index.html`, `p.scores`). Many criteria are measurable from map data (schools, hospitals, mall, garden, transport, commute, flood). Goal: compute a **suggested** rating per criterion, with the source and the reason, so hand scores get a data check. Manual scores stay untouched (user choice). Output includes a markdown listing every source and why each rating came out as it did. A "Run auto-rating" button is a later, optional step.

## What can and cannot be rated
| Criterion | Auto? | Method | Sources |
|---|---|---|---|
| schools, hospitals, mall, garden | Yes | Count within 1/2/3 km + nearest distance + avg Google rating of top places (min 20 reviews) | Google Places Nearby (Enterprise fields: rating, userRatingCount); fallback OSM Overpass (already used by Nearby) |
| transport | Yes | Nearest metro station, bus stops within 500 m, rail within 3 km | Places `transit_station`; OSM `railway=station`, `highway=bus_stop` |
| commute | Yes (needs destination) | Peak drive time (8:30 weekday) to a configured office/point + a second point (e.g. Hinjewadi, Pune station) | Google Routes Compute Route Matrix, traffic-aware; fallback OSRM (no traffic, flagged low confidence) |
| flood | Hint only, low confidence | Elevation vs lowest point within 1 km, distance to nearest river/nala (Ramnadi), plus `floodRisk` already in `data/localities.js` | Google Elevation or Open-Elevation; OSM `waterway=river/stream`; localities.js |
| safety | Hint only | Police stations within 2 km, hospital 24h proximity. Not a crime measure | Places/OSM |
| amenities, resale | No | Show info only: Google rating + review count of the building itself (Text Search by name), and price vs locality avg (existing `vs market`) | Places Text Search |
| water, power, rera, builder | **No, manual only** | Not knowable from maps. Show locality risk from localities.js as a hint. RERA/builder history stays under the "need research" TODO | n/a |

Rating bands live in one table `data/rating-rules.js` (thresholds per criterion, e.g. schools: 5 = >=6 within 2 km and avg >=4.2, 4 = >=4..., 1 = none within 3 km). Every rule is data, so the markdown can print the exact rule used.

## Cost / key (Google, checked Oct 2026 pricing page)
Per 1,000 calls, free cap per month: Nearby Search Pro $32 (5,000 free), Nearby Enterprise (needed for rating fields) $35 (1,000 free), Text Search Enterprise $35 (1,000 free), Routes Matrix Essentials $5 (10,000 free), Elevation $5 (5,000 free), Geocoding $5 (10,000 free). One building run ~ 5 Nearby + 1 Text Search + 1 Matrix + 1-2 Elevation = about 9 calls. 100 buildings per month stays inside the free caps. A cost guard in the script caps calls per run and counts per month in `data/rating-usage.json`.
How to get a key (user steps):
1. console.cloud.google.com > create project > attach a billing account (card required; Google also offers a $300 trial).
2. APIs & Services > Library > enable **Places API (New)**, **Routes API**, **Elevation API**.
3. Credentials > Create credentials > API key > restrict to those 3 APIs (IP restriction to your machine if possible).
4. Set a budget alert (Billing > Budgets) at e.g. Rs 500, so a bug cannot run up a bill.
5. `export GOOGLE_API_KEY=...` before `node server.js`. The key never goes in the browser, `data/`, or the repo.
Without a key, the script runs the free path (OSM Overpass + OSRM + Open-Elevation) and marks Google-only evidence "not available".

## Design
- `scripts/autorate.js` (Node, zero deps like `server.js`; uses global `fetch`): `rateBuilding(p, opts) -> {asOf, ratings:{key:{v, conf, why, srcs, raw}}, calls}`. One adapter per source (`google`, `overpass`, `osrm`, `elevation`), each returns raw facts; rules in `data/rating-rules.js` turn facts into `v` 1-5 and a one-line `why` ("7 schools within 2 km, best 4.5 stars from 310 reviews").
- Stored per building as `p.auto` (not `p.scores`). `validate()` in `server.js:25` gets a check that `p.auto.ratings[k].v` is an integer 1-5; existing score validation unchanged.
- Cache raw API responses 30 days in `data/rating-cache.json` (keyed by lat/lng rounded to 4 places + criterion) so reruns cost nothing. Reuse the Overpass endpoints and caching idea already in `index.html` (Nearby, `pune_nearby_v1`).
- Needs lat/lng. If a building has none, geocode its name + locality once (Geocoding) and save the result.
- CLI: `node scripts/autorate.js [buildingId|--all] [--free]` writes `p.auto` into `data/properties.js` through the same queue/rename path as `writeProps`, then regenerates the markdown. Server route `POST /api/autorate/:id` calls the same function (for the later button).
- Commute destinations: `data/rating-config.js` (`window.RATING_CONFIG = {commute:[{name, lat, lng, weight}]}`). **Asked at build time:** user's office location.

## Markdown output
1. `docs/RATING-SOURCES.md` (static, written once): each source (Google Places/Routes/Elevation, OSM Overpass, OSRM, Open-Elevation, localities.js), what it gives, licence/terms notes (Google data may not be cached longer than allowed or shown off-Google-map; keep the cache to short-lived raw numbers and note this), known biases (OSM coverage uneven, Google ratings skew high, review counts favour malls), and the full rating-rule tables per criterion.
2. `RATINGS.md` (generated per run, overwritten): per building a table `criterion | auto | your score | confidence | why | sources | date`, then a "differs by 2+" list, and unrated criteria with the reason. This is what answers "why are the ratings such".

## Dashboard (small, phase 2, low priority)
- Properties edit dialog: next to each slider show `auto 4 (i)` badge with `why` in a tooltip; "Apply suggestions" button copies selected criteria into sliders (still needs Save). Compare tab: optional row "auto".
- Button "Run auto-rating" on a building (needs server): `POST /api/autorate/:id`, shows summary panel (counts, criteria that differ, calls used, month usage). Disabled with a note when not on `node server.js`. Privacy note in README: coordinates go to Google (if key) and Overpass/OSRM, like Nearby does today.

## Build order
1. `data/rating-rules.js` + `scripts/autorate.js` free path (Overpass, OSRM, Elevation) + `RATINGS.md` generator. Test on "Leela Heights" (lat 18.6078558, lng 73.7385376, the only real building).
2. Google adapter behind `GOOGLE_API_KEY`, cost guard, cache.
3. `docs/RATING-SOURCES.md`, README section, `plan/006-auto-ratings.md` copy, TODO entry.
4. Server route + validate + dashboard badges + button.

## Verification
- Run `node scripts/autorate.js <Leela Heights id> --free`: `p.auto` has ratings for schools, hospitals, mall, garden, transport, flood; `RATINGS.md` shows why-text and sources; `p.scores` unchanged.
- Spot-check 3 ratings by hand against Google Maps in the browser (count schools/hospitals within 2 km).
- Run again: zero network calls (cache hit). Unset key: Google rows say "not available", no crash. Cost guard: set cap to 1, confirm run stops with message.
- Rules sanity: run on the 3 sample buildings in different localities; Pashan/Baner flood hints lower than Pimple Saudagar.
- Server: bad `auto` rating (6) is rejected by `validate()`; `data/properties.js` still loads in the dashboard; console clean.

## Limits to state up front
- Water, power, waterlogging experience, RERA and builder trust cannot be measured from maps. Auto flood is a terrain proxy, not an on-site check. Safety is a proxy. Ratings are suggestions for a shortlist, not a substitute for visits and resident checks.
- Google ToS limits caching and reuse of Places content; the plan stores derived numbers and short reasons only, not review text or photos.
