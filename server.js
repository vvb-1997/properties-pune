// Zero-dependency server: serves the dashboard and mirrors saved properties into data/properties.js.
// Run: node server.js   (HOST=0.0.0.0 to reach it from a phone on the same Wi-Fi; no auth, so LAN only)
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const {execFile} = require('child_process');
const {pipeline} = require('stream/promises'), {Transform} = require('stream');

const ROOT = __dirname, DATA = path.join(ROOT, 'data'), PROPS = path.join(DATA, 'properties.js');
const PORT = +process.env.PORT || 8765, HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 1e6;
const FILES = path.join(ROOT, 'files'), FINDEX = path.join(FILES, 'index.json'), MAX_FILE = 25 * 1024 * 1024;
const FTYPES = {pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', csv: 'text/csv'};
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif']);
fs.mkdirSync(FILES, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain'};
const HEADER = `// Properties saved by server.js from the dashboard (also mirrored in the browser's localStorage).
// Samples have sample:true; delete them in the dashboard. Do not hand-edit while the server runs.
`;

const evalWindow = file => { const w = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), {window: w}); return w; };
const localityKeys = () => new Set(evalWindow(path.join(DATA, 'localities.js')).LOCALITIES.map(l => l.key));

function validate(arr) {
  if (!Array.isArray(arr)) return 'body must be an array';
  const keys = localityKeys(), ids = new Set(), uids = new Set();
  for (const [i, p] of arr.entries()) {
    const at = `item ${i}: `;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return at + 'must be an object';
    if (typeof p.id !== 'string' || !p.id) return at + 'id must be a non-empty string';
    if (ids.has(p.id)) return at + 'duplicate id';
    ids.add(p.id);
    if (typeof p.name !== 'string') return at + 'name must be a string';
    if (!keys.has(p.locality)) return at + 'unknown locality';
    if (p.lat != null && !Number.isFinite(p.lat)) return at + 'lat must be a number';
    if (p.lng != null && !Number.isFinite(p.lng)) return at + 'lng must be a number';
    if (p.scores != null) {
      if (typeof p.scores !== 'object' || Array.isArray(p.scores)) return at + 'scores must be an object';
      for (const v of Object.values(p.scores)) if (!Number.isInteger(v) || v < 0 || v > 5) return at + 'scores must be integers 0-5';
    }
    if (p.auto != null) {
      const r = p.auto.ratings;
      if (typeof p.auto !== 'object' || !r || typeof r !== 'object') return at + 'auto.ratings must be an object';
      for (const x of Object.values(r)) if (!x || !Number.isInteger(x.v) || x.v < 1 || x.v > 5) return at + 'auto ratings must be integers 1-5';
    }
    if (!Array.isArray(p.units) || !p.units.length) return at + 'units must be a non-empty array';
    for (const u of p.units) {
      if (!u || typeof u !== 'object' || typeof u.id !== 'string' || !u.id) return at + 'unit id must be a non-empty string';
      if (uids.has(u.id)) return at + 'duplicate unit id';
      uids.add(u.id);
      for (const k of ['bhk', 'price', 'carpet', 'sba', 'nego', 'inventory'])
        if (u[k] != null && !Number.isFinite(u[k])) return at + 'unit ' + k + ' must be a number';
    }
  }
}

// Serialised so concurrent PUTs cannot interleave; temp file + rename so a crash never leaves a half-written file.
let queue = Promise.resolve();
const writeProps = arr => queue = queue.then(async () => {
  const tmp = PROPS + '.tmp';
  await fs.promises.writeFile(tmp, HEADER + 'window.SAMPLE_PROPERTIES = [\n' + arr.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n];\n');
  await fs.promises.rename(tmp, PROPS);
});

// A browser copy that predates the last auto-rating has no p.auto (or an older one): keep the file's newer one.
const keepAuto = arr => {
  let old; try { old = new Map(evalWindow(PROPS).SAMPLE_PROPERTIES.map(p => [p.id, p.auto])); } catch { return; }
  for (const p of arr) { const o = old.get(p.id); if (o && !(Date.parse(p.auto?.asOf) >= Date.parse(o.asOf))) p.auto = o; }
};

// One auto-rating at a time: each run can spend Google quota. The script prints one AUTO_JSON line; nothing is written by it.
let rating = false;
const autorate = (id, refresh) => new Promise((resolve, reject) =>
  execFile(process.execPath, [path.join(ROOT, 'scripts', 'autorate.js'), id, '--stdout', ...refresh ? ['--refresh'] : []], {timeout: 5 * 60e3, maxBuffer: 5e6},
    (e, out, err) => {
      const line = out.split('\n').find(l => l.startsWith('AUTO_JSON:'));
      line ? resolve(JSON.parse(line.slice(10))) : reject(new Error((err || out || e?.message || 'failed').trim().split('\n').pop()));
    }));

// Read-modify-write of files/index.json, serialised on the same pattern as writeProps.
let fqueue = Promise.resolve();
const readIndex = () => { try { return JSON.parse(fs.readFileSync(FINDEX, 'utf8')); } catch { return []; } };
const updateIndex = fn => fqueue = fqueue.then(async () => {
  const out = fn(readIndex()), tmp = FINDEX + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(out.list, null, 1));
  await fs.promises.rename(tmp, FINDEX);
  return out.result;
});

// Header-byte check only, not a malware scan.
const hex = (b, h) => b.length >= h.length / 2 && b.subarray(0, h.length / 2).toString('hex') === h;
const OLE = 'd0cf11e0a1b11ae1', ZIP = '504b0304';
const SIGS = {pdf: b => hex(b, '25504446'), png: b => hex(b, '89504e47'), jpg: b => hex(b, 'ffd8ff'), gif: b => hex(b, '47494638'),
  webp: b => hex(b, '52494646') && b.toString('latin1', 8, 12) === 'WEBP',
  // shortcut: docx and xlsx are both zip, so a renamed docx<->xlsx passes; upgrade by reading [Content_Types].xml
  docx: b => hex(b, ZIP), xlsx: b => hex(b, ZIP), doc: b => hex(b, OLE), xls: b => hex(b, OLE),
  txt: b => !b.includes(0), csv: b => !b.includes(0)};
SIGS.jpeg = SIGS.jpg;
const sniff = (b, ext) => !!SIGS[ext]?.(b);

// buildingId: <=64 chars; unitIds: comma list (string or array), max 20, [] = shared by all offerings of the building.
function parseTag(b, u) {
  const buildingId = String(b || '');
  const unitIds = (Array.isArray(u) ? u : String(u || '').split(',')).map(x => String(x).trim()).filter(Boolean);
  if (buildingId.length > 64 || unitIds.length > 20 || unitIds.some(x => x.length > 64)) return {error: 'bad building/offering tag'};
  return {buildingId, unitIds};
}

async function upload(req, res) {
  let name; try { name = path.basename(decodeURIComponent(req.headers['x-filename'] || '')).replace(/[\x00-\x1f"\\]/g, '_'); } catch { return send(res, 400, {error: 'bad X-Filename'}); }
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!name || !FTYPES[ext]) return send(res, 400, {error: 'file type not allowed: ' + Object.keys(FTYPES).join(', ')});
  const id = crypto.randomBytes(8).toString('hex'), dest = path.join(FILES, id);
  let size = 0;
  const cap = new Transform({transform(c, _, cb) { size += c.length; cb(size > MAX_FILE ? Object.assign(new Error('too large'), {code: 'TOO_BIG'}) : null, c); }});
  try { await pipeline(req, cap, fs.createWriteStream(dest)); }
  catch (e) {
    await fs.promises.rm(dest, {force: true});
    if (e.code !== 'TOO_BIG') throw e;
    res.setHeader('Connection', 'close');
    return send(res, 413, {error: 'file over 25 MB'});
  }
  const head = Buffer.alloc(4096), fh = await fs.promises.open(dest, 'r');
  const {bytesRead} = await fh.read(head, 0, 4096, 0).finally(() => fh.close());
  if (!sniff(head.subarray(0, bytesRead), ext)) {
    await fs.promises.rm(dest, {force: true});
    return send(res, 400, {error: 'content does not match .' + ext});
  }
  const tag = parseTag(req.headers['x-building-id'], req.headers['x-unit-ids']);
  if (tag.error) { await fs.promises.rm(dest, {force: true}); return send(res, 400, {error: tag.error}); }
  const meta = {id, name, size, type: FTYPES[ext], propertyId: tag.buildingId, ...tag, uploaded: new Date().toISOString()};
  await updateIndex(list => ({list: [...list, meta]}));
  send(res, 200, meta);
}

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, {'Content-Type': type}); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/properties') {
      if (req.method === 'GET') return send(res, 200, evalWindow(PROPS).SAMPLE_PROPERTIES || []);
      if (req.method !== 'PUT') return send(res, 405, {error: 'GET or PUT only'});
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > MAX_BODY) return send(res, 413, {error: 'body too large'}); }
      let arr; try { arr = JSON.parse(body); } catch { return send(res, 400, {error: 'invalid JSON'}); }
      const err = validate(arr); if (err) return send(res, 400, {error: err});
      keepAuto(arr);
      await writeProps(arr);
      return send(res, 200, {saved: arr.length});
    }
    const aid = url.pathname.match(/^\/api\/autorate\/([\w-]{1,64})$/)?.[1];
    if (aid) {
      if (req.method !== 'POST') return send(res, 405, {error: 'POST only'});
      if (!evalWindow(PROPS).SAMPLE_PROPERTIES.some(p => p.id === aid)) return send(res, 404, {error: 'not found'});
      if (rating) return send(res, 409, {error: 'an auto-rating is already running'});
      rating = true;
      try {
        const r = await autorate(aid, url.searchParams.get('refresh') === '1');
        const arr = evalWindow(PROPS).SAMPLE_PROPERTIES, p = arr.find(x => x.id === aid);
        if (p && r.auto) { p.auto = r.auto; await writeProps(arr); }
        return send(res, 200, r);
      } finally { rating = false; }
    }
    if (url.pathname === '/api/files' && req.method === 'GET') return send(res, 200, readIndex());
    if (url.pathname === '/api/files' && req.method === 'POST') return await upload(req, res);
    const fid = url.pathname.match(/^\/(?:api\/files|files)\/([a-f0-9]{16})$/)?.[1];
    if (fid && req.method === 'DELETE' && url.pathname.startsWith('/api/')) {
      const gone = await updateIndex(list => ({list: list.filter(f => f.id !== fid), result: list.some(f => f.id === fid)}));
      if (!gone) return send(res, 404, {error: 'not found'});
      await fs.promises.rm(path.join(FILES, fid), {force: true});
      return send(res, 200, {deleted: fid});
    }
    if (fid && req.method === 'PATCH' && url.pathname.startsWith('/api/')) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > MAX_BODY) return send(res, 413, {error: 'body too large'}); }
      let j; try { j = JSON.parse(body); } catch { return send(res, 400, {error: 'invalid JSON'}); }
      const tag = parseTag(j?.buildingId, j?.unitIds); if (tag.error) return send(res, 400, {error: tag.error});
      const meta = await updateIndex(list => {
        const f = list.find(x => x.id === fid); if (!f) return {list};
        Object.assign(f, {propertyId: tag.buildingId, ...tag}); return {list, result: f};
      });
      return meta ? send(res, 200, meta) : send(res, 404, {error: 'not found'});
    }
    if (fid && req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const meta = readIndex().find(f => f.id === fid);
      if (!meta) return send(res, 404, {error: 'not found'});
      const ext = path.extname(meta.name).slice(1).toLowerCase(), safe = meta.name.replace(/[^\w. -]/g, '_');
      res.writeHead(200, {'Content-Type': meta.type, 'Content-Length': meta.size, 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${INLINE.has(ext) ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`});
      return fs.createReadStream(path.join(FILES, fid)).on('error', () => res.destroy()).pipe(res);
    }
    if (req.method !== 'GET') return send(res, 405, {error: 'method not allowed'});
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(ROOT, rel);
    // Only index.html and data/* are public; blocks ../ and server.js / .claude.
    if (rel !== 'index.html' && !file.startsWith(DATA + path.sep)) return send(res, 404, {error: 'not found'});
    fs.readFile(file, (e, buf) => e ? send(res, 404, {error: 'not found'}) : send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream'));
  } catch (e) { send(res, 500, {error: e.message}); }
}).listen(PORT, HOST, () => console.log(`http://${HOST}:${PORT}`));
