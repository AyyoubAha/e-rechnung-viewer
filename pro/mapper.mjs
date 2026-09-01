/**
 * Excel-Mapper für XRechnung Batch Pro:
 * Arbeitsmappen-Inhalte (als Zeilen-Arrays) → Rechnungs-Eingaben für den UBL-Generator.
 * Bewusst ohne SheetJS-Abhängigkeit (bekommt bereits geparste Zellwerte) → pur testbar.
 *
 * Erwartet:
 *  - absenderRows:  [[Schlüssel, Wert], ...]            (Blatt „Absender")
 *  - rechnungRows:  [[Kopfzeile...], [Datenzeile...]]   (Blatt „Rechnungen", Zeile 1 = Überschriften)
 * Zellwerte dürfen sein: string | number | Date | null/undefined.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü0-9%]/g, '');

const UNIT_MAP = {
  'stück': 'C62', 'stck': 'C62', 'stk': 'C62', 'st': 'C62', 'c62': 'C62',
  'stunde': 'HUR', 'stunden': 'HUR', 'std': 'HUR', 'h': 'HUR', 'hur': 'HUR',
  'tag': 'DAY', 'tage': 'DAY', 'day': 'DAY',
  'monat': 'MON', 'monate': 'MON', 'mon': 'MON',
  'jahr': 'ANN', 'jahre': 'ANN',
  'pauschal': 'LS', 'pausch': 'LS', 'ls': 'LS',
  'kg': 'KGM', 'kilogramm': 'KGM', 'g': 'GRM', 'gramm': 'GRM', 't': 'TNE', 'tonne': 'TNE',
  'm': 'MTR', 'meter': 'MTR', 'm2': 'MTK', 'm²': 'MTK', 'qm': 'MTK', 'm3': 'MTQ', 'm³': 'MTQ',
  'liter': 'LTR', 'l': 'LTR', 'km': 'KMT', 'kilometer': 'KMT',
  'set': 'SET', 'paar': 'PR', 'paket': 'PK', 'karton': 'CT',
  'minute': 'MIN', 'minuten': 'MIN', 'min': 'MIN', 'kwh': 'KWH', 'woche': 'WEE', 'wochen': 'WEE',
};

export function toIsoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    // Excel/SheetJS liefert lokale Mitternacht; UTC-Anteile nutzen, um Off-by-one zu vermeiden
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return undefined; // unlesbar
}

export function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s|€/g, '');
  // deutsches Format: 1.234,56 — Punkt als Tausender nur wenn Komma vorhanden
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function toUnit(v) {
  if (v == null || String(v).trim() === '') return 'C62';
  const key = norm(v);
  if (UNIT_MAP[key]) return UNIT_MAP[key];
  const raw = String(v).trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(raw) ? raw : undefined;
}

const truthy = (v) => /^(ja|j|x|yes|true|1)$/i.test(String(v ?? '').trim());

export function mapAbsender(absenderRows) {
  const kv = {};
  for (const row of absenderRows || []) {
    if (!row || row.length < 2) continue;
    const key = norm(row[0]);
    if (key) kv[key] = row[1];
  }
  const pick = (...keys) => {
    for (const k of keys) {
      const nk = norm(k);
      const hit = Object.keys(kv).find((key) => key.includes(nk));
      if (hit && kv[hit] != null && String(kv[hit]).trim() !== '') return String(kv[hit]).trim();
    }
    return undefined;
  };
  return {
    seller: {
      name: pick('namefirma', 'firma', 'name'),
      contactName: pick('ansprechpartner', 'kontakt'),
      street: pick('straße', 'strasse'),
      postcode: pick('plz'),
      city: pick('ort', 'stadt'),
      email: pick('email', 'mail'),
      phone: pick('telefon', 'tel'),
      vatId: pick('ustidnr', 'ustid', 'umsatzsteuerid'),
      taxNumber: pick('steuernummer', 'steuernr'),
    },
    iban: pick('iban'),
    bic: pick('bic'),
    accountName: pick('kontoinhaber'),
    klein: truthy(pick('kleinunternehmer')),
    exemptionReason: pick('hinweistextsteuerbefreiung', 'befreiungstext') ||
      'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    defaultTerms: pick('zahlungsbedingungen'),
  };
}

const COLS = {
  number: ['rechnungsnummer', 'rechnungsnr'],
  issueDate: ['rechnungsdatum'],
  dueDate: ['fälligam', 'faelligam', 'fällig'],
  terms: ['zahlungsbedingungen'],
  buyerReference: ['leitweg', 'referenz', 'käuferreferenz'],
  bName: ['empfängername', 'empfaengername'],
  bStreet: ['empfängerstraße', 'empfaengerstrasse', 'empfängerstrasse'],
  bPlz: ['empfängerplz', 'empfaengerplz'],
  bCity: ['empfängerort', 'empfaengerort'],
  bEmail: ['empfängeremail', 'empfaengeremail'],
  lName: ['bezeichnung', 'position', 'leistung'],
  lDesc: ['beschreibung'],
  lQty: ['menge', 'anzahl'],
  lUnit: ['einheit'],
  lPrice: ['einzelpreis', 'preis'],
  lVat: ['ust%', 'ust', 'mwst%', 'mwst', 'steuersatz'],
};

function headerIndex(headerRow) {
  const idx = {};
  (headerRow || []).forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const [field, aliases] of Object.entries(COLS)) {
      if (idx[field] == null && aliases.some((a) => n.includes(norm(a)))) idx[field] = i;
    }
  });
  return idx;
}

/** Hauptfunktion: → { invoices: [InvoiceInput...], errors: [string...], seller } */
export function mapWorkbook({ absenderRows, rechnungRows }) {
  const errors = [];
  const abs = mapAbsender(absenderRows);

  if (!rechnungRows || rechnungRows.length < 2) {
    return { invoices: [], errors: ['Blatt „Rechnungen": keine Datenzeilen gefunden (Zeile 1 = Überschriften, ab Zeile 2 Daten).'], seller: abs.seller };
  }
  const idx = headerIndex(rechnungRows[0]);
  for (const must of ['number', 'bName', 'lName', 'lQty', 'lPrice']) {
    if (idx[must] == null) errors.push(`Blatt „Rechnungen": Spalte für „${COLS[must][0]}" nicht gefunden — bitte die mitgelieferte Vorlage verwenden.`);
  }
  if (errors.length) return { invoices: [], errors, seller: abs.seller };

  const cell = (row, field) => (idx[field] != null ? row[idx[field]] : undefined);
  const invoicesByNumber = new Map();
  let current = null;

  rechnungRows.slice(1).forEach((row, i) => {
    const excelRow = i + 2;
    if (!row || row.every((c) => c == null || String(c).trim() === '')) return;
    const rawNum = cell(row, 'number');
    const hasNum = rawNum != null && String(rawNum).trim() !== '';

    if (hasNum) {
      const number = String(rawNum).trim();
      if (invoicesByNumber.has(number)) {
        current = invoicesByNumber.get(number);
      } else {
        const issueDate = toIsoDate(cell(row, 'issueDate'));
        const dueDate = toIsoDate(cell(row, 'dueDate'));
        if (issueDate === undefined) errors.push(`Zeile ${excelRow}: Rechnungsdatum unlesbar („${cell(row, 'issueDate')}") — bitte als Datum oder TT.MM.JJJJ.`);
        if (dueDate === undefined) errors.push(`Zeile ${excelRow}: „Fällig am" unlesbar („${cell(row, 'dueDate')}").`);
        current = {
          number,
          issueDate: issueDate || null,
          dueDate: dueDate || undefined,
          paymentTerms: String(cell(row, 'terms') ?? '').trim() || abs.defaultTerms || undefined,
          buyerReference: String(cell(row, 'buyerReference') ?? '').trim(),
          taxCategory: abs.klein ? 'E' : 'S',
          exemptionReason: abs.klein ? abs.exemptionReason : undefined,
          seller: abs.seller,
          buyer: {
            name: String(cell(row, 'bName') ?? '').trim(),
            street: String(cell(row, 'bStreet') ?? '').trim(),
            postcode: String(cell(row, 'bPlz') ?? '').trim(),
            city: String(cell(row, 'bCity') ?? '').trim(),
            email: String(cell(row, 'bEmail') ?? '').trim() || undefined,
          },
          iban: abs.iban, bic: abs.bic, accountName: abs.accountName,
          paymentReference: number,
          lines: [],
        };
        invoicesByNumber.set(number, current);
      }
    }
    if (!current) { errors.push(`Zeile ${excelRow}: Position ohne Rechnungsnummer davor.`); return; }

    const name = String(cell(row, 'lName') ?? '').trim();
    if (!name) { errors.push(`Zeile ${excelRow}: Bezeichnung fehlt.`); return; }
    const qty = toNumber(cell(row, 'lQty'));
    const price = toNumber(cell(row, 'lPrice'));
    const unit = toUnit(cell(row, 'lUnit'));
    const vat = toNumber(cell(row, 'lVat'));
    if (qty === undefined || qty === null) errors.push(`Zeile ${excelRow}: Menge unlesbar/leer („${cell(row, 'lQty')}").`);
    if (price === undefined || price === null) errors.push(`Zeile ${excelRow}: Einzelpreis unlesbar/leer („${cell(row, 'lPrice')}").`);
    if (unit === undefined) errors.push(`Zeile ${excelRow}: Einheit „${cell(row, 'lUnit')}" unbekannt (z. B. Stück, Stunde, Tag, pauschal).`);
    if (!abs.klein && (vat === undefined || vat === null)) errors.push(`Zeile ${excelRow}: USt % fehlt/unlesbar (z. B. 19 oder 7).`);
    current.lines.push({
      name,
      description: String(cell(row, 'lDesc') ?? '').trim() || undefined,
      quantity: qty ?? 0,
      unit: unit || 'C62',
      unitPrice: price ?? 0,
      vatRate: abs.klein ? undefined : vat ?? undefined,
    });
  });

  return { invoices: [...invoicesByNumber.values()], errors, seller: abs.seller };
}
