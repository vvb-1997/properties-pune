// Rules that turn map facts into a suggested 1-5 rating. Every threshold is here so RATINGS.md can print it.
// Facts come from scripts/autorate.js (free path: OpenStreetMap Overpass, Open-Meteo elevation, OSRM). Suggestions only; never written to p.scores.
window.RATING_RULES = {
  names: {schools: 'Schools nearby', hospitals: 'Hospitals nearby', mall: 'Malls / market / daily needs', garden: 'Gardens / open space',
    transport: 'Metro / transport access', commute: 'Commute to work', flood: 'No waterlogging in monsoon', safety: 'Safety / neighbourhood'},
  // Criteria maps cannot rate. Shown in RATINGS.md with the reason.
  manual: {
    water: 'Tanker dependency and borewell/municipal supply cannot be seen on a map. Ask residents, check tanker bills.',
    power: 'Outage history and backup cannot be seen on a map. Ask residents and the society.',
    rera: 'Needs MahaRERA / OC / title check (TODO: RERA lookup needs research).',
    builder: 'Needs builder delivery history (TODO: needs research).',
    amenities: 'Society amenities are not in map data. Judge on the visit.',
    resale: 'Compare price per sq ft with the locality band in the dashboard (vs market).'
  },
  sources: {
    places: ['Google Places API (New): Nearby Search', 'https://developers.google.com/maps/documentation/places/web-service/nearby-search'],
    routes: ['Google Routes API: Compute Route Matrix, traffic-aware, next weekday 08:30 IST', 'https://developers.google.com/maps/documentation/routes'],
    elevation: ['Google Elevation API', 'https://developers.google.com/maps/documentation/elevation'],
    overpass: ['OpenStreetMap via Overpass API', 'https://overpass-api.de'],
    meteo: ['Open-Meteo Elevation API (90 m DEM)', 'https://open-meteo.com/en/docs/elevation-api'],
    osrm: ['OSRM public demo router (free-flow, no traffic)', 'https://router.project-osrm.org'],
    localities: ['data/localities.js floodRisk (researched Oct 2026)', 'data/localities.js']
  },
  // Google place ratings skew high (most places 4.0-4.5), so only a clear spread moves the count-based rating.
  qualityOn: {schools: 'schools', hospitals: 'hospitals', mall: 'malls', garden: 'parks'},
  quality: list => {
    const r = list.filter(x => x.d <= 3 && x.rating && x.n >= 20);
    if (r.length < 3) return {adj: 0, text: ''};
    const avg = r.reduce((a, x) => a + x.rating, 0) / r.length;
    return {adj: avg >= 4.4 ? 1 : avg <= 3.8 ? -1 : 0, text: ` Google avg ${avg.toFixed(1)} stars over ${r.length} places with 20+ reviews${avg >= 4.4 ? ' (+1)' : avg <= 3.8 ? ' (-1)' : ''}.`};
  },
  peakFactor: 1.5, // OSRM gives free-flow time; peak-hour Pune is assumed 1.5x slower. Assumption, not measured.
  rules: {
    schools: {
      text: 'Named schools within 2 km: 5 = 8+, 4 = 5-7, 3 = 3-4, 2 = 1-2 (or 1+ within 3 km), 1 = none within 3 km. Google mode: then +1 / -1 if the 3+ places with 20+ reviews average >=4.4 / <=3.8 stars (same for hospitals, malls, parks). Google returns at most 20 places per search.',
      rate: f => {
        const n = f.schools.filter(x => x.d <= 2).length, any3 = f.schools.length;
        const v = n >= 8 ? 5 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 1 || any3 >= 1 ? 2 : 1;
        return {v, why: `${n} named schools within 2 km, ${any3} within 3 km${f.schools[0] ? `; nearest ${f.schools[0].name} ${f.schools[0].d.toFixed(1)} km` : ''}.`};
      }
    },
    hospitals: {
      text: 'Hospitals (amenity=hospital): 5 = nearest <=1.5 km and 3+ within 3 km, 4 = nearest <=2.5 km and 2+, 3 = 1+ within 3 km, 2 = only clinics within 3 km, 1 = nothing.',
      rate: f => {
        const h = f.hospitals, d = h[0]?.d ?? 99;
        const v = d <= 1.5 && h.length >= 3 ? 5 : d <= 2.5 && h.length >= 2 ? 4 : h.length >= 1 ? 3 : f.clinics.length ? 2 : 1;
        return {v, why: `${h.length} hospitals within 3 km${h[0] ? `, nearest ${h[0].name} ${d.toFixed(1)} km` : ''}; ${f.clinics.length} clinics.`};
      }
    },
    mall: {
      text: 'Nearest mall (shop=mall) and supermarkets within 1 km: 5 = mall <=2 km and 2+ supermarkets, 4 = mall <=3 km or 3+ supermarkets, 3 = 1+ supermarket within 1 km, 2 = a supermarket within 3 km, 1 = none.',
      rate: f => {
        const dm = f.malls[0]?.d ?? 99, s1 = f.supermarkets.filter(x => x.d <= 1).length;
        const v = dm <= 2 && s1 >= 2 ? 5 : dm <= 3 || s1 >= 3 ? 4 : s1 >= 1 ? 3 : f.supermarkets.length ? 2 : 1;
        return {v, why: `${f.malls[0] ? `nearest mall ${f.malls[0].name} ${dm.toFixed(1)} km` : 'no mall within 3 km'}; ${s1} supermarkets within 1 km, ${f.supermarkets.length} within 3 km.`};
      }
    },
    garden: {
      text: 'Named parks/gardens within 1 km: 5 = 3+, 4 = 2, 3 = 1 (or nearest <=1.5 km), 2 = nearest <=3 km, 1 = none.',
      rate: f => {
        const n = f.parks.filter(x => x.d <= 1).length, d = f.parks[0]?.d ?? 99;
        const v = n >= 3 ? 5 : n === 2 ? 4 : n === 1 || d <= 1.5 ? 3 : d <= 3 ? 2 : 1;
        return {v, why: `${n} named parks within 1 km${f.parks[0] ? `, nearest ${f.parks[0].name} ${d.toFixed(1)} km` : ', none within 3 km'}.`};
      }
    },
    transport: {
      text: 'Metro station (OSM station=subway or "metro" in name), rail station within 5 km, bus stops within 500 m: 5 = metro <=1 km, 4 = metro <=2.5 km or 8+ bus stops, 3 = metro <=5 km or rail <=3 km or 3+ bus stops, 2 = 1+ bus stop, 1 = none.',
      rate: f => {
        const dm = f.metro[0]?.d ?? 99, dr = f.rail[0]?.d ?? 99, b = f.busStops;
        const v = dm <= 1 ? 5 : dm <= 2.5 || b >= 8 ? 4 : dm <= 5 || dr <= 3 || b >= 3 ? 3 : b >= 1 ? 2 : 1;
        return {v, why: `${f.metro[0] ? `metro ${f.metro[0].name} ${dm.toFixed(1)} km` : 'no metro within 5 km'}; ${f.rail[0] ? `rail ${f.rail[0].name} ${dr.toFixed(1)} km` : 'no rail station within 5 km'}; ${b} bus stops within 500 m (bus-stop mapping is patchy).`};
      }
    },
    commute: {
      text: 'Weighted drive time to the points in data/rating-config.js (Google traffic-aware 08:30 weekday; or OSRM free-flow times peakFactor): 5 = <=15 min, 4 = <=25, 3 = <=35, 2 = <=50, 1 = more.',
      rate: (f, R) => {
        if (!f.routes.length) return null;
        const wsum = f.routes.reduce((a, r) => a + r.weight, 0);
        const min = f.routes.reduce((a, r) => a + r.sec * r.weight * (r.traffic ? 1 : R.peakFactor), 0) / wsum / 60;
        const v = min <= 15 ? 5 : min <= 25 ? 4 : min <= 35 ? 3 : min <= 50 ? 2 : 1;
        return {v, why: `est. ${Math.round(min)} min peak (${f.routes.map(r => `${r.name} ${(r.m / 1000).toFixed(1)} km, ${Math.round(r.sec / 60)} min ${r.traffic ? 'with traffic' : 'free-flow'}`).join('; ')}${f.routes.some(r => !r.traffic) ? `; free-flow times x${R.peakFactor} peak assumption` : ''}).`};
      }
    },
    flood: {
      text: 'Base from locality floodRisk (low 4, medium 3, high 2). +1 if the site is 15+ m above the lowest point within 1 km, -1 if 3 m or less. -1 if a river/stream/canal is within 300 m. Capped at 4: waterlogging needs on-site and resident checks.',
      rate: f => {
        const base = {low: 4, medium: 3, high: 2}[f.localityRisk] ?? 3;
        const rel = f.elev.own - f.elev.min, adj = (rel >= 15 ? 1 : rel <= 3 ? -1 : 0) + (f.waterway && f.waterway.d <= 0.3 ? -1 : 0);
        const v = Math.max(1, Math.min(4, base + adj));
        return {v, why: `locality flood risk ${f.localityRisk || 'unknown'}; site ${Math.round(f.elev.own)} m, ${Math.round(rel)} m above lowest point within 1 km (90 m DEM, rough); ${f.waterway ? `${f.waterway.name || 'waterway'} ${Math.round(f.waterway.d * 1000)} m away` : 'no mapped river/stream within 1.5 km'}.`};
      }
    },
    safety: {
      text: 'Proxy only, not crime data. Police stations within 2 km: 2+ = 4, 1 = 3, none = 2.',
      rate: f => {
        const n = f.police.filter(x => x.d <= 2).length;
        return {v: n >= 2 ? 4 : n === 1 ? 3 : 2, why: `${n} police stations within 2 km${f.police[0] ? `, nearest ${f.police[0].name} ${f.police[0].d.toFixed(1)} km` : ''}. Says nothing about actual crime.`};
      }
    }
  },
  // Which source ids back each criterion (printed in RATINGS.md).
  srcs: {schools: ['overpass'], hospitals: ['overpass'], mall: ['overpass'], garden: ['overpass'], transport: ['overpass'],
    commute: ['osrm'], flood: ['localities', 'meteo', 'overpass'], safety: ['overpass']}
};
