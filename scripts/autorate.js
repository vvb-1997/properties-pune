// Suggested ratings. Usage: node scripts/autorate.js <buildingId|--all> [--refresh] [--free]
// Uses Google (Places, Routes, Elevation) when GOOGLE_API_KEY is in .env or the environment, else free sources (OSM, Open-Meteo, OSRM).
// Google results are NOT cached (Google terms); a building rated by Google in the last 30 days is skipped unless --refresh.
// Writes p.auto into data/properties.js (p.scores is never touched) and regenerates RATINGS.md.
// server.js keeps the newer p.auto when a stale browser copy is saved, so the CLI can run while the server is up.
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data');
// Minimal .env loader; a variable already set in the shell wins.
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}
const KEY = process.env.GOOGLE_API_KEY;
const PROPS = path.join(DATA, 'properties.js'), USAGE = path.join(DATA, 'rating-usage.json'), CACHE = path.join(DATA, 'rating-cache.json');
const TTL = 30 * 864e5;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const HEADER = `// Properties saved by server.js from the dashboard (also mirrored in the browser's localStorage).
// Samples have sample:true; delete them in the dashboard. Do not hand-edit while the server runs.
`;

const evalWindow = file => { const w = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), {window: w}); return w; };
const {RATING_RULES: R} = evalWindow(path.join(DATA, 'rating-rules.js'));
const {RATING_CONFIG: CFG} = evalWindow(path.join(DATA, 'rating-config.js'));
const LOCS = evalWindow(path.join(DATA, 'localities.js')).LOCALITIES;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function haversine(a, b, c, d) {
  const rad = Math.PI / 180, dLat = (c - a) * rad, dLng = (d - b) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
let calls = 0, refresh = false;
async function cached(key, fn) {
  const hit = cache[key];
  if (!refresh && hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await fn();
  cache[key] = {t: Date.now(), v};
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return v;
}

async function overpass(q) {
  let err;
  for (const url of [...OVERPASS, ...OVERPASS]) { // two rounds: the public instances fail transiently
    try {
      calls++;
      const r = await fetch(url, {method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: {'User-Agent': 'pune-home-hunt-autorate/1.0 (personal use)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'}});
      if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
      await sleep(2000); // stay under the public instance rate limit between queries
      return (await r.json()).elements;
    } catch (e) { err = e; await sleep(/429|504/.test(e.message) ? 15000 : 1500); }
  }
  throw err;
}

// Named places, nearest per kind|name, sorted by distance. `pick` returns a kind string or null.
function places(els, lat, lng, pick, needName = true) {
  const best = {};
  for (const el of els) {
    const t = el.tags || {}, la = el.lat ?? el.center?.lat, lo = el.lon ?? el.center?.lon, k = pick(t);
    if (!k || la == null || (needName && !t.name)) continue;
    const id = k + '|' + (t.name || el.id).toString().toLowerCase(), d = haversine(lat, lng, la, lo);
    if (!best[id] || d < best[id].d) best[id] = {k, name: t.name || '(unnamed)', d};
  }
  return Object.values(best).sort((a, b) => a.d - b.d);
}

const poi = (lat, lng) => cached(`osm-poi|${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
  const a = `(around:3000,${lat},${lng})`;
  const els = await overpass(`[out:json][timeout:40];(nwr["amenity"~"^(school|hospital|clinic|police)$"]${a};nwr["shop"~"^(mall|supermarket)$"]${a};nwr["leisure"~"^(park|garden)$"]${a};);out center 1500;`);
  return places(els, lat, lng, t => t.amenity === 'school' ? 'schools' : t.amenity === 'hospital' ? 'hospitals' : t.amenity === 'clinic' ? 'clinics' :
    t.amenity === 'police' ? 'police' : t.shop === 'mall' ? 'malls' : t.shop === 'supermarket' ? 'supermarkets' : /^(park|garden)$/.test(t.leisure) ? 'parks' : null);
});

const transit = (lat, lng) => cached(`osm-transit|${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
  const els = await overpass(`[out:json][timeout:40];(nwr["railway"~"^(station|halt)$"](around:5000,${lat},${lng});nwr["station"="subway"](around:5000,${lat},${lng});node["highway"="bus_stop"](around:500,${lat},${lng}););out center 600;`);
  const stops = places(els, lat, lng, t => t.highway === 'bus_stop' ? 'bus' : (t.station === 'subway' || /metro/i.test([t.name, t.network, t.operator].join(' '))) ? 'metro' : /^(station|halt)$/.test(t.railway) ? 'rail' : null, false);
  return {metro: stops.filter(x => x.k === 'metro'), rail: stops.filter(x => x.k === 'rail'), busStops: stops.filter(x => x.k === 'bus').length};
});

const waterway = (lat, lng) => cached(`osm-water|${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
  const els = await overpass(`[out:json][timeout:40];way["waterway"~"^(river|stream|canal)$"](around:1500,${lat},${lng});out geom;`);
  let best = null;
  for (const el of els) for (const g of el.geometry || []) {
    const d = haversine(lat, lng, g.lat, g.lon);
    if (!best || d < best.d) best = {d, name: el.tags?.name || el.tags?.waterway};
  }
  return best;
});

function ringPoints(lat, lng) { // site + 8 points at 500 m + 8 at 1 km
  const pts = [[lat, lng]], kLng = 111320 * Math.cos(lat * Math.PI / 180);
  for (const m of [500, 1000]) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4; pts.push([lat + m * Math.sin(a) / 111320, lng + m * Math.cos(a) / kLng]);
  }
  return pts;
}
const elevation = (lat, lng) => cached(`elev|${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
  const pts = ringPoints(lat, lng);
  calls++;
  const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[0].toFixed(5))}&longitude=${pts.map(p => p[1].toFixed(5))}`);
  if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
  const e = (await r.json()).elevation;
  return {own: e[0], min: Math.min(...e), max: Math.max(...e)};
});

const route = (lat, lng, to) => cached(`osrm|${lat.toFixed(4)},${lng.toFixed(4)}|${to.lat},${to.lng}`, async () => {
  calls++;
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${to.lng},${to.lat}?overview=false`);
  if (!r.ok) throw new Error('OSRM HTTP ' + r.status);
  const j = (await r.json()).routes?.[0];
  if (!j) throw new Error('OSRM: no route');
  return {sec: j.duration, m: j.distance};
});


/* ---------- Google adapter + spend guard ---------- */
// Monthly caps sit below Google's free monthly usage (Nearby Enterprise 1,000; Nearby Pro 5,000; Text Search Enterprise 1,000; Routes matrix Pro 5,000 elements; Elevation 5,000). RUN_CAP limits one run.
const CAPS = {nearbyEnt: 800, nearbyPro: 4000, text: 800, matrix: 4000, elevation: 4000};
const RUN_CAP = +process.env.AUTORATE_RUN_CAP || 80;
let runSpent = 0;
const month = new Date().toISOString().slice(0, 7);
let usage = {month, counts: {}}; try { const u = JSON.parse(fs.readFileSync(USAGE, 'utf8')); if (u.month === month) usage = u; } catch {}
function spend(sku, n = 1) { // counted before the call so a failed call still counts
  if (runSpent + n > RUN_CAP) throw new Error(`run cap ${RUN_CAP} reached`);
  if ((usage.counts[sku] || 0) + n > CAPS[sku]) throw new Error(`monthly cap for ${sku} reached (${CAPS[sku]})`);
  usage.counts[sku] = (usage.counts[sku] || 0) + n; runSpent += n;
  fs.writeFileSync(USAGE, JSON.stringify(usage, null, 1));
}
async function gfetch(url, {body, mask} = {}) {
  calls++;
  const r = await fetch(url, body ? {method: 'POST', headers: {'X-Goog-Api-Key': KEY, 'Content-Type': 'application/json', 'X-Goog-FieldMask': mask}, body: JSON.stringify(body)} : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google HTTP ${r.status}: ${String(j.error?.message || '').replace(KEY, '***').slice(0, 140)}`);
  return j;
}
const circle = (lat, lng, radius) => ({circle: {center: {latitude: lat, longitude: lng}, radius}});
async function gNearby(lat, lng, types, radius, rated) {
  spend(rated ? 'nearbyEnt' : 'nearbyPro');
  const j = await gfetch('https://places.googleapis.com/v1/places:searchNearby', {
    mask: rated ? 'places.displayName,places.location,places.rating,places.userRatingCount' : 'places.displayName,places.location,places.primaryType',
    body: {includedTypes: types, maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: circle(lat, lng, radius)}});
  return (j.places || []).map(x => ({name: x.displayName?.text || '(unnamed)', d: haversine(lat, lng, x.location.latitude, x.location.longitude),
    rating: x.rating, n: x.userRatingCount, type: x.primaryType})).sort((a, b) => a.d - b.d);
}
async function gPoi(lat, lng) {
  const g = (types, rated = false) => gNearby(lat, lng, types, 3000, rated);
  const [schools, hospitals, malls, parks, supermarkets, police] = [await g(['school'], true), await g(['hospital'], true), await g(['shopping_mall'], true),
    await g(['park'], true), await g(['supermarket']), await g(['police'])];
  return {schools, hospitals, clinics: [], malls, parks, supermarkets, police};
}
async function gTransit(lat, lng) {
  const st = await gNearby(lat, lng, ['subway_station', 'light_rail_station', 'train_station'], 5000, false);
  const isMetro = x => /subway|light_rail/.test(x.type || '') || /metro/i.test(x.name);
  return {metro: st.filter(isMetro), rail: st.filter(x => !isMetro(x)), busStops: (await gNearby(lat, lng, ['bus_stop'], 500, false)).length};
}
async function gElevation(lat, lng) {
  const pts = ringPoints(lat, lng);
  spend('elevation', pts.length);
  const j = await gfetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${pts.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join('|')}&key=${KEY}`);
  if (j.status !== 'OK') throw new Error('Google Elevation ' + j.status);
  const e = j.results.map(x => x.elevation);
  return {own: e[0], min: Math.min(...e), max: Math.max(...e)};
}
// Next weekday 08:30 IST (03:00 UTC) so Google returns traffic-aware peak times.
function nextPeak() {
  const d = new Date(); d.setUTCHours(3, 0, 0, 0);
  do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(new Date(d.getTime() + 19800000).getUTCDay()));
  return d.toISOString();
}
async function gRoutes(lat, lng) {
  spend('matrix', CFG.commute.length);
  const wp = (la, lo) => ({waypoint: {location: {latLng: {latitude: la, longitude: lo}}}});
  const j = await gfetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    mask: 'originIndex,destinationIndex,duration,distanceMeters,condition',
    body: {origins: [wp(lat, lng)], destinations: CFG.commute.map(c => wp(c.lat, c.lng)), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', departureTime: nextPeak()}});
  return CFG.commute.map((c, i) => {
    const e = j.find(x => x.destinationIndex === i);
    if (!e || e.condition !== 'ROUTE_EXISTS') throw new Error('Google Routes: no route to ' + c.name);
    return {name: c.name, weight: c.weight, sec: parseFloat(e.duration), m: e.distanceMeters, traffic: true};
  });
}
// Best match for the building name near its pin. Info only: it can match the wrong place, so the address is shown.
async function gSociety(p, lat, lng) {
  spend('text');
  const j = await gfetch('https://places.googleapis.com/v1/places:searchText', {
    mask: 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    body: {textQuery: `${p.name} ${p.locality} Pune`, maxResultCount: 1, locationBias: circle(lat, lng, 500)}});
  const x = j.places?.[0];
  return x ? {name: x.displayName?.text, address: x.formattedAddress, rating: x.rating ?? null, n: x.userRatingCount ?? null} : null;
}

async function rateBuilding(p, freeOnly) {
  const loc = LOCS.find(l => l.key === p.locality), approx = p.lat == null || p.lng == null;
  const lat = approx ? loc?.lat : p.lat, lng = approx ? loc?.lng : p.lng;
  if (lat == null) throw new Error('no coordinates and unknown locality');
  const useG = !!KEY && !freeOnly;
  const out = {}, errs = {}, used = {}, notes = [];
  const f = {localityRisk: loc?.floodRisk, routes: []};
  // Try Google first; on any failure note it and fall back to the free source for that group.
  const run = async (names, groups) => {
    for (const [src, fn] of groups) {
      if (src === 'google' && !useG) continue;
      try { await fn(); for (const n of names) used[n] = src; return; }
      catch (e) { if (src === 'google') notes.push(`${names.join('/')}: Google failed (${e.message}), used free source`); else for (const n of names) errs[n] = e.message; }
    }
  };
  await run(['schools', 'hospitals', 'mall', 'garden', 'safety'], [
    ['google', async () => Object.assign(f, await gPoi(lat, lng))],
    ['free', async () => {
      const all = await poi(lat, lng), of = k => all.filter(x => x.k === k);
      Object.assign(f, {schools: of('schools'), hospitals: of('hospitals'), clinics: of('clinics'), police: of('police'), malls: of('malls'), supermarkets: of('supermarkets'), parks: of('parks')});
    }]]);
  await run(['transport'], [['google', async () => { // Google has bus stops but no Pune metro/rail stations in its station types, so take those from OSM when Google finds none
      const g = await gTransit(lat, lng);
      Object.assign(f, g.metro.length || g.rail.length ? g : {...await transit(lat, lng), busStops: g.busStops});
    }], ['free', async () => Object.assign(f, await transit(lat, lng))]]);
  await run(['flood'], [['google', async () => { f.elev = await gElevation(lat, lng); }], ['free', async () => { f.elev = await elevation(lat, lng); }]]);
  if (used.flood) { try { f.waterway = await waterway(lat, lng); } catch (e) { notes.push('flood: river distance unavailable (' + e.message + ')'); f.waterway = null; } }
  await run(['commute'], [['google', async () => { f.routes = await gRoutes(lat, lng); }],
    ['free', async () => { for (const to of CFG.commute) f.routes.push({name: to.name, weight: to.weight, ...await route(lat, lng, to)}); }]]);
  for (const [k, rule] of Object.entries(R.rules)) {
    if (errs[k] || !used[k]) { errs[k] ||= 'no source worked'; continue; }
    let res; try { res = rule.rate(f, R); } catch { errs[k] = 'facts missing'; continue; }
    if (!res) { errs[k] = 'no commute targets in data/rating-config.js'; continue; }
    const g = used[k] === 'google';
    const list = f[R.qualityOn[k]];
    if (g && list) { const q = R.quality(list); res = {v: Math.max(1, Math.min(5, res.v + q.adj)), why: res.why + q.text}; }
    // Confidence: terrain/proxy criteria stay low; Google counts are high; free OSM is uneven so at most medium. Approximate pins are low.
    const conf = approx || ['flood', 'safety'].includes(k) ? 'low' : k === 'commute' ? (g ? 'medium' : 'low') : g ? 'high' : 'medium';
    const srcs = {schools: ['places'], hospitals: ['places'], mall: ['places'], garden: ['places'], safety: ['places'], transport: ['places', 'overpass'], commute: ['routes'],
      flood: ['localities', 'elevation', 'overpass']}[k].map(x => g ? x : ({places: 'overpass', routes: 'osrm', elevation: 'meteo'}[x] || x));
    out[k] = {v: res.v, conf, why: res.why, srcs: g ? srcs : (k === 'flood' ? ['localities', 'meteo', 'overpass'] : srcs)};
  }
  let society = null;
  if (useG && !approx) try { society = await gSociety(p, lat, lng); } catch (e) { notes.push('society lookup failed: ' + e.message); }
  const n = Object.values(used), mode = !n.length || !n.includes('google') ? 'free' : n.every(x => x === 'google') ? 'google' : 'mixed';
  return {asOf: new Date().toISOString().slice(0, 10), mode, approx, ratings: out, errors: errs, notes, society};
}

function writeProps(arr) {
  const tmp = PROPS + '.tmp';
  fs.writeFileSync(tmp, HEADER + 'window.SAMPLE_PROPERTIES = [\n' + arr.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n];\n');
  fs.renameSync(tmp, PROPS);
}

function markdown(props) {
  const L = ['# Auto-ratings (suggestions)', '', `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/autorate.js\` from free sources. These are **suggestions**: your own scores in the dashboard are untouched. Rule text for each criterion is under "Rules".`, ''];
  const used = new Set();
  for (const p of props.filter(x => x.auto)) {
    const a = p.auto;
    L.push(`## ${p.name} (${p.locality}, rated ${a.asOf}, ${a.mode} mode)`, '');
    if (a.society) L.push(`Google match for the building name: **${a.society.name}**, ${a.society.address}, ${a.society.rating ?? 'no'} stars from ${a.society.n ?? 0} reviews. Check this is the right place. Info only: not used in any rating.`, '');
    for (const n of a.notes || []) L.push(`> ${n}`, '');
    if (a.approx) L.push('> No lat/lng on this building: used the locality centre, so all confidence is low.', '');
    L.push('| Criterion | Auto | Your score | Confidence | Why | Sources |', '|---|---|---|---|---|---|');
    const diffs = [];
    for (const k of Object.keys(R.names)) {
      const r = a.ratings[k], mine = p.scores?.[k];
      if (!r) { L.push(`| ${R.names[k]} | - | ${mine ?? '-'} | - | not rated: ${a.errors?.[k] || 'no data'} | - |`); continue; }
      r.srcs.forEach(s => used.add(s));
      if (mine && Math.abs(mine - r.v) >= 2) diffs.push(`${R.names[k]}: yours ${mine}, auto ${r.v}`);
      L.push(`| ${R.names[k]} | ${r.v} | ${mine ?? '-'} | ${r.conf} | ${r.why} | ${r.srcs.join(', ')} |`);
    }
    L.push('');
    if (diffs.length) L.push('**Differs by 2+ from your score:** ' + diffs.join('; '), '');
    const loc = LOCS.find(l => l.key === p.locality);
    L.push('**Not rateable from maps (rate by hand):**', '', ...Object.entries(R.manual).map(([k, why]) => `- \`${k}\`: ${why}${k === 'water' && loc ? ` Locality hint: waterRisk ${loc.waterRisk}.` : k === 'power' && loc ? ` Locality hint: powerRisk ${loc.powerRisk}.` : ''}`), '');
  }
  L.push('## Sources', '', ...[...used].map(s => `- ${R.sources[s][0]}: ${R.sources[s][1]}`), '', '## Rules', '', ...Object.entries(R.rules).map(([k, r]) => `- **${R.names[k]}** (\`${k}\`): ${r.text}`), '',
    '## Known limits', '', '- OpenStreetMap coverage is uneven: unnamed or unmapped places are not counted, so counts skew low. No ratings or review scores in the free path.',
    '- Elevation uses a 90 m grid. The flood value is a terrain proxy, not a waterlogging record; confirm with residents in monsoon.',
    '- Commute uses free-flow OSRM times multiplied by an assumed peak factor.', '');
  fs.writeFileSync(path.join(ROOT, 'RATINGS.md'), L.join('\n'));
}

(async () => {
  const args = process.argv.slice(2);
  refresh = args.includes('--refresh');
  const freeOnly = args.includes('--free');
  const toStdout = args.includes('--stdout'); // used by server.js: print the result, write no files
  let skipped = false;
  console.log(KEY && !freeOnly ? 'Mode: Google (with free fallback)' : 'Mode: free sources only' + (KEY ? ' (--free)' : ' (no GOOGLE_API_KEY)'));
  const target = args.find(a => !a.startsWith('--'));
  if (!target && !args.includes('--all')) { console.error('usage: node scripts/autorate.js <buildingId|--all> [--refresh]'); process.exit(1); }
  const props = evalWindow(PROPS).SAMPLE_PROPERTIES;
  const todo = target ? props.filter(p => p.id === target) : props.filter(p => !p.sample);
  if (!todo.length) { console.error('no matching building'); process.exit(1); }
  for (const p of todo) {
    if (!refresh && p.auto?.mode === 'google' && Date.now() - Date.parse(p.auto.asOf) < TTL) { console.log(`${p.name}: Google-rated ${p.auto.asOf}, skipped (use --refresh)`); skipped = true; continue; }
    try {
      const prev = p.auto, next = await rateBuilding(p, freeOnly);
      // A failed group must not wipe an earlier good rating: keep it and say so.
      for (const [k, r] of Object.entries(prev?.ratings || {})) if (!next.ratings[k]) { next.ratings[k] = r; next.notes.push(`${k}: refresh failed, kept the rating from ${prev.asOf}`); }
      p.auto = next;
      console.log(`${p.name}: ${Object.entries(p.auto.ratings).map(([k, r]) => `${k}=${r.v}`).join(' ')}${Object.keys(p.auto.errors).length ? ' | failed: ' + Object.keys(p.auto.errors).join(',') : ''}${p.auto.notes.map(n => '\n  note: ' + n).join('')}`);
    } catch (e) { console.error(`${p.name}: ${e.message}`); }
  }
  if (toStdout) { console.log('AUTO_JSON:' + JSON.stringify({auto: todo[0].auto, skipped, calls, spent: runSpent, month: usage.counts})); return; }
  writeProps(props);
  markdown(props);
  console.log(`network calls: ${calls}, Google units this run: ${runSpent}, this month: ${JSON.stringify(usage.counts)}. Wrote data/properties.js and RATINGS.md`);
})();
