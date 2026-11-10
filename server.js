#!/usr/bin/env node
'use strict';
/*
 * Projekt-Hub server — zero dependencies.
 * Serves the web app from ./public and stores all data in one JSON file.
 *
 *   PORT          port to listen on            (default 3000)
 *   HOST          interface to bind            (default 0.0.0.0)
 *   DATA_FILE     path of the JSON database    (default ./data/db.json)
 *   HUB_PASSWORD  if set, HTTP Basic Auth is required (any user name, or HUB_USER)
 *   HUB_USER      optional user name for Basic Auth
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json'));
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), 'backups');
const COLLECTIONS = ['projekte', 'pendenzen', 'kontakte', 'kunden', 'wissen', 'wohnungen'];
const MAX_BODY = 20 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function normalize(db) {
  const out = { _rev: Number(db && db._rev) || 0, settings: (db && typeof db.settings === 'object' && db.settings) || {} };
  for (const c of COLLECTIONS) out[c] = Array.isArray(db && db[c]) ? db[c].filter(isRecord) : [];
  return out;
}
function isRecord(r) {
  return r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string' && r.id.length > 0 && r.id.length < 200;
}

function loadDb() {
  try {
    return normalize(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (e) {
    if (e.code === 'ENOENT') return normalize({});
    // Never overwrite a file we could not read.
    console.error(`Kann ${DATA_FILE} nicht lesen: ${e.message}`);
    process.exit(1);
  }
}

function dailyBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `db-${day}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target);
}

let db = loadDb();
dailyBackup();

function persist() {
  db._rev += 1;
  dailyBackup();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  const pass = process.env.HUB_PASSWORD;
  if (!pass) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  const user = decoded.slice(0, i);
  const given = decoded.slice(i + 1);
  const eq = (a, b) => {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };
  return eq(given, pass) && (!process.env.HUB_USER || eq(user, process.env.HUB_USER));
}

async function handleApi(req, res, parts) {
  // parts: ['api', ...]
  if (parts[1] === 'db' && parts.length === 2) {
    if (req.method === 'GET') return send(res, 200, db);
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'Ungültige Daten' });
      const rev = db._rev;
      db = normalize(body);
      db._rev = rev;
      persist();
      return send(res, 200, { ok: true, _rev: db._rev });
    }
  }
  if (parts[1] === 'settings' && parts.length === 2 && req.method === 'PUT') {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'Ungültige Daten' });
    db.settings = body;
    persist();
    return send(res, 200, { ok: true, _rev: db._rev });
  }
  if (parts.length === 3 && COLLECTIONS.includes(parts[1])) {
    const col = parts[1];
    const id = parts[2];
    if (req.method === 'PUT') {
      const rec = await readJson(req);
      if (!isRecord(rec) || rec.id !== id) return send(res, 400, { error: 'Ungültiger Eintrag' });
      rec.updatedAt = new Date().toISOString();
      const i = db[col].findIndex((r) => r.id === id);
      if (i >= 0) db[col][i] = rec; else db[col].push(rec);
      persist();
      return send(res, 200, { ok: true, record: rec, _rev: db._rev });
    }
    if (req.method === 'DELETE') {
      const before = db[col].length;
      db[col] = db[col].filter((r) => r.id !== id);
      if (db[col].length !== before) persist();
      return send(res, 200, { ok: true, _rev: db._rev });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Projekt-Hub", charset="UTF-8"' });
      return res.end('Anmeldung erforderlich');
    }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') return await handleApi(req, res, parts);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Serverfehler' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Projekt-Hub läuft auf http://localhost:${PORT}`);
  console.log(`Daten: ${DATA_FILE}${process.env.HUB_PASSWORD ? ' · Passwortschutz aktiv' : ''}`);
});
