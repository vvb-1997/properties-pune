# Auto-rating sources and rules

`node scripts/autorate.js <buildingId|--all> [--refresh] [--free]` computes a suggested 1-5 rating per criterion and stores it as `p.auto` in `data/properties.js`. It never writes `p.scores`. Your own scores stay as they are. `RATINGS.md` (regenerated on each run) shows, per building, each suggestion with its reason, confidence and sources.

The thresholds live in one file, `data/rating-rules.js`. `RATINGS.md` prints them from that file, so it is the exact rule set in use. The table below is a copy for reading and can lag behind the code.

## Sources

| Source | Gives | Cost | Used for |
|---|---|---|---|
| Google Places API (New), Nearby Search | Named places with rating and review count | Paid above a free monthly allowance | schools, hospitals, malls, parks, police, bus stops |
| Google Routes API, Compute Route Matrix | Traffic-aware drive time (next weekday 08:30 IST) | Paid above a free monthly allowance | commute |
| Google Elevation API | Ground height at 17 points around the site | Paid above a free monthly allowance | flood hint |
| Google Places Text Search | Google's listing for the building name | Paid above a free monthly allowance | information only, never used in a rating |
| OpenStreetMap via Overpass API | Places, metro and rail stations, rivers and streams | Free, public servers | all criteria when Google is off or fails; metro and rail always |
| Open-Meteo Elevation API | 90 m terrain height | Free | flood hint (free path) |
| OSRM public demo router | Free-flow drive time, no traffic | Free | commute (free path) |
| `data/localities.js` | `floodRisk` per locality (researched Oct 2026) | None | starting point for the flood rating |

One Google API key (`GOOGLE_API_KEY` in `.env`) covers Places, Routes and Elevation. A key set in the shell overrides `.env`. Without a key, or with `--free`, only the free sources run.

## Spend guard

- One run is capped at 80 billable units (`AUTORATE_RUN_CAP` overrides).
- Monthly caps in `scripts/autorate.js` sit below Google's free allowances: Nearby Enterprise 800, Nearby Pro 4,000, Text Search 800, Routes matrix 4,000 elements, Elevation 4,000 points.
- Usage is counted before each call and stored in `data/rating-usage.json`. At a cap, that group falls back to the free source and the note says so.
- Set a budget alert in Google Cloud Billing as well. The script's counter is local and only knows about this script.
- A building rated by Google in the last 30 days is skipped unless you pass `--refresh`.

## Google terms

Google limits caching and reuse of Places content. So Google results are not cached: only the derived numbers and the short reason text are stored in `p.auto`, never review text or photos. Free-source results (Overpass, Open-Meteo, OSRM) are cached for 30 days in `data/rating-cache.json`. The Google ratings are used only to nudge counts (see Quality adjustment). Check the current Google Maps Platform terms before sharing this data outside your own use.

## Privacy

Coordinates of each rated building are sent to Google (if a key is set), Overpass, Open-Meteo and OSRM. The building name goes to Google Text Search. Nothing else is sent.

## Rules (copy of `data/rating-rules.js`)

| Criterion | Rule |
|---|---|
| Schools | Named schools within 2 km: 5 = 8 or more, 4 = 5-7, 3 = 3-4, 2 = 1-2 (or any within 3 km), 1 = none within 3 km. |
| Hospitals | 5 = nearest within 1.5 km and 3+ within 3 km, 4 = nearest within 2.5 km and 2+, 3 = 1+ within 3 km, 2 = only clinics, 1 = nothing. |
| Malls / daily needs | 5 = mall within 2 km and 2+ supermarkets within 1 km, 4 = mall within 3 km or 3+ supermarkets within 1 km, 3 = 1+ supermarket within 1 km, 2 = a supermarket within 3 km, 1 = none. |
| Gardens | Named parks within 1 km: 5 = 3+, 4 = 2, 3 = 1 (or nearest within 1.5 km), 2 = nearest within 3 km, 1 = none. |
| Transport | 5 = metro within 1 km, 4 = metro within 2.5 km or 8+ bus stops within 500 m, 3 = metro within 5 km or rail within 3 km or 3+ bus stops, 2 = 1+ bus stop, 1 = none. |
| Commute | Weighted drive time to the points in `data/rating-config.js`: 5 = 15 min or less, 4 = 25, 3 = 35, 2 = 50, 1 = more. Free-flow times (OSRM) are multiplied by 1.5 as a peak-hour assumption. |
| Flood | Start from locality `floodRisk` (low 4, medium 3, high 2). +1 if the site is 15 m or more above the lowest point within 1 km, -1 if 3 m or less. -1 if a river, stream or canal is within 300 m. Capped at 4. |
| Safety | Police stations within 2 km: 2+ = 4, 1 = 3, none = 2. |

### Quality adjustment (Google mode only)

For schools, hospitals, malls and parks: among places within 3 km with at least 20 reviews, if there are 3 or more and their average rating is 4.4 or higher, add 1. If it is 3.8 or lower, subtract 1.

### Confidence

- low: approximate coordinates (locality centre), flood and safety (proxies).
- high: Google counts.
- medium: OSM counts; commute with Google traffic.
- low: commute from OSRM.

## Not rated automatically

`water`, `power`, `rera`, `builder`, `amenities`, `resale`. Maps cannot show them. `RATINGS.md` lists each with the reason and, for water and power, the locality risk as a hint.

## Known biases and limits

- Google place ratings skew high (most places 4.0-4.5), and places with many reviews are not always better. The quality adjustment only fires on a clear spread.
- Google returns at most 20 places per search, so counts cap at 20.
- Google's station types return no Pune metro or rail stations, only bus stops. Metro and rail come from OSM.
- OSM coverage is uneven. Unnamed or unmapped places are not counted, and bus-stop mapping is patchy.
- Flood is a terrain proxy. The 90 m terrain model cannot see a local low spot or a blocked drain. Cap of 4 reflects that.
- Safety is a police-station count, not crime data.
- Peak drive time from OSRM is an assumption (free-flow x 1.5), not a measurement.
- The Overpass public servers fail now and then (HTTP 429, 500). The script retries; a failed group shows as "unavailable" in the notes. Rerun later.
- The coordinates decide everything. A building with the wrong pin or locality gets ratings for the wrong place. Check the Google name match in `RATINGS.md`.
- These are suggestions for a shortlist. They do not replace a visit or asking residents.
