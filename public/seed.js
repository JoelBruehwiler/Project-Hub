'use strict';
/* Beispieldaten (fiktiv) zum Ausprobieren. Datumswerte sind relativ zu heute. */
function HUB_SEED() {
  const d = (days) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toLocaleDateString('sv-SE'); };
  const now = new Date().toISOString();
  const y = new Date().getFullYear();
  const rec = (id, o) => ({ id, createdAt: now, ...o });

  const projekte = [
    rec('p1', { projekt: 'Neubau MFH Seeblick, Musterdorf', projektnummer: `${y}-101`, status: 'Laufend', projektphase: 'Realisierung',
      objektart: 'MFH', auftraggeber: 'Muster Architekten AG', kunde: ['k1'], kontakte: ['c1', 'c2'], projektleiter: 'Anna Beispiel',
      bauort: 'Musterdorf', jahr: y, start: d(-240), zieltermin: d(45), honorarsumme: 128000, verrechnet: 76500,
      sharepoint: 'https://example.sharepoint.com/sites/projekte/Seeblick', notizen: '3 Häuser, 18 Wohnungen, PV-Anlage mit ZEV.' }),
    rec('p2', { projekt: 'Erweiterung Schulhaus Lindenhof', projektnummer: `${y}-102`, status: 'Laufend', projektphase: 'Ausschreibung',
      objektart: 'Schule', auftraggeber: 'Gemeinde Beispielhausen', kunde: ['k2'], kontakte: ['c3'], projektleiter: 'Marco Muster',
      bauort: 'Beispielhausen', jahr: y, start: d(-120), zieltermin: d(12), honorarsumme: 96000, verrechnet: 31000 }),
    rec('p3', { projekt: 'Gewerbehalle Nord, Industriestrasse', projektnummer: `${y}-103`, status: 'Offerte', projektphase: 'Projektierung',
      objektart: 'Industrie-/Gewerbebau', auftraggeber: 'Bau Total GU AG', kunde: ['k3'], kontakte: ['c4'], projektleiter: 'Anna Beispiel',
      bauort: 'Werkstadt', jahr: y, zieltermin: d(20), honorarsumme: 42000, verrechnet: 0 }),
    rec('p4', { projekt: 'Sanierung Pflegezentrum Sonnmatt', projektnummer: `${y - 1}-087`, status: 'Pausiert', projektphase: 'Projektierung',
      objektart: 'Pflege-/Spitalbau', auftraggeber: 'Stiftung Sonnmatt', kunde: ['k4'], projektleiter: 'Marco Muster',
      bauort: 'Sonnental', jahr: y - 1, start: d(-400), honorarsumme: 74000, verrechnet: 18500, notizen: 'Wartet auf Kreditentscheid.' }),
    rec('p5', { projekt: 'Umbau EFH Rosenweg', projektnummer: `${y - 1}-064`, status: 'Abgeschlossen', projektphase: 'Realisierung',
      objektart: 'EFH', auftraggeber: 'Privat', projektleiter: 'Anna Beispiel', bauort: 'Musterdorf', jahr: y - 1,
      start: d(-500), zieltermin: d(-60), honorarsumme: 14500, verrechnet: 14500 }),
  ];

  const pend = (id, projekt, pendenz, status, prioritaet, faellig, sia, verantwortlich) =>
    rec(id, { pendenz, projekt: [projekt], status, prioritaet, faellig: faellig == null ? '' : d(faellig), sia, verantwortlich });
  const pendenzen = [
    pend('t1', 'p1', 'Elektroschema Haus B nachführen', 'In Arbeit', 'Hoch', 2, '52 Ausführung', 'Anna Beispiel'),
    pend('t2', 'p1', 'Sicherheitsnachweis Haus A einreichen', 'Offen', 'Hoch', -1, '53 Inbetriebnahme', 'Anna Beispiel'),
    pend('t3', 'p1', 'Leuchtenliste mit Architekt bereinigen', 'Wartet auf Dritte', 'Mittel', 6, '52 Ausführung', 'Marco Muster'),
    pend('t4', 'p1', 'Bemusterung Schalter/Steckdosen', 'Erledigt', 'Mittel', -20, '51 Ausführungsprojekt', 'Anna Beispiel'),
    pend('t5', 'p1', 'ZEV-Messkonzept mit EW abstimmen', 'Erledigt', 'Hoch', -35, '51 Ausführungsprojekt', 'Anna Beispiel'),
    pend('t6', 'p2', 'Devis Starkstrom fertigstellen', 'In Arbeit', 'Hoch', 4, '41 Ausschreibung', 'Marco Muster'),
    pend('t7', 'p2', 'Offertvergleich Elektroinstallation', 'Offen', 'Mittel', 14, '41 Ausschreibung', 'Marco Muster'),
    pend('t8', 'p2', 'Brandmeldekonzept mit Feuerpolizei klären', 'Erledigt', 'Hoch', -10, '33 Bewilligung', 'Anna Beispiel'),
    pend('t9', 'p3', 'Honorarofferte erstellen', 'Offen', 'Hoch', 3, '21 Projektdefinition', 'Anna Beispiel'),
    pend('t10', 'p3', 'Grobkostenschätzung Elektro ±25 %', 'Offen', 'Mittel', 10, '31 Vorprojekt', 'Marco Muster'),
    pend('t11', 'p4', 'Bestandesaufnahme Hauptverteilung', 'Erledigt', 'Tief', -90, '31 Vorprojekt', 'Marco Muster'),
  ];

  const kontakte = [
    rec('c1', { name: 'Laura Planer', firma: 'Muster Architekten AG', funktion: 'Projektleiterin', rolle: 'Architekt', email: 'laura.planer@example.com', telefon: '+41 44 000 00 01' }),
    rec('c2', { name: 'Peter Bauleit', firma: 'Muster Architekten AG', funktion: 'Bauleiter', rolle: 'Bauleiter', email: 'peter.bauleit@example.com', telefon: '+41 79 000 00 02' }),
    rec('c3', { name: 'Sandra Gemeinde', firma: 'Gemeinde Beispielhausen', funktion: 'Leiterin Liegenschaften', rolle: 'Bauherr', email: 'sandra.gemeinde@example.com', telefon: '+41 52 000 00 03' }),
    rec('c4', { name: 'Thomas Total', firma: 'Bau Total GU AG', funktion: 'Gesamtprojektleiter', rolle: 'Generalunternehmer', email: 'thomas.total@example.com' }),
    rec('c5', { name: 'Elektro Funk GmbH', firma: 'Elektro Funk GmbH', funktion: 'Montageleiter', rolle: 'Elektriker', telefon: '+41 71 000 00 05', notizen: 'Zuverlässig, auch für Service.' }),
  ];

  const kunden = [
    rec('k1', { name: 'Muster Architekten AG', kundenart: 'Architekt', ansprechperson: 'Laura Planer', email: 'info@example.com', adresse: 'Planweg 1, 8000 Musterstadt' }),
    rec('k2', { name: 'Gemeinde Beispielhausen', kundenart: 'Bauherr', ansprechperson: 'Sandra Gemeinde', adresse: 'Dorfplatz 1, 8500 Beispielhausen' }),
    rec('k3', { name: 'Bau Total GU AG', kundenart: 'Generalunternehmer', ansprechperson: 'Thomas Total' }),
    rec('k4', { name: 'Stiftung Sonnmatt', kundenart: 'Bauherr' }),
  ];

  const wissen = [
    rec('w1', { titel: 'NIV / NIN 2025 – wichtigste Änderungen', kategorie: 'Normen & Vorschriften', stichworte: ['Schema'], sia: '51 Ausführungsprojekt', zuletzt_geprueft: d(-30), inhalt: 'Zusammenfassung der relevanten Änderungen für die Planung.' }),
    rec('w2', { titel: 'Checkliste Inbetriebnahme & Sicherheitsnachweis', kategorie: 'Checkliste', sia: '53 Inbetriebnahme', zuletzt_geprueft: d(-60), inhalt: '1. Messprotokolle\n2. Schemas nachgeführt\n3. SiNa an Eigentümer und Netzbetreiber' }),
    rec('w3', { titel: 'Textbaustein Devis Beleuchtung', kategorie: 'Textbaustein / Ausschreibung', stichworte: ['Beleuchtung', 'Ausschreibung'], sia: '41 Ausschreibung', projekte: ['p2'] }),
    rec('w4', { titel: 'Lehre: ZEV früh mit EW klären', kategorie: 'Lehren aus Projekt', stichworte: ['PV / ZEV'], sia: '31 Vorprojekt', projekte: ['p1'], inhalt: 'Messkonzept spätestens im Bauprojekt mit dem Netzbetreiber abstimmen.' }),
    rec('w5', { titel: 'Kennwerte Kostenschätzung Elektro', kategorie: 'Prozess / Ablauf', stichworte: ['Kostenschätzung'], sia: '31 Vorprojekt' }),
  ];

  const S = ['planung', 'planversand', 'koordination', 'kaeuferwuensche', 'abnahme'];
  const steps = (n, kw) => Object.fromEntries(S.map((k, i) => [k, i < n ? 'Erledigt' : i === n ? 'In Arbeit' : 'Offen']).map(([k, v]) => [k, k === 'kaeuferwuensche' && kw ? kw : v]));
  const wohnungen = [
    ['A.01', 'Haus A', 'EG', 5], ['A.11', 'Haus A', '1. OG', 4], ['A.21', 'Haus A', '2. OG', 3, 'Keine'],
    ['B.01', 'Haus B', 'EG', 3], ['B.11', 'Haus B', '1. OG', 2], ['B.21', 'Haus B', '2. OG', 1],
    ['C.01', 'Haus C', 'EG', 1], ['C.11', 'Haus C', '1. OG', 0],
  ].map(([w, haus, geschoss, n, kw], i) => rec(`h${i + 1}`, { wohnung: w, projekt: ['p1'], haus, geschoss, planindex: n >= 2 ? 'B' : 'A', versanddatum: n >= 2 ? d(-14 * (6 - n)) : '', ...steps(n, kw) }));

  return {
    settings: { name: 'JBAG Projekt-Hub', tagline: 'Jenni Brühwiler AG · Elektroplanung · alle Projekte, Pendenzen, Kontakte und Wissen an einem Ort.' },
    projekte, pendenzen, kontakte, kunden, wissen, wohnungen,
  };
}
