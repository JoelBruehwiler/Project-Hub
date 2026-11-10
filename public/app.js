'use strict';
/* Projekt-Hub — client app (vanilla JS, no build step). */

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const todayIso = () => new Date().toLocaleDateString('sv-SE');
const chfFmt = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('de-CH');
const fmtCHF = (v) => chfFmt.format(Number(v) || 0);
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d && m ? `${d}.${m}.${y}` : esc(iso); };
const daysUntil = (iso) => Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(todayIso())) / 864e5);
const NUMERIC = new Set(['number', 'chf']);
const LS_DB = 'projekt-hub.db';
const LS_PREFS = 'projekt-hub.prefs';

function lsGet(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

const prefs = Object.assign({ me: '', tab: 0 }, lsGet(LS_PREFS, {}));
const savePrefs = () => lsSet(LS_PREFS, prefs);

function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return 'https://' + s.replace(/^[a-z]+:/i, '');
}
function shortUrl(u) {
  try { const x = new URL(safeUrl(u)); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? '/…' : ''); } catch { return u; }
}

let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ---------- store ----------
function emptyDb() {
  const db = { _rev: 0, settings: {} };
  for (const c of COLLECTION_KEYS) db[c] = [];
  return db;
}
function normalizeDb(raw) {
  const db = emptyDb();
  if (raw && typeof raw === 'object') {
    db._rev = Number(raw._rev) || 0;
    db.settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    for (const c of COLLECTION_KEYS) if (Array.isArray(raw[c])) db[c] = raw[c].filter((r) => r && typeof r.id === 'string');
  }
  return db;
}

const Store = {
  mode: 'local',
  db: emptyDb(),
  async init() {
    try {
      const r = await fetch('api/db', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        this.db = normalizeDb(await r.json());
        this.mode = 'server';
        return;
      }
    } catch { /* no server: fall back to browser storage */ }
    this.db = normalizeDb(lsGet(LS_DB, null));
    this.mode = 'local';
  },
  persistLocal() {
    if (!lsSet(LS_DB, this.db)) toast('Speichern im Browser fehlgeschlagen', true);
  },
  async api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    const data = await r.json();
    if (data._rev) this.db._rev = data._rev;
    return data;
  },
  async put(col, rec) {
    const list = this.db[col];
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    if (this.mode === 'local') { rec.updatedAt = new Date().toISOString(); return this.persistLocal(); }
    try { await this.api('PUT', `api/${col}/${encodeURIComponent(rec.id)}`, rec); }
    catch (e) { toast('Nicht gespeichert: ' + e.message, true); }
  },
  async del(col, id) {
    this.db[col] = this.db[col].filter((r) => r.id !== id);
    if (this.mode === 'local') return this.persistLocal();
    try { await this.api('DELETE', `api/${col}/${encodeURIComponent(id)}`); }
    catch (e) { toast('Nicht gelöscht: ' + e.message, true); }
  },
  async putSettings(settings) {
    this.db.settings = settings;
    if (this.mode === 'local') return this.persistLocal();
    try { await this.api('PUT', 'api/settings', settings); } catch (e) { toast('Nicht gespeichert: ' + e.message, true); }
  },
  async replaceAll(raw) {
    const db = normalizeDb(raw);
    db._rev = this.db._rev;
    this.db = db;
    if (this.mode === 'local') return this.persistLocal();
    await this.api('PUT', 'api/db', db);
  },
  async refresh() {
    if (this.mode !== 'server') return false;
    try {
      const r = await fetch('api/db', { cache: 'no-store' });
      if (!r.ok) return false;
      const db = normalizeDb(await r.json());
      if (db._rev === this.db._rev) return false;
      this.db = db;
      return true;
    } catch { return false; }
  },
};

// ---------- data access ----------
const C = (col) => COLLECTIONS[col];
const F = (col, key) => C(col).fields.find((f) => f.key === key);
const rows = (col) => Store.db[col] || [];
const byId = (col, id) => rows(col).find((r) => r.id === id);
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
function inverse(source, via, id) { return rows(source).filter((r) => asArray(r[via]).includes(id)); }
const titleOf = (col, r) => (r && String(r[C(col).title] || '').trim()) || 'Ohne Titel';
const colorOf = (f, v) => (f.options || []).find((o) => o.name === v)?.color || 'default';
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function rawValue(col, r, f) {
  if (f.type === 'formula') { try { return f.compute(r); } catch { return null; } }
  if (f.type === 'inverse') return inverse(f.source, f.via, r.id);
  return r[f.key];
}
function relIds(f, v) { return f.type === 'inverse' ? v.map((x) => x.id) : asArray(v); }
function relCol(f) { return f.type === 'inverse' ? f.source : f.target; }

function textValue(col, r, f) {
  const v = rawValue(col, r, f);
  if (isEmpty(v)) return '';
  switch (f.type) {
    case 'relation': case 'inverse': return relIds(f, v).map((id) => byId(relCol(f), id)).filter(Boolean).map((x) => titleOf(relCol(f), x)).join(', ');
    case 'multiselect': return asArray(v).join(', ');
    case 'chf': return fmtCHF(v);
    case 'date': return fmtDate(v);
    case 'formula':
      if (v == null) return '';
      return f.format === 'chf' ? fmtCHF(v) : `${Math.round(v * 100)} %`;
    default: return String(v);
  }
}

function sortValue(col, r, f) {
  const v = rawValue(col, r, f);
  if (isEmpty(v)) return null;
  if (f.type === 'select') { const i = f.options.findIndex((o) => o.name === v); return i < 0 ? 999 : i; }
  if (f.type === 'formula' || NUMERIC.has(f.type)) return Number(v);
  return textValue(col, r, f).toLowerCase();
}
function compare(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de', { numeric: true });
}
function sortRows(col, list, sort) {
  if (!sort) return list;
  const [key, dir] = sort;
  const f = F(col, key);
  if (!f) return list;
  const m = dir === 'desc' ? -1 : 1;
  return list
    .map((r) => [sortValue(col, r, f), r])
    .sort((a, b) => (a[0] == null || b[0] == null ? compare(a[0], b[0]) : compare(a[0], b[0]) * m))
    .map((x) => x[1]);
}

function groupRows(col, list, f) {
  const groups = new Map();
  const add = (k, label, color, r) => {
    if (!groups.has(k)) groups.set(k, { key: k, label, color, rows: [] });
    if (r) groups.get(k).rows.push(r);
  };
  if (f.type === 'select') f.options.forEach((o) => add(o.name, o.name, o.color));
  for (const r of list) {
    const v = rawValue(col, r, f);
    if (f.type === 'relation') {
      const id = asArray(v)[0];
      const t = id && byId(f.target, id);
      t ? add(id, titleOf(f.target, t), null, r) : add('', null, null, r);
    } else if (isEmpty(v)) add('', null, null, r);
    else add(String(v), String(v), f.type === 'select' ? colorOf(f, v) : null, r);
  }
  let out = [...groups.values()].filter((g) => g.rows.length);
  if (f.type !== 'select') out.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, 'de', { numeric: true })));
  else out.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : 0));
  return out;
}

function people() {
  const s = new Set();
  rows('pendenzen').forEach((r) => r.verantwortlich && s.add(r.verantwortlich.trim()));
  rows('projekte').forEach((r) => r.projektleiter && s.add(r.projektleiter.trim()));
  return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
}

// ---------- rendering primitives ----------
const tag = (label, color, attrs = '') => `<span class="tag c-${esc(color || 'default')}" ${attrs}>${esc(label)}</span>`;
function progress(v) {
  if (v == null || Number.isNaN(v)) return '';
  const pct = Math.max(0, Math.min(100, Math.round(v * 100)));
  return `<span class="progress" title="${pct} %"><span class="bar"><span style="width:${pct}%" class="${pct >= 100 ? 'full' : ''}"></span></span><span class="pct">${pct} %</span></span>`;
}
function relChips(col, ids) {
  return ids.map((id) => byId(col, id)).filter(Boolean)
    .map((t) => `<a href="#" class="chip" data-open="${col}|${esc(t.id)}">${C(col).icon} ${esc(titleOf(col, t))}</a>`).join(' ');
}
function dateHtml(iso, overdue) {
  if (!iso) return '';
  const d = daysUntil(iso);
  const cls = overdue && d < 0 ? 'date overdue' : overdue && d <= 7 ? 'date soon' : 'date';
  return `<span class="${cls}">${fmtDate(iso)}</span>`;
}
function relLabel(iso) {
  const d = daysUntil(iso);
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  if (d === -1) return 'gestern';
  return d > 0 ? `in ${d} Tagen` : `${-d} Tage überfällig`;
}

function display(col, r, f, opts = {}) {
  const v = rawValue(col, r, f);
  switch (f.type) {
    case 'title': return `<span class="title-cell">${esc(titleOf(col, r))}</span>`;
    case 'select':
      if (!v) return opts.cycle && f.cycle ? `<span class="tag c-default ghost" data-cycle="${col}|${esc(r.id)}|${f.key}">–</span>` : '';
      return tag(v, colorOf(f, v), opts.cycle && f.cycle ? `data-cycle="${col}|${esc(r.id)}|${f.key}" title="Klicken zum Weiterschalten"` : '');
    case 'multiselect': return asArray(v).map((x) => tag(x, colorOf(f, x))).join(' ');
    case 'number': return isEmpty(v) ? '' : esc(f.plain ? String(v) : numFmt.format(v));
    case 'chf': return isEmpty(v) ? '' : esc(fmtCHF(v));
    case 'date': return dateHtml(v, f.due && f.due(r));
    case 'email': return v ? `<a href="mailto:${esc(v)}" data-stop>${esc(v)}</a>` : '';
    case 'phone': return v ? `<a href="tel:${esc(String(v).replace(/[^+\d]/g, ''))}" data-stop>${esc(v)}</a>` : '';
    case 'url': return v ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener noreferrer" data-stop>🔗 ${esc(shortUrl(v))}</a>` : '';
    case 'relation': case 'inverse': return relChips(relCol(f), relIds(f, v));
    case 'formula':
      if (v == null) return '';
      return f.format === 'chf' ? `<span class="${v < 0 ? 'neg' : ''}">${esc(fmtCHF(v))}</span>` : progress(v);
    case 'longtext': return `<span class="clamp">${esc(v || '')}</span>`;
    default: return esc(v || '');
  }
}

// ---------- tables & boards ----------
function renderTable(col, list, columns, opts = {}) {
  const fs = columns.map((k) => F(col, k)).filter(Boolean);
  const sortKey = opts.sortKey;
  const sort = (sortKey && state.sort[sortKey]) || opts.sort;
  const sorted = sortRows(col, list, sort);
  const check = opts.check && col === 'pendenzen';
  const ncols = fs.length + (check ? 1 : 0);
  const head = `<tr>${check ? '<th class="chk"></th>' : ''}${fs.map((f) => {
    const active = sort && sort[0] === f.key;
    const arrow = active ? (sort[1] === 'desc' ? ' ↓' : ' ↑') : '';
    const cls = [NUMERIC.has(f.type) || f.format === 'chf' ? 'num' : '', sortKey ? 'sortable' : ''].join(' ');
    return `<th class="${cls}" ${sortKey ? `data-sort="${sortKey}|${f.key}"` : ''}>${esc(f.label)}${arrow}</th>`;
  }).join('')}</tr>`;

  const rowHtml = (r) => `<tr data-open="${col}|${esc(r.id)}" class="${check && r.status === 'Erledigt' ? 'done' : ''}">${check
    ? `<td class="chk"><input type="checkbox" aria-label="Erledigt" data-check="${esc(r.id)}" ${r.status === 'Erledigt' ? 'checked' : ''}></td>` : ''}${fs.map((f) =>
    `<td class="${NUMERIC.has(f.type) || f.format === 'chf' ? 'num' : ''} t-${f.type}">${display(col, r, f, { cycle: true })}</td>`).join('')}</tr>`;

  let body = '';
  if (opts.groupBy) {
    const gf = F(col, opts.groupBy);
    for (const g of groupRows(col, sorted, gf)) {
      const label = g.key === '' ? `<span class="muted">Ohne ${esc(gf.label)}</span>` : g.color ? tag(g.label, g.color) : `<strong>${esc(g.label)}</strong>`;
      body += `<tr class="group-row"><td colspan="${ncols}">${label} <span class="count">${g.rows.length}</span></td></tr>`;
      body += g.rows.map(rowHtml).join('');
    }
  } else body = sorted.map(rowHtml).join('');

  let foot = '';
  if (opts.sums && sorted.length) {
    foot = `<tfoot><tr>${check ? '<td></td>' : ''}${fs.map((f, i) => {
      if (f.type === 'chf' || (f.type === 'formula' && f.format === 'chf')) {
        const s = sorted.reduce((a, r) => a + (Number(rawValue(col, r, f)) || 0), 0);
        return `<td class="num"><strong>${esc(fmtCHF(s))}</strong></td>`;
      }
      return i === 0 ? `<td><strong>Total</strong></td>` : '<td></td>';
    }).join('')}</tr></tfoot>`;
  }
  if (!sorted.length) return `<div class="empty">${esc(opts.empty || 'Keine Einträge')}</div>`;
  return `<div class="table-wrap"><table class="tbl"><thead>${head}</thead><tbody>${body}</tbody>${foot}</table></div>`;
}

function renderBoard(col, list, view) {
  const f = F(col, view.groupBy);
  const sorted = sortRows(col, list, view.sort);
  const lanes = f.options.map((o) => ({ value: o.name, label: o.name, color: o.color }));
  if (sorted.some((r) => !r[f.key])) lanes.push({ value: '', label: `Ohne ${f.label}`, color: 'default' });
  const cardFields = (view.card || []).map((k) => F(col, k)).filter(Boolean);
  return `<div class="board">${lanes.map((l) => {
    const items = sorted.filter((r) => (r[f.key] || '') === l.value);
    return `<section class="lane" data-drop="${col}|${f.key}|${esc(l.value)}">
      <header class="lane-head">${tag(l.label, l.color)} <span class="count">${items.length}</span></header>
      <div class="lane-body">${items.map((r) => `<article class="card" draggable="true" data-drag="${esc(r.id)}" data-open="${col}|${esc(r.id)}">
        <div class="card-title">${esc(titleOf(col, r))}</div>
        ${cardFields.map((cf) => { const h = display(col, r, cf); return h ? `<div class="card-field">${h}</div>` : ''; }).join('')}
      </article>`).join('')}</div>
      <button class="lane-add" data-action="new" data-col="${col}" data-preset="${f.key}" data-value="${esc(l.value)}">+ Neu</button>
    </section>`;
  }).join('')}</div>`;
}

// ---------- state & routing ----------
const state = { sort: {}, search: {}, open: null, dashQuery: '' };

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function renderNav() {
  const { parts } = route();
  const cur = parts[0] === 'c' ? parts[1] : parts[0] || 'dashboard';
  const s = Store.db.settings;
  $('#brand-name').textContent = s.name || 'Projekt-Hub';
  document.title = s.name || 'Projekt-Hub';
  const item = (href, icon, label, key, count) =>
    `<a href="${href}" class="${cur === key ? 'active' : ''}"><span class="nav-icon">${icon}</span><span>${esc(label)}</span>${count != null ? `<span class="nav-count">${count}</span>` : ''}</a>`;
  const openPend = rows('pendenzen').filter((r) => r.status !== 'Erledigt').length;
  $('#nav').innerHTML = item('#/', '🏠', 'Übersicht', 'dashboard')
    + '<div class="nav-sep">Datenbanken</div>'
    + COLLECTION_KEYS.map((k) => item(`#/c/${k}`, C(k).icon, C(k).label, k, k === 'pendenzen' ? openPend : rows(k).length)).join('')
    + '<div class="nav-sep"></div>'
    + item('#/einstellungen', '⚙️', 'Einstellungen', 'einstellungen');
  $('#storage-info').innerHTML = Store.mode === 'server'
    ? '<span class="dot ok"></span> Gemeinsame Daten (Server)'
    : '<span class="dot warn"></span> Nur in diesem Browser gespeichert';
}

function render() {
  renderNav();
  const { parts, params } = route();
  const main = $('#main');
  const scroll = window.scrollY;
  if (parts[0] === 'c' && C(parts[1])) {
    main.innerHTML = renderCollection(parts[1], params);
    $('#crumbs').innerHTML = `<a href="#/">Übersicht</a> / ${esc(C(parts[1]).label)}`;
  } else if (parts[0] === 'einstellungen') {
    main.innerHTML = renderSettings();
    $('#crumbs').innerHTML = '<a href="#/">Übersicht</a> / Einstellungen';
  } else {
    main.innerHTML = renderDashboard();
    $('#crumbs').innerHTML = 'Übersicht';
  }
  window.scrollTo(0, scroll);
}

// ---------- collection page ----------
function matches(col, r, q) {
  if (!q) return true;
  const hay = C(col).fields.filter((f) => f.type !== 'formula').map((f) => textValue(col, r, f)).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

function currentView(col, params) {
  const vi = Math.min(Number(params.get('v')) || 0, C(col).views.length - 1);
  return [vi, C(col).views[vi]];
}

function renderCollectionBody(col, params) {
  const [vi, view] = currentView(col, params);
  const list = rows(col).filter((r) => matches(col, r, state.search[col]));
  if (view.type === 'board') return renderBoard(col, list, view);
  return renderTable(col, list, view.columns, {
    groupBy: view.groupBy, sort: view.sort, sortKey: `${col}:${vi}`, check: view.check,
    sums: col === 'projekte', empty: state.search[col] ? 'Keine Treffer' : 'Noch keine Einträge – lege den ersten mit «+ Neu» an.',
  });
}

function renderCollection(col, params) {
  const c = C(col);
  const [vi] = currentView(col, params);
  return `
  <div class="page-head">
    <h1><span class="h-icon">${c.icon}</span> ${esc(c.label)}</h1>
    <p class="muted">${esc(c.desc)}</p>
  </div>
  <div class="toolbar">
    <div class="tabs" role="tablist">${c.views.map((v, i) => `<a role="tab" href="#/c/${col}?v=${i}" class="tab ${i === vi ? 'active' : ''}">${v.type === 'board' ? '▦ ' : ''}${esc(v.name)}</a>`).join('')}</div>
    <div class="toolbar-right">
      <input type="search" class="search" id="col-search" data-col="${col}" placeholder="Suchen…" value="${esc(state.search[col] || '')}">
      <button class="btn" data-action="csv" data-col="${col}" title="Als CSV für Excel exportieren">⬇ CSV</button>
      <button class="btn primary" data-action="new" data-col="${col}">+ Neu</button>
    </div>
  </div>
  <div id="view-body">${renderCollectionBody(col, params)}</div>`;
}

// ---------- dashboard ----------
function renderDashboard() {
  const s = Store.db.settings;
  const P = rows('projekte');
  const pend = rows('pendenzen');
  const total = COLLECTION_KEYS.reduce((a, k) => a + rows(k).length, 0);
  const aktiv = P.filter((p) => p.status !== 'Abgeschlossen');
  const laufend = P.filter((p) => p.status === 'Laufend');
  const offen = pend.filter((r) => r.status !== 'Erledigt');
  const ueberfaellig = offen.filter((r) => r.faellig && daysUntil(r.faellig) < 0);
  const honorar = aktiv.reduce((a, p) => a + (Number(p.honorarsumme) || 0), 0);
  const verrechnet = aktiv.reduce((a, p) => a + (Number(p.verrechnet) || 0), 0);
  const fortF = F('projekte', 'fortschritt');
  const forts = laufend.map((p) => fortF.compute(p)).filter((v) => v != null);
  const avgFort = forts.length ? forts.reduce((a, b) => a + b, 0) / forts.length : null;

  const empty = total === 0 ? `
    <div class="callout c-yellow-bg">
      <span class="callout-icon">👋</span>
      <div><strong>Willkommen!</strong> Der Hub ist noch leer. Lege oben in den Datenbanken los
      oder <button class="link-btn" data-action="seed">lade Beispieldaten</button>, um alles auszuprobieren.
      Daten aus Notion kannst du unter <a href="#/einstellungen">Einstellungen</a> importieren.</div>
    </div>` : '';

  const phaseBars = (() => {
    const f = F('projekte', 'projektphase');
    const counts = f.options.map((o) => ({ ...o, n: aktiv.filter((p) => p.projektphase === o.name).length }));
    const max = Math.max(1, ...counts.map((c) => c.n));
    return counts.map((c) => `<div class="hbar"><span class="hbar-label">${esc(c.name)}</span><span class="hbar-track"><span class="hbar-fill c-${c.color}-fill" style="width:${(c.n / max) * 100}%"></span></span><span class="hbar-n">${c.n}</span></div>`).join('');
  })();
  const statusBars = (() => {
    const f = F('projekte', 'status');
    return `<div class="stack">${f.options.map((o) => {
      const n = P.filter((p) => p.status === o.name).length;
      return n ? `<span class="stack-seg c-${o.color}-fill" style="flex:${n}" title="${esc(o.name)}: ${n}"></span>` : '';
    }).join('')}</div><div class="legend">${f.options.map((o) => `<span>${tag(o.name, o.color)} ${P.filter((p) => p.status === o.name).length}</span>`).join('')}</div>`;
  })();

  const me = prefs.me;
  const myPend = offen.filter((r) => !me || (r.verantwortlich || '').trim() === me);
  const tabs = [
    ['✅', 'Meine Pendenzen', () => renderTable('pendenzen', myPend, ['pendenz', 'projekt', 'status', 'prioritaet', 'faellig', 'sia'].concat(me ? [] : ['verantwortlich']),
      { check: true, sort: ['faellig', 'asc'], empty: 'Keine offenen Pendenzen 🎉' })],
    ['⏰', 'Nächste Termine', renderTermine],
    ['💰', 'Honorar', () => renderTable('projekte', aktiv.filter((p) => p.honorarsumme), ['projektnummer', 'projekt', 'honorarsumme', 'verrechnet', 'noch_offen', 'verrechnet_pct'],
      { sort: ['noch_offen', 'desc'], sums: true, empty: 'Keine Honorare erfasst' })],
    ['📈', 'Projektfortschritt', () => renderTable('projekte', laufend, ['projektnummer', 'projekt', 'projektphase', 'fortschritt', 'wohnungen_fortschritt', 'zieltermin'],
      { sort: ['fortschritt', 'asc'], empty: 'Keine laufenden Projekte' })],
  ];
  const tab = Math.min(prefs.tab || 0, tabs.length - 1);
  const ppl = people();

  return `
  <div class="cover"></div>
  <div class="page-head dash-head">
    <h1><span class="h-icon">⚡</span> ${esc(s.name || 'Projekt-Hub')}</h1>
  </div>
  ${empty}
  <div class="grid two">
    <div class="callout c-blue-bg"><span class="callout-icon">🏗️</span><div><strong>${esc(s.name || 'Projekt-Hub')}</strong><br>${esc(s.tagline || 'Alle Projekte, Pendenzen, Kontakte und Wissen an einem Ort.')}</div></div>
    <div class="callout c-purple-bg"><span class="callout-icon">🎯</span><div><strong>Heute im Fokus</strong><br>${esc(s.focus || 'Pendenzen prüfen, Termine im Blick, Honorar im Griff.')}</div></div>
  </div>

  <div class="quick">${COLLECTION_KEYS.map((k) => `<a class="quick-card c-${C(k).color}-bg" href="#/c/${k}"><span class="callout-icon">${C(k).icon}</span><div><strong>${esc(C(k).label)}</strong><br><span class="muted">${esc(C(k).desc)}</span></div></a>`).join('')}</div>

  <div class="search-all">
    <input type="search" id="dash-search" placeholder="🔍 Alles durchsuchen – Projekte, Pendenzen, Kontakte, Wissen…" value="${esc(state.dashQuery)}">
    <div id="dash-results">${renderSearchResults(state.dashQuery)}</div>
  </div>

  <h2>📊 Auf einen Blick</h2>
  <div class="kpis">
    <a class="kpi" href="#/c/projekte?v=1"><span class="kpi-label">Laufende Projekte</span><span class="kpi-value">${laufend.length}</span><span class="kpi-sub">${aktiv.length} aktiv · ${P.length} total</span></a>
    <a class="kpi" href="#/c/pendenzen"><span class="kpi-label">Offene Pendenzen</span><span class="kpi-value">${offen.length}</span><span class="kpi-sub ${ueberfaellig.length ? 'bad' : ''}">${ueberfaellig.length} überfällig</span></a>
    <div class="kpi"><span class="kpi-label">Honorar offen</span><span class="kpi-value">${esc(fmtCHF(honorar - verrechnet))}</span><span class="kpi-sub">${esc(fmtCHF(verrechnet))} von ${esc(fmtCHF(honorar))} verrechnet</span></div>
    <div class="kpi"><span class="kpi-label">Ø Fortschritt laufend</span><span class="kpi-value">${avgFort == null ? '–' : Math.round(avgFort * 100) + ' %'}</span><span class="kpi-sub">nach erledigten Pendenzen</span></div>
  </div>
  <div class="grid two">
    <div class="panel"><h3>Aktive Projekte nach Phase</h3>${phaseBars}</div>
    <div class="panel"><h3>Alle Projekte nach Status</h3>${statusBars}</div>
  </div>

  <h2>🗓️ Mein Arbeitstag</h2>
  <div class="toolbar">
    <div class="tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" class="tab ${i === tab ? 'active' : ''}" data-action="tab" data-tab="${i}">${t[0]} ${esc(t[1])}</button>`).join('')}</div>
    <label class="me-select">Ich bin
      <select id="me-select"><option value="">– alle –</option>${ppl.map((p) => `<option ${p === me ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </label>
  </div>
  <div class="tab-body">${tabs[tab][2]()}</div>

  <h2>🚧 Laufende Projekte</h2>
  ${renderTable('projekte', laufend, ['projektnummer', 'projekt', 'projektphase', 'auftraggeber', 'projektleiter', 'zieltermin', 'fortschritt'],
    { sort: ['projektnummer', 'asc'], sortKey: 'dash:laufend', empty: 'Keine laufenden Projekte' })}
  `;
}

function renderTermine() {
  const items = [];
  rows('projekte').filter((p) => p.zieltermin && p.status !== 'Abgeschlossen')
    .forEach((p) => items.push({ date: p.zieltermin, col: 'projekte', r: p, what: 'Zieltermin' }));
  rows('pendenzen').filter((r) => r.faellig && r.status !== 'Erledigt' && (r.prioritaet === 'Hoch' || daysUntil(r.faellig) <= 14))
    .forEach((r) => items.push({ date: r.faellig, col: 'pendenzen', r, what: 'Pendenz' }));
  items.sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) return '<div class="empty">Keine anstehenden Termine</div>';
  return `<ul class="timeline">${items.slice(0, 25).map((it) => {
    const d = daysUntil(it.date);
    const proj = it.col === 'pendenzen' ? relChips('projekte', asArray(it.r.projekt)) : esc(it.r.projektnummer || '');
    return `<li class="${d < 0 ? 'overdue' : d <= 7 ? 'soon' : ''}" data-open="${it.col}|${esc(it.r.id)}">
      <span class="tl-date">${fmtDate(it.date)}<small>${relLabel(it.date)}</small></span>
      <span class="tl-what">${C(it.col).icon} ${esc(it.what)}</span>
      <span class="tl-title">${esc(titleOf(it.col, it.r))}</span>
      <span class="tl-proj">${proj}</span>
    </li>`;
  }).join('')}</ul>`;
}

function renderSearchResults(q) {
  if (!q || !q.trim()) return '';
  const out = [];
  for (const col of COLLECTION_KEYS) {
    const hits = rows(col).filter((r) => matches(col, r, q)).slice(0, 8);
    if (hits.length) out.push(`<div class="sr-group"><div class="sr-head">${C(col).icon} ${esc(C(col).label)}</div>${hits.map((r) =>
      `<a href="#" class="sr-item" data-open="${col}|${esc(r.id)}">${esc(titleOf(col, r))}</a>`).join('')}</div>`);
  }
  return out.length ? `<div class="sr">${out.join('')}</div>` : '<div class="sr empty">Keine Treffer</div>';
}

// ---------- settings ----------
function renderSettings() {
  const s = Store.db.settings;
  return `
  <div class="page-head"><h1><span class="h-icon">⚙️</span> Einstellungen</h1></div>
  <div class="panel form-panel">
    <h3>Firma</h3>
    <label class="field"><span>Name des Hubs</span><input id="set-name" value="${esc(s.name || '')}" placeholder="z. B. JBAG Projekt-Hub"></label>
    <label class="field"><span>Untertitel</span><input id="set-tagline" value="${esc(s.tagline || '')}" placeholder="Firma · Bereich · alle Projekte an einem Ort"></label>
    <label class="field"><span>Heute im Fokus</span><input id="set-focus" value="${esc(s.focus || '')}" placeholder="Pendenzen prüfen, Termine im Blick, Honorar im Griff."></label>
    <button class="btn primary" data-action="save-settings">Speichern</button>
  </div>
  <div class="panel form-panel">
    <h3>Daten</h3>
    <p class="muted">${Store.mode === 'server'
      ? 'Die Daten liegen auf dem Server und sind für alle im Team sichtbar. Der Server legt täglich eine Sicherung im Ordner <code>data/backups</code> an.'
      : 'Kein Server verbunden: Die Daten sind nur in diesem Browser gespeichert. Für gemeinsame Daten im Team <code>npm start</code> ausführen (siehe README).'}</p>
    <div class="btn-row">
      <button class="btn" data-action="export-json">⬇ Alles als JSON sichern</button>
      <button class="btn" data-action="import-json">⬆ JSON importieren…</button>
      <button class="btn" data-action="seed">Beispieldaten laden</button>
      <button class="btn danger" data-action="wipe">Alle Daten löschen</button>
    </div>
    <p class="muted small">Import aus Notion: <code>node tools/import-notion.js &lt;Notion-Export-Ordner&gt;</code> erzeugt eine JSON-Datei, die du hier importierst.</p>
  </div>`;
}

// ---------- record dialog ----------
function editor(col, r, f) {
  const v = r[f.key];
  const name = `data-field="${f.key}"`;
  switch (f.type) {
    case 'text': case 'person': {
      const list = f.type === 'person' ? 'dl-people' : f.suggest ? `dl-${col}-${f.key}` : '';
      return `<input type="text" ${name} value="${esc(v || '')}" ${list ? `list="${list}"` : ''} placeholder="Leer">`;
    }
    case 'longtext': return `<textarea ${name} rows="${f.rows || 3}" placeholder="Leer">${esc(v || '')}</textarea>`;
    case 'number': return `<input type="number" ${name} value="${esc(v ?? '')}" placeholder="Leer">`;
    case 'chf': return `<div class="with-unit"><span>CHF</span><input type="number" step="any" ${name} value="${esc(v ?? '')}" placeholder="0"></div>`;
    case 'date': return `<input type="date" ${name} value="${esc(v || '')}">`;
    case 'email': return `<div class="with-link"><input type="email" ${name} value="${esc(v || '')}" placeholder="Leer">${v ? `<a href="mailto:${esc(v)}" title="E-Mail schreiben">✉️</a>` : ''}</div>`;
    case 'phone': return `<div class="with-link"><input type="tel" ${name} value="${esc(v || '')}" placeholder="Leer">${v ? `<a href="tel:${esc(String(v).replace(/[^+\d]/g, ''))}" title="Anrufen">📞</a>` : ''}</div>`;
    case 'url': return `<div class="with-link"><input type="url" ${name} value="${esc(v || '')}" placeholder="https://…">${v ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener noreferrer" title="Öffnen">↗</a>` : ''}</div>`;
    case 'select': return `<select ${name} class="tag-select" style="${selStyle(f, v)}"><option value="">Leer</option>${f.options.map((o) => `<option ${o.name === v ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
    case 'multiselect': {
      const cur = asArray(v);
      return `<div class="ms">${f.options.map((o) => `<label class="ms-opt"><input type="checkbox" data-ms="${f.key}" value="${esc(o.name)}" ${cur.includes(o.name) ? 'checked' : ''}><span class="tag c-${o.color}">${esc(o.name)}</span></label>`).join('')}</div>`;
    }
    case 'relation': {
      const ids = asArray(v);
      const avail = sortRows(f.target, rows(f.target).filter((t) => !ids.includes(t.id)), [C(f.target).title, 'asc']);
      const chips = ids.map((id) => byId(f.target, id)).filter(Boolean).map((t) =>
        `<span class="chip"><a href="#" data-open="${f.target}|${esc(t.id)}">${C(f.target).icon} ${esc(titleOf(f.target, t))}</a><button type="button" class="x" data-relrm="${f.key}|${esc(t.id)}" aria-label="Entfernen">×</button></span>`).join('');
      const showAdd = f.multi || ids.length === 0;
      return `<div class="rel">${chips}${showAdd ? `<select data-reladd="${f.key}"><option value="">+ ${esc(C(f.target).label)} verknüpfen…</option>${avail.map((t) => `<option value="${esc(t.id)}">${esc(titleOf(f.target, t))}</option>`).join('')}</select>` : ''}</div>`;
    }
    case 'formula': return `<div class="formula" data-formula="${f.key}" ${f.hint ? `title="${esc(f.hint)}"` : ''}>${display(col, r, f) || '<span class="muted">–</span>'}</div>`;
    default: return '';
  }
}

function selStyle(f, v) {
  const c = v ? colorOf(f, v) : '';
  return c && c !== 'default' ? `--sel-bg:var(--c-${c});--sel-fg:var(--t-${c})` : '';
}

function datalists(col) {
  let html = `<datalist id="dl-people">${people().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;
  for (const f of C(col).fields.filter((x) => x.suggest)) {
    const vals = [...new Set(rows(col).map((r) => r[f.key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    html += `<datalist id="dl-${col}-${f.key}">${vals.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  }
  return html;
}

function openRecord(col, id) {
  if (!byId(col, id)) return toast('Eintrag nicht gefunden', true);
  state.open = { col, id };
  renderDialog();
  const dlg = $('#record-dialog');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

function renderDialog() {
  const { col, id } = state.open;
  const r = byId(col, id);
  const c = C(col);
  const dlg = $('#record-dialog');
  if (!r) { dlg.close(); return; }
  const fields = c.fields.filter((f) => f.type !== 'title' && f.type !== 'inverse');
  const sections = [];
  for (const f of fields) {
    const s = f.section || '';
    let sec = sections.find((x) => x.name === s);
    if (!sec) { sec = { name: s, fields: [] }; sections.push(sec); }
    sec.fields.push(f);
  }
  const fieldRow = (f) => `<div class="prop"><label class="prop-label">${esc(f.label)}</label><div class="prop-value">${editor(col, r, f)}</div></div>`;
  const inv = c.fields.filter((f) => f.type === 'inverse').map((f) => {
    const list = inverse(f.source, f.via, r.id);
    const canCreate = F(f.source, f.via).type === 'relation';
    return `<section class="inv"><div class="inv-head"><h3>${C(f.source).icon} ${esc(f.label)} <span class="count">${list.length}</span></h3>
      ${canCreate ? `<button class="btn small" data-action="new-linked" data-col="${f.source}" data-via="${f.via}">+ Neu</button>` : ''}</div>
      ${renderTable(f.source, list, f.columns, { check: f.check, sort: C(f.source).views[0].sort, empty: 'Noch nichts verknüpft' })}</section>`;
  }).join('');

  const scroll = dlg.scrollTop;
  dlg.innerHTML = `
  <form method="dialog" class="dlg" autocomplete="off">
    <header class="dlg-head">
      <span class="crumbs">${c.icon} ${esc(c.label)}</span>
      <span class="spacer"></span>
      <button type="button" class="icon-btn" data-action="delete" title="Löschen">🗑️</button>
      <button type="submit" class="icon-btn" title="Schliessen (Esc)">✕</button>
    </header>
    <div class="dlg-body">
      <input class="dlg-title" data-field="${c.title}" value="${esc(r[c.title] || '')}" placeholder="Ohne Titel">
      ${sections.map((s) => `${s.name ? `<h4 class="sec">${esc(s.name)}</h4>` : ''}<div class="props">${s.fields.map(fieldRow).join('')}</div>`).join('')}
      ${inv}
      <p class="meta muted small">${r.createdAt ? `Erstellt ${fmtDate(r.createdAt)}` : ''}${r.updatedAt ? ` · Zuletzt geändert ${fmtDate(r.updatedAt)}` : ''}</p>
    </div>
    ${datalists(col)}
  </form>`;
  dlg.scrollTop = scroll;
}

function refreshFormulas() {
  if (!state.open) return;
  const { col, id } = state.open;
  const r = byId(col, id);
  $$('#record-dialog [data-formula]').forEach((el) => {
    const f = F(col, el.dataset.formula);
    el.innerHTML = display(col, r, f) || '<span class="muted">–</span>';
  });
}

async function updateField(col, id, key, value, rerenderDialog) {
  const r = byId(col, id);
  if (!r) return;
  const next = { ...r, [key]: value };
  await Store.put(col, next);
  if (state.open && rerenderDialog) renderDialog(); else refreshFormulas();
  if (!state.open) render(); else renderNav();
}

function defaultsFor(col) {
  const rec = { id: uid(), createdAt: new Date().toISOString() };
  for (const f of C(col).fields) {
    if (f.default) rec[f.key] = f.default;
    if (f.type === 'relation' || f.type === 'multiselect') rec[f.key] = [];
  }
  if (col === 'projekte') rec.jahr = new Date().getFullYear();
  if (col === 'pendenzen' && prefs.me) rec.verantwortlich = prefs.me;
  return rec;
}

async function newRecord(col, preset = {}) {
  const rec = Object.assign(defaultsFor(col), preset);
  await Store.put(col, rec);
  render();
  openRecord(col, rec.id);
  const t = $('#record-dialog .dlg-title');
  if (t) t.focus();
}

async function deleteRecord(col, id) {
  const r = byId(col, id);
  if (!r || !confirm(`«${titleOf(col, r)}» wirklich löschen?`)) return;
  await Store.del(col, id);
  // remove dangling links
  for (const other of COLLECTION_KEYS) {
    for (const f of C(other).fields.filter((x) => x.type === 'relation' && x.target === col)) {
      for (const rec of rows(other).filter((x) => asArray(x[f.key]).includes(id))) {
        await Store.put(other, { ...rec, [f.key]: asArray(rec[f.key]).filter((x) => x !== id) });
      }
    }
  }
  $('#record-dialog').close();
  toast('Gelöscht');
}

// ---------- import / export ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv(col) {
  const fs = C(col).fields;
  const cell = (s) => { const t = String(s ?? ''); return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const list = sortRows(col, rows(col), C(col).views[0].sort);
  const lines = [fs.map((f) => cell(f.label)).join(';')]
    .concat(list.map((r) => fs.map((f) => {
      const v = rawValue(col, r, f);
      if (f.type === 'chf' || f.type === 'number') return cell(isEmpty(v) ? '' : v);
      return cell(textValue(col, r, f));
    }).join(';')));
  download(`${col}-${todayIso()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target;
  const cyc = t.closest('[data-cycle]');
  if (cyc) {
    e.preventDefault(); e.stopPropagation();
    const [col, id, key] = cyc.dataset.cycle.split('|');
    const f = F(col, key);
    const r = byId(col, id);
    const names = f.options.map((o) => o.name);
    const next = names[(names.indexOf(r[key]) + 1) % names.length];
    await Store.put(col, { ...r, [key]: next });
    if (state.open) renderDialog();
    render();
    return;
  }
  if (t.closest('[data-check]')) {
    e.stopPropagation();
    const id = t.closest('[data-check]').dataset.check;
    const r = byId('pendenzen', id);
    await Store.put('pendenzen', { ...r, status: r.status === 'Erledigt' ? 'Offen' : 'Erledigt' });
    if (state.open) renderDialog();
    render();
    return;
  }
  const rm = t.closest('[data-relrm]');
  if (rm) {
    e.preventDefault();
    const [key, rid] = rm.dataset.relrm.split('|');
    const { col, id } = state.open;
    await updateField(col, id, key, asArray(byId(col, id)[key]).filter((x) => x !== rid), true);
    return;
  }
  const srt = t.closest('[data-sort]');
  if (srt) {
    const [sk, key] = srt.dataset.sort.split('|');
    const cur = state.sort[sk];
    state.sort[sk] = cur && cur[0] === key ? [key, cur[1] === 'asc' ? 'desc' : 'asc'] : [key, 'asc'];
    render();
    return;
  }
  if (t.closest('[data-stop]')) return;
  const op = t.closest('[data-open]');
  if (op) {
    e.preventDefault();
    const [col, id] = op.dataset.open.split('|');
    openRecord(col, id);
    return;
  }
  const act = t.closest('[data-action]');
  if (!act) return;
  const a = act.dataset.action;
  if (a === 'toggle-menu') document.body.classList.toggle('menu-open');
  else if (a === 'new') newRecord(act.dataset.col, act.dataset.preset ? { [act.dataset.preset]: act.dataset.value } : {});
  else if (a === 'new-linked') {
    const { col, id } = state.open;
    const via = act.dataset.via;
    const preset = { [via]: [id] };
    if (act.dataset.col === 'pendenzen') {
      const p = byId(col, id);
      if (p && p.projektleiter && !prefs.me) preset.verantwortlich = p.projektleiter;
    }
    newRecord(act.dataset.col, preset);
  } else if (a === 'delete') deleteRecord(state.open.col, state.open.id);
  else if (a === 'tab') { prefs.tab = Number(act.dataset.tab); savePrefs(); render(); }
  else if (a === 'csv') exportCsv(act.dataset.col);
  else if (a === 'export-json') download(`projekt-hub-${todayIso()}.json`, JSON.stringify(Store.db, null, 1), 'application/json');
  else if (a === 'import-json') $('#import-file').click();
  else if (a === 'seed') {
    const hasData = COLLECTION_KEYS.some((k) => rows(k).length);
    if (hasData && !confirm('Beispieldaten ersetzen ALLE vorhandenen Daten. Fortfahren?')) return;
    await Store.replaceAll({ ...HUB_SEED(), settings: { ...HUB_SEED().settings, ...Store.db.settings } });
    toast('Beispieldaten geladen');
    location.hash = '#/';
    render();
  } else if (a === 'wipe') {
    if (!confirm('Wirklich ALLE Daten löschen? Vorher am besten als JSON sichern.')) return;
    if (prompt('Zur Bestätigung «LÖSCHEN» eingeben') !== 'LÖSCHEN') return;
    await Store.replaceAll({ settings: Store.db.settings });
    toast('Alle Daten gelöscht');
    render();
  } else if (a === 'save-settings') {
    await Store.putSettings({ ...Store.db.settings, name: $('#set-name').value.trim(), tagline: $('#set-tagline').value.trim(), focus: $('#set-focus').value.trim() });
    toast('Gespeichert');
    render();
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'me-select') { prefs.me = t.value; savePrefs(); render(); return; }
  if (t.id === 'import-file') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!COLLECTION_KEYS.some((k) => Array.isArray(data[k]))) throw new Error('Keine Hub-Daten gefunden');
      const counts = COLLECTION_KEYS.map((k) => `${C(k).label}: ${(data[k] || []).length}`).join(', ');
      if (!confirm(`Import ersetzt alle vorhandenen Daten.\n\n${counts}\n\nFortfahren?`)) return;
      await Store.replaceAll({ ...data, settings: { ...Store.db.settings, ...(data.settings || {}) } });
      toast('Import abgeschlossen');
      render();
    } catch (err) { toast('Import fehlgeschlagen: ' + err.message, true); }
    return;
  }
  if (!state.open || !t.closest('#record-dialog')) return;
  const { col, id } = state.open;
  if (t.dataset.reladd) {
    if (!t.value) return;
    const f = F(col, t.dataset.reladd);
    const cur = asArray(byId(col, id)[f.key]);
    await updateField(col, id, f.key, f.multi ? [...cur, t.value] : [t.value], true);
    return;
  }
  if (t.dataset.ms) {
    const key = t.dataset.ms;
    const vals = $$(`#record-dialog [data-ms="${key}"]:checked`).map((x) => x.value);
    await updateField(col, id, key, vals, false);
    return;
  }
  const key = t.dataset.field;
  if (!key) return;
  const f = key === C(col).title ? { type: 'title' } : F(col, key);
  let v = t.value;
  if (f.type === 'number' || f.type === 'chf') v = v === '' ? null : Number(v);
  else if (typeof v === 'string' && f.type !== 'longtext') v = v.trim();
  if (f.type === 'select') t.setAttribute('style', selStyle(f, v));
  await updateField(col, id, key, v, f.type === 'email' || f.type === 'url' || f.type === 'phone');
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'col-search') {
    state.search[t.dataset.col] = t.value;
    $('#view-body').innerHTML = renderCollectionBody(t.dataset.col, route().params);
  } else if (t.id === 'dash-search') {
    state.dashQuery = t.value;
    $('#dash-results').innerHTML = renderSearchResults(t.value);
  }
});

// board drag & drop
document.addEventListener('dragstart', (e) => {
  const card = e.target.closest && e.target.closest('[data-drag]');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.drag);
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', (e) => { e.target.classList && e.target.classList.remove('dragging'); });
document.addEventListener('dragover', (e) => {
  const lane = e.target.closest && e.target.closest('[data-drop]');
  if (!lane) return;
  e.preventDefault();
  $$('.lane.over').forEach((l) => l !== lane && l.classList.remove('over'));
  lane.classList.add('over');
});
document.addEventListener('drop', async (e) => {
  const lane = e.target.closest && e.target.closest('[data-drop]');
  if (!lane) return;
  e.preventDefault();
  lane.classList.remove('over');
  const id = e.dataTransfer.getData('text/plain');
  const [col, key, value] = lane.dataset.drop.split('|');
  const r = byId(col, id);
  if (!r || (r[key] || '') === value) return;
  await Store.put(col, { ...r, [key]: value });
  render();
});

window.addEventListener('hashchange', () => { document.body.classList.remove('menu-open'); render(); });
window.addEventListener('keydown', (e) => {
  // Enter in a dialog input saves the field instead of closing the dialog
  if (e.key === 'Enter' && e.target.matches('#record-dialog input')) { e.preventDefault(); e.target.blur(); return; }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !state.open) {
    const s = $('#col-search') || $('#dash-search');
    if (s) { e.preventDefault(); s.focus(); }
  }
});
$('#record-dialog').addEventListener('close', () => { state.open = null; render(); });
$('#record-dialog').addEventListener('click', (e) => { if (e.target.id === 'record-dialog') e.target.close(); });

// keep shared data fresh
setInterval(async () => {
  if (document.hidden || state.open) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  if (await Store.refresh()) render();
}, 20000);

(async () => {
  await Store.init();
  render();
})();
