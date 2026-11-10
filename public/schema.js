'use strict';
/*
 * Datenmodell des Projekt-Hubs — entspricht dem Notion "JBAG Projekt-Hub".
 *
 * Feldtypen: title, text, longtext, person, number, chf, date, email, phone, url,
 *            select, multiselect, relation (gespeichert als Array von IDs),
 *            inverse (rückwärts berechnete Relation), formula (berechnet).
 * Neue Felder oder Auswahlwerte können hier einfach ergänzt werden.
 */
const opt = (list) => list.map(([name, color]) => ({ name, color }));

const SIA_PHASEN = opt([
  ['11 Strategische Planung', 'gray'], ['21 Projektdefinition', 'brown'], ['31 Vorprojekt', 'orange'],
  ['32 Bauprojekt', 'yellow'], ['33 Bewilligung', 'pink'], ['41 Ausschreibung', 'blue'],
  ['51 Ausführungsprojekt', 'purple'], ['52 Ausführung', 'green'], ['53 Inbetriebnahme', 'red'],
]);
const SCHRITT = opt([['Offen', 'red'], ['In Arbeit', 'yellow'], ['Erledigt', 'green']]);
const WOHNUNG_SCHRITTE = ['planung', 'planversand', 'koordination', 'kaeuferwuensche', 'abnahme'];

function wohnungFortschritt(w) {
  const done = WOHNUNG_SCHRITTE.filter((k) => w[k] === 'Erledigt' || (k === 'kaeuferwuensche' && w[k] === 'Keine')).length;
  return done / WOHNUNG_SCHRITTE.length;
}
function projektPendenzen(p) { return inverse('pendenzen', 'projekt', p.id); }

const COLLECTIONS = {
  projekte: {
    label: 'Projekte', icon: '🚧', color: 'blue', title: 'projekt',
    desc: 'Alle Projekte, Phasen und Honorare',
    fields: [
      { key: 'projekt', label: 'Projekt', type: 'title' },
      { key: 'projektnummer', label: 'Projektnummer', type: 'text', pinned: true },
      { key: 'status', label: 'Status', type: 'select', pinned: true, default: 'Offerte',
        options: opt([['Offerte', 'gray'], ['Laufend', 'blue'], ['Pausiert', 'yellow'], ['Abgeschlossen', 'green']]) },
      { key: 'projektphase', label: 'Projektphase', type: 'select', pinned: true,
        options: opt([['Projektierung', 'blue'], ['Ausschreibung', 'orange'], ['Realisierung', 'green']]) },
      { key: 'zieltermin', label: 'Zieltermin', type: 'date', pinned: true, due: (r) => r.status !== 'Abgeschlossen' },
      { key: 'sharepoint', label: 'SharePoint-Ordner', type: 'url', pinned: true },
      { key: 'fortschritt', label: 'Fortschritt', type: 'formula', format: 'progress', pinned: true,
        hint: 'Erledigte Pendenzen / alle Pendenzen',
        compute: (r) => { const p = projektPendenzen(r); return p.length ? p.filter((x) => x.status === 'Erledigt').length / p.length : null; } },

      { key: 'honorarsumme', label: 'Honorarsumme', type: 'chf', section: 'Honorar' },
      { key: 'verrechnet', label: 'Bereits verrechnet', type: 'chf', section: 'Honorar' },
      { key: 'noch_offen', label: 'Noch offen', type: 'formula', format: 'chf', section: 'Honorar',
        compute: (r) => (r.honorarsumme == null || r.honorarsumme === '' ? null : (Number(r.honorarsumme) || 0) - (Number(r.verrechnet) || 0)) },
      { key: 'verrechnet_pct', label: 'Verrechnet in %', type: 'formula', format: 'progress', section: 'Honorar',
        compute: (r) => (Number(r.honorarsumme) ? (Number(r.verrechnet) || 0) / Number(r.honorarsumme) : null) },

      { key: 'auftraggeber', label: 'Auftraggeber', type: 'text', suggest: true, section: 'Beteiligte' },
      { key: 'kunde', label: 'Kunde', type: 'relation', target: 'kunden', multi: true, section: 'Beteiligte' },
      { key: 'kontakte', label: 'Kontakte', type: 'relation', target: 'kontakte', multi: true, section: 'Beteiligte' },
      { key: 'projektleiter', label: 'Projektleiter', type: 'person', section: 'Beteiligte' },

      { key: 'objektart', label: 'Objektart', type: 'select', section: 'Projektdaten',
        options: opt([['MFH', 'blue'], ['EFH', 'purple'], ['Schule', 'green'], ['Öffentlicher Bau', 'red'],
          ['Industrie-/Gewerbebau', 'orange'], ['Pflege-/Spitalbau', 'pink']]) },
      { key: 'bauort', label: 'Bauort', type: 'text', section: 'Projektdaten' },
      { key: 'jahr', label: 'Jahr', type: 'number', plain: true, section: 'Projektdaten' },
      { key: 'start', label: 'Start', type: 'date', section: 'Projektdaten' },
      { key: 'wohnungen_fortschritt', label: 'Wohnungen Fortschritt', type: 'formula', format: 'progress', section: 'Projektdaten',
        compute: (r) => { const w = inverse('wohnungen', 'projekt', r.id); return w.length ? w.reduce((s, x) => s + wohnungFortschritt(x), 0) / w.length : null; } },
      { key: 'notizen', label: 'Notizen', type: 'longtext', section: 'Projektdaten' },

      { key: 'pendenzen', label: 'Pendenzen', type: 'inverse', source: 'pendenzen', via: 'projekt',
        columns: ['pendenz', 'status', 'prioritaet', 'faellig', 'sia', 'verantwortlich'], check: true },
      { key: 'wohnungen', label: 'Wohnungen', type: 'inverse', source: 'wohnungen', via: 'projekt',
        columns: ['wohnung', 'haus', 'geschoss', 'planung', 'planversand', 'koordination', 'kaeuferwuensche', 'abnahme', 'fortschritt'] },
      { key: 'wissen', label: 'Wissen', type: 'inverse', source: 'wissen', via: 'projekte',
        columns: ['titel', 'kategorie', 'stichworte'] },
    ],
    views: [
      { name: 'Alle Projekte', type: 'table', sort: ['projektnummer', 'asc'],
        columns: ['projektnummer', 'projekt', 'status', 'projektphase', 'objektart', 'auftraggeber', 'zieltermin', 'fortschritt', 'honorarsumme', 'noch_offen'] },
      { name: 'Board', type: 'board', groupBy: 'status', sort: ['projektnummer', 'asc'], card: ['projektnummer', 'projektphase', 'zieltermin', 'fortschritt'] },
      { name: 'Nach Objektart', type: 'table', groupBy: 'objektart', sort: ['projektnummer', 'asc'],
        columns: ['projektnummer', 'projekt', 'auftraggeber', 'jahr', 'status'] },
      { name: 'Nach Auftraggeber', type: 'table', groupBy: 'auftraggeber', sort: ['projektnummer', 'asc'],
        columns: ['projektnummer', 'projekt', 'objektart', 'jahr', 'status'] },
      { name: 'Nach Jahr', type: 'table', groupBy: 'jahr', sort: ['projektnummer', 'asc'],
        columns: ['projektnummer', 'projekt', 'objektart', 'auftraggeber', 'status'] },
    ],
  },

  pendenzen: {
    label: 'Pendenzen', icon: '✅', color: 'green', title: 'pendenz',
    desc: 'Aufgaben pro Projekt nach SIA-Phase',
    fields: [
      { key: 'pendenz', label: 'Pendenz', type: 'title' },
      { key: 'projekt', label: 'Projekt', type: 'relation', target: 'projekte', multi: false },
      { key: 'status', label: 'Status', type: 'select', default: 'Offen',
        options: opt([['Offen', 'gray'], ['In Arbeit', 'blue'], ['Wartet auf Dritte', 'yellow'], ['Erledigt', 'green']]) },
      { key: 'prioritaet', label: 'Priorität', type: 'select', default: 'Mittel',
        options: opt([['Hoch', 'red'], ['Mittel', 'orange'], ['Tief', 'gray']]) },
      { key: 'faellig', label: 'Fällig', type: 'date', due: (r) => r.status !== 'Erledigt' },
      { key: 'sia', label: 'SIA-Phase', type: 'select', options: SIA_PHASEN },
      { key: 'verantwortlich', label: 'Verantwortlich', type: 'person' },
      { key: 'notizen', label: 'Notizen', type: 'longtext' },
    ],
    views: [
      { name: 'Alle Pendenzen', type: 'table', check: true, sort: ['faellig', 'asc'],
        columns: ['pendenz', 'projekt', 'status', 'prioritaet', 'faellig', 'sia', 'verantwortlich'] },
      { name: 'Board', type: 'board', groupBy: 'status', sort: ['faellig', 'asc'], card: ['projekt', 'prioritaet', 'faellig', 'verantwortlich'] },
      { name: 'Nach SIA-Phase', type: 'table', groupBy: 'sia', check: true, sort: ['faellig', 'asc'],
        columns: ['pendenz', 'projekt', 'status', 'prioritaet', 'faellig', 'verantwortlich'] },
      { name: 'Nach Projekt', type: 'table', groupBy: 'projekt', check: true, sort: ['faellig', 'asc'],
        columns: ['pendenz', 'status', 'prioritaet', 'faellig', 'sia', 'verantwortlich'] },
    ],
  },

  kontakte: {
    label: 'Kontakte', icon: '🤝', color: 'orange', title: 'name',
    desc: 'Ansprechpersonen in Projekten',
    fields: [
      { key: 'name', label: 'Name', type: 'title' },
      { key: 'firma', label: 'Firma', type: 'text', suggest: true },
      { key: 'funktion', label: 'Funktion', type: 'text' },
      { key: 'rolle', label: 'Rolle im Projekt', type: 'select',
        options: opt([['Bauherr', 'blue'], ['Architekt', 'green'], ['Generalunternehmer', 'orange'], ['Bauleiter', 'yellow'],
          ['Elektriker', 'red'], ['HLKS-Planer', 'purple'], ['Bauingenieur', 'brown'], ['Lieferant', 'pink'],
          ['Behörde', 'gray'], ['Andere', 'default']]) },
      { key: 'email', label: 'E-Mail', type: 'email' },
      { key: 'telefon', label: 'Telefon', type: 'phone' },
      { key: 'notizen', label: 'Notizen', type: 'longtext' },
      { key: 'projekte', label: 'Projekte', type: 'inverse', source: 'projekte', via: 'kontakte',
        columns: ['projektnummer', 'projekt', 'status'] },
    ],
    views: [
      { name: 'Alle Kontakte', type: 'table', sort: ['name', 'asc'], columns: ['name', 'firma', 'funktion', 'rolle', 'email', 'telefon', 'projekte'] },
      { name: 'Nach Rolle', type: 'table', groupBy: 'rolle', sort: ['name', 'asc'], columns: ['name', 'firma', 'funktion', 'email', 'telefon', 'projekte'] },
      { name: 'Nach Firma', type: 'table', groupBy: 'firma', sort: ['name', 'asc'], columns: ['name', 'funktion', 'rolle', 'email', 'telefon'] },
    ],
  },

  kunden: {
    label: 'Kunden', icon: '🏢', color: 'pink', title: 'name',
    desc: 'Bauherren, Generalunternehmer, Architekten',
    fields: [
      { key: 'name', label: 'Name', type: 'title' },
      { key: 'kundenart', label: 'Kundenart', type: 'select',
        options: opt([['Bauherr', 'blue'], ['Generalunternehmer', 'orange'], ['Architekt', 'green'], ['Totalunternehmer', 'purple'], ['Andere', 'gray']]) },
      { key: 'ansprechperson', label: 'Ansprechperson', type: 'text' },
      { key: 'email', label: 'E-Mail', type: 'email' },
      { key: 'telefon', label: 'Telefon', type: 'phone' },
      { key: 'adresse', label: 'Adresse', type: 'text' },
      { key: 'notizen', label: 'Notizen', type: 'longtext' },
      { key: 'projekte', label: 'Projekte', type: 'inverse', source: 'projekte', via: 'kunde',
        columns: ['projektnummer', 'projekt', 'status', 'honorarsumme'] },
    ],
    views: [
      { name: 'Alle Kunden', type: 'table', sort: ['name', 'asc'], columns: ['name', 'kundenart', 'ansprechperson', 'email', 'telefon', 'projekte'] },
      { name: 'Nach Kundenart', type: 'table', groupBy: 'kundenart', sort: ['name', 'asc'], columns: ['name', 'ansprechperson', 'email', 'telefon', 'projekte'] },
    ],
  },

  wissen: {
    label: 'Wissen', icon: '📚', color: 'purple', title: 'titel',
    desc: 'Normen, Checklisten, Textbausteine, Erfahrungen',
    fields: [
      { key: 'titel', label: 'Titel', type: 'title' },
      { key: 'kategorie', label: 'Kategorie', type: 'select',
        options: opt([['Normen & Vorschriften', 'blue'], ['Checkliste', 'green'], ['Textbaustein / Ausschreibung', 'orange'],
          ['Lehren aus Projekt', 'purple'], ['Software & Tools', 'gray'], ['Lieferanten & Produkte', 'yellow'], ['Prozess / Ablauf', 'pink']]) },
      { key: 'stichworte', label: 'Stichworte', type: 'multiselect',
        options: opt([['Schema', 'blue'], ['Beleuchtung', 'yellow'], ['PV / ZEV', 'green'], ['Brandschutz', 'red'],
          ['Notstrom', 'orange'], ['Schwachstrom', 'purple'], ['Kostenschätzung', 'gray'], ['Ausschreibung', 'pink']]) },
      { key: 'sia', label: 'SIA-Phase', type: 'select', options: SIA_PHASEN },
      { key: 'projekte', label: 'Projekte', type: 'relation', target: 'projekte', multi: true },
      { key: 'quelle', label: 'Quelle', type: 'url' },
      { key: 'zuletzt_geprueft', label: 'Zuletzt geprüft', type: 'date' },
      { key: 'inhalt', label: 'Inhalt', type: 'longtext', rows: 10 },
    ],
    views: [
      { name: 'Alle Einträge', type: 'table', sort: ['titel', 'asc'], columns: ['titel', 'kategorie', 'stichworte', 'sia', 'projekte', 'zuletzt_geprueft'] },
      { name: 'Nach Kategorie', type: 'table', groupBy: 'kategorie', sort: ['titel', 'asc'], columns: ['titel', 'sia', 'stichworte', 'projekte', 'zuletzt_geprueft'] },
      { name: 'Nach SIA-Phase', type: 'table', groupBy: 'sia', sort: ['titel', 'asc'], columns: ['titel', 'kategorie', 'stichworte', 'projekte', 'zuletzt_geprueft'] },
    ],
  },

  wohnungen: {
    label: 'Wohnungen', icon: '🏠', color: 'brown', title: 'wohnung',
    desc: 'Stand pro Haus und Wohnung: Planung bis Abnahme',
    fields: [
      { key: 'wohnung', label: 'Wohnung', type: 'title' },
      { key: 'projekt', label: 'Projekt', type: 'relation', target: 'projekte', multi: false },
      { key: 'haus', label: 'Haus', type: 'select',
        options: opt([['Haus A', 'blue'], ['Haus B', 'purple'], ['Haus C', 'pink'], ['Haus D', 'orange'], ['Haus E', 'green']]) },
      { key: 'geschoss', label: 'Geschoss', type: 'select',
        options: opt([['UG', 'gray'], ['EG', 'brown'], ['1. OG', 'orange'], ['2. OG', 'yellow'], ['3. OG', 'green'], ['DG', 'blue']]) },
      { key: 'fortschritt', label: 'Fortschritt', type: 'formula', format: 'progress', compute: wohnungFortschritt,
        hint: 'Erledigte Schritte von 5 (Käuferwünsche «Keine» zählt als erledigt)' },
      { key: 'planung', label: 'Planung', type: 'select', options: SCHRITT, default: 'Offen', cycle: true, section: 'Ablauf' },
      { key: 'planversand', label: 'Planversand', type: 'select', options: SCHRITT, default: 'Offen', cycle: true, section: 'Ablauf' },
      { key: 'koordination', label: 'Koordination', type: 'select', options: SCHRITT, default: 'Offen', cycle: true, section: 'Ablauf' },
      { key: 'kaeuferwuensche', label: 'Käuferwünsche', type: 'select', default: 'Offen', cycle: true, section: 'Ablauf',
        options: opt([['Offen', 'red'], ['In Arbeit', 'yellow'], ['Erledigt', 'green'], ['Keine', 'gray']]) },
      { key: 'abnahme', label: 'Abnahme', type: 'select', options: SCHRITT, default: 'Offen', cycle: true, section: 'Ablauf' },
      { key: 'planindex', label: 'Planindex', type: 'text', section: 'Details' },
      { key: 'versanddatum', label: 'Versanddatum', type: 'date', section: 'Details' },
      { key: 'bemerkung', label: 'Bemerkung', type: 'longtext', section: 'Details' },
    ],
    views: [
      { name: 'Wohnungsübersicht', type: 'table', sort: ['wohnung', 'asc'],
        columns: ['wohnung', 'projekt', 'haus', 'geschoss', 'planung', 'planversand', 'koordination', 'kaeuferwuensche', 'abnahme', 'fortschritt'] },
      { name: 'Nach Haus', type: 'board', groupBy: 'haus', sort: ['wohnung', 'asc'], card: ['geschoss', 'fortschritt'] },
      { name: 'Nach Projekt', type: 'table', groupBy: 'projekt', sort: ['wohnung', 'asc'],
        columns: ['wohnung', 'haus', 'geschoss', 'planung', 'planversand', 'koordination', 'kaeuferwuensche', 'abnahme', 'fortschritt'] },
    ],
  },
};
const COLLECTION_KEYS = Object.keys(COLLECTIONS);
