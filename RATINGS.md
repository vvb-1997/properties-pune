# Auto-ratings (suggestions)

Generated 2026-10-11 by `scripts/autorate.js` from free sources. These are **suggestions**: your own scores in the dashboard are untouched. Rule text for each criterion is under "Rules".

## Leela Heights (baner, rated 2026-10-11, google mode)

Google match for the building name: **Leela Heights by Vishal Properties**, Vinode Nagar Rd, Bhagwan Nagar, Bhumkar Nagar, Wakad, Pimpri-Chinchwad, Maharashtra 411033, India, 3.7 stars from 38 reviews. Check this is the right place. Info only: not used in any rating.

> schools/hospitals/mall/garden/safety: Google failed (Google HTTP 429: Quota exceeded for quota metric 'SearchNearbyRequest' and limit 'SearchNearbyRequest per day' of service 'places.googleapis.com' for consume), used free source

> schools/hospitals/mall/garden/safety: refresh failed (Google daily quota, Overpass 500), kept the ratings from 2026-10-11

| Criterion | Auto | Your score | Confidence | Why | Sources |
|---|---|---|---|---|---|
| Schools nearby | 5 | 5 | high | 20 named schools within 2 km, 20 within 3 km; nearest Colour Innovation Academy - Cambridge 0.0 km. Google avg 4.9 stars over 11 places with 20+ reviews (+1). | places |
| Hospitals nearby | 5 | 5 | high | 20 hospitals within 3 km, nearest OM Sai Medical 0.5 km; 0 clinics. Google avg 4.9 stars over 5 places with 20+ reviews (+1). | places |
| Malls / market / daily needs | 5 | 5 | high | nearest mall Akshobhya Villa 0.5 km; 7 supermarkets within 1 km, 20 within 3 km. Google avg 4.3 stars over 7 places with 20+ reviews. | places |
| Gardens / open space | 3 | 3 | high | 1 named parks within 1 km, nearest Hira group 1.0 km. Google avg 4.3 stars over 4 places with 20+ reviews. | places |
| Metro / transport access | 4 | 4 | high | metro Hinjawadi 1.7 km; no rail station within 5 km; 0 bus stops within 500 m (bus-stop mapping is patchy). | places, overpass |
| Commute to work | 4 | 3 | medium | est. 24 min peak (Office: Smartworks M-Agile, Baner 10.4 km, 24 min with traffic). | routes |
| No waterlogging in monsoon | 3 | 3 | low | locality flood risk medium; site 603 m, 12 m above lowest point within 1 km (90 m DEM, rough); stream 1136 m away. | localities, elevation, overpass |
| Safety / neighbourhood | 4 | 4 | low | 5 police stations within 2 km, nearest Pimpri Chinchwad Police Ayuktalay - Vahatuk Niyantran Kaksh Wakad 1.2 km. Says nothing about actual crime. | places |

**Not rateable from maps (rate by hand):**

- `water`: Tanker dependency and borewell/municipal supply cannot be seen on a map. Ask residents, check tanker bills. Locality hint: waterRisk high.
- `power`: Outage history and backup cannot be seen on a map. Ask residents and the society. Locality hint: powerRisk low.
- `rera`: Needs MahaRERA / OC / title check (TODO: RERA lookup needs research).
- `builder`: Needs builder delivery history (TODO: needs research).
- `amenities`: Society amenities are not in map data. Judge on the visit.
- `resale`: Compare price per sq ft with the locality band in the dashboard (vs market).

## Sources

- Google Places API (New): Nearby Search: https://developers.google.com/maps/documentation/places/web-service/nearby-search
- OpenStreetMap via Overpass API: https://overpass-api.de
- Google Routes API: Compute Route Matrix, traffic-aware, next weekday 08:30 IST: https://developers.google.com/maps/documentation/routes
- data/localities.js floodRisk (researched Oct 2026): data/localities.js
- Google Elevation API: https://developers.google.com/maps/documentation/elevation

## Rules

- **Schools nearby** (`schools`): Named schools within 2 km: 5 = 8+, 4 = 5-7, 3 = 3-4, 2 = 1-2 (or 1+ within 3 km), 1 = none within 3 km. Google mode: then +1 / -1 if the 3+ places with 20+ reviews average >=4.4 / <=3.8 stars (same for hospitals, malls, parks). Google returns at most 20 places per search.
- **Hospitals nearby** (`hospitals`): Hospitals (amenity=hospital): 5 = nearest <=1.5 km and 3+ within 3 km, 4 = nearest <=2.5 km and 2+, 3 = 1+ within 3 km, 2 = only clinics within 3 km, 1 = nothing.
- **Malls / market / daily needs** (`mall`): Nearest mall (shop=mall) and supermarkets within 1 km: 5 = mall <=2 km and 2+ supermarkets, 4 = mall <=3 km or 3+ supermarkets, 3 = 1+ supermarket within 1 km, 2 = a supermarket within 3 km, 1 = none.
- **Gardens / open space** (`garden`): Named parks/gardens within 1 km: 5 = 3+, 4 = 2, 3 = 1 (or nearest <=1.5 km), 2 = nearest <=3 km, 1 = none.
- **Metro / transport access** (`transport`): Metro station (OSM station=subway or "metro" in name), rail station within 5 km, bus stops within 500 m: 5 = metro <=1 km, 4 = metro <=2.5 km or 8+ bus stops, 3 = metro <=5 km or rail <=3 km or 3+ bus stops, 2 = 1+ bus stop, 1 = none.
- **Commute to work** (`commute`): Weighted drive time to the points in data/rating-config.js (Google traffic-aware 08:30 weekday; or OSRM free-flow times peakFactor): 5 = <=15 min, 4 = <=25, 3 = <=35, 2 = <=50, 1 = more.
- **No waterlogging in monsoon** (`flood`): Base from locality floodRisk (low 4, medium 3, high 2). +1 if the site is 15+ m above the lowest point within 1 km, -1 if 3 m or less. -1 if a river/stream/canal is within 300 m. Capped at 4: waterlogging needs on-site and resident checks.
- **Safety / neighbourhood** (`safety`): Proxy only, not crime data. Police stations within 2 km: 2+ = 4, 1 = 3, none = 2.

## Known limits

- OpenStreetMap coverage is uneven: unnamed or unmapped places are not counted, so counts skew low. No ratings or review scores in the free path.
- Elevation uses a 90 m grid. The flood value is a terrain proxy, not a waterlogging record; confirm with residents in monsoon.
- Commute uses free-flow OSRM times multiplied by an assumed peak factor.
