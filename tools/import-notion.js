#!/usr/bin/env node
'use strict';
/*
 * Notion → Projekt-Hub import.
 *
 * 1. In Notion: «JBAG Projekt-Hub» → ••• → Exportieren → «Markdown & CSV», Unterseiten einschliessen.
 * 2. ZIP entpacken (auch innere ZIPs).
 * 3. node tools/import-notion.js <entpackter-Ordner> [ausgabe.json]
 * 4. Im Hub: Einstellungen → «JSON importieren…» und die erzeugte Datei wählen
 *    (oder die Datei als data/db.json ablegen, bevor der Server startet).
 *
 * Spalten werden über die Feldnamen aus public/schema.js zugeordnet; Relationen über die Titel.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const [, , inDir, outFile = 'notion-import.json'] = process.argv;
if (!inDir) {
  console.error('Aufruf: node tools/import-notion.js <Notion-Export-Ordner> [ausgabe.json]');
  process.exit(1);
}

const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'schema.js'), 'utf8');
const { COLLECTIONS } = vm.runInNewContext(`${schemaSrc}\n;({ COLLECTIONS })`, { inverse: () => [] });

// --- CSV ---
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const out = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) out.push(row);
  const [head = [], ...body] = out;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.toLowerCase().endsWith('.csv') ? [p] : [];
  });
}

// --- value parsing ---
const MONTHS = { january: 1, februar: 2, february: 2, januar: 1, march: 3, märz: 3, maerz: 3, april: 4, may: 5, mai: 5, june: 6, juni: 6,
  july: 7, juli: 7, august: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12, dezember: 12 };
const pad = (n) => String(n).padStart(2, '0');
function parseDate(s) {
  if (!s) return '';
  s = s.split('→')[0].trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([A-Za-zäÄ]+)\s+(\d{1,2}),\s*(\d{4})/.exec(s); // November 6, 2026
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  m = /^(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/.exec(s); // 6. November 2026
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s); // 06.11.2026 / 11/06/2026 (assume day first)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}
function parseNumber(s) {
  if (!s) return null;
  let t = s.replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function splitRelation(s, titles) {
  if (!s) return [];
  const withUrls = [...s.matchAll(/(.+?)\s*\((https?:\/\/[^)]+)\)(?:,\s*|$)/g)].map((m) => m[1].trim());
  if (withUrls.length) return withUrls;
  if (titles.has(s)) return [s];
  const parts = s.split(/,\s*/);
  const out = [];
  let acc = '';
  for (const p of parts) {
    acc = acc ? `${acc}, ${p}` : p;
    if (titles.has(acc)) { out.push(acc); acc = ''; }
  }
  if (acc) out.push(...acc.split(/,\s*/));
  return out;
}

// --- find CSV per collection ---
const files = walk(inDir);
const pick = (label) => {
  const cands = files.filter((f) => path.basename(f).toLowerCase().startsWith(label.toLowerCase() + ' '));
  return cands.find((f) => f.endsWith('_all.csv')) || cands[0];
};

const db = { settings: {} };
const titleIndex = {};
const rawRows = {};
for (const [col, def] of Object.entries(COLLECTIONS)) {
  const file = pick(def.label);
  rawRows[col] = file ? parseCsv(fs.readFileSync(file, 'utf8')) : [];
  console.log(`${def.label.padEnd(10)} ${file ? `${rawRows[col].length} Zeilen  ← ${path.relative(inDir, file)}` : '— keine CSV gefunden'}`);
  const titleField = def.fields.find((f) => f.type === 'title');
  db[col] = rawRows[col].map((r) => ({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), [def.title]: r[titleField.label] || '' }));
  titleIndex[col] = new Map(db[col].map((r) => [r[def.title], r.id]));
}

const unknown = new Set();
for (const [col, def] of Object.entries(COLLECTIONS)) {
  rawRows[col].forEach((row, i) => {
    const rec = db[col][i];
    for (const f of def.fields) {
      if (f.type === 'title' || f.type === 'formula') continue;
      // inverse fields are computed – but Notion two-way relations may only be filled on this side
      const v = row[f.label];
      if (v == null || v === '') continue;
      switch (f.type) {
        case 'number': case 'chf': rec[f.key] = parseNumber(v); break;
        case 'date': rec[f.key] = parseDate(v); break;
        case 'multiselect': rec[f.key] = v.split(/,\s*/).filter(Boolean); break;
        case 'relation': {
          const titles = splitRelation(v, titleIndex[f.target]);
          rec[f.key] = titles.map((t) => titleIndex[f.target].get(t) || (unknown.add(`${f.label}: ${t}`), null)).filter(Boolean);
          if (!f.multi) rec[f.key] = rec[f.key].slice(0, 1);
          break;
        }
        case 'inverse': {
          // e.g. Kontakte.Projekte → add this contact to the project's "kontakte"
          const owner = COLLECTIONS[f.source].fields.find((x) => x.key === f.via);
          for (const t of splitRelation(v, titleIndex[f.source])) {
            const id = titleIndex[f.source].get(t);
            const target = id && db[f.source].find((x) => x.id === id);
            if (!target) { unknown.add(`${f.label}: ${t}`); continue; }
            const cur = Array.isArray(target[f.via]) ? target[f.via] : [];
            if (!cur.includes(rec.id)) target[f.via] = owner.multi ? [...cur, rec.id] : [rec.id];
          }
          break;
        }
        default: rec[f.key] = v;
      }
    }
  });
}

fs.writeFileSync(outFile, JSON.stringify(db, null, 1));
if (unknown.size) console.warn(`\n${unknown.size} Verknüpfungen nicht gefunden:\n  ${[...unknown].slice(0, 20).join('\n  ')}`);
console.log(`\nGeschrieben: ${path.resolve(outFile)}`);
