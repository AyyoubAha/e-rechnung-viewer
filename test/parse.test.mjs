// Tests gegen offizielle Beispieldateien (KoSIT-Testsuite, ZUGFeRD-Corpus).
// Ausführen: node --test  (Dateien werden bei Bedarf heruntergeladen und gecacht)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';

// Browser-DOMParser meldet Fehler via <parsererror>; xmldom loggt nur.
// Für Tests: strikte Variante, die wie der Browser-Pfad zum Abbruch führt.
class DOMParser extends XmldomParser {
  constructor() {
    super({ onError: (level, msg) => { if (level === 'error' || level === 'fatalError') throw new Error(`XML ist nicht wohlgeformt: ${msg}`); } });
  }
}

const CACHE = new URL('./fixtures/', import.meta.url).pathname;
mkdirSync(CACHE, { recursive: true });

const FIXTURES = {
  'ubl.xml': 'https://raw.githubusercontent.com/itplr-kosit/xrechnung-testsuite/master/src/test/business-cases/standard/01.01a-INVOICE_ubl.xml',
  'cii.xml': 'https://raw.githubusercontent.com/itplr-kosit/xrechnung-testsuite/master/src/test/business-cases/standard/01.02a-INVOICE_uncefact.xml',
  'ubl-creditnote.xml': 'https://raw.githubusercontent.com/itplr-kosit/xrechnung-testsuite/master/src/test/business-cases/standard/02.01a-INVOICE_ubl.xml',
};

async function fixture(name) {
  const path = CACHE + name;
  if (!existsSync(path)) {
    const res = await fetch(FIXTURES[name]);
    if (!res.ok) throw new Error(`Download ${name}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(path, 'utf8');
}

test('UBL-Rechnung: Kernfelder', async () => {
  const inv = parseInvoiceXml(await fixture('ubl.xml'), DOMParser);
  assert.equal(inv.syntax, 'UBL');
  assert.ok(inv.number, 'Rechnungsnummer');
  assert.match(inv.issueDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(inv.seller.name);
  assert.ok(inv.buyer.name);
  assert.equal(inv.currency, 'EUR');
  assert.ok(inv.totals.duePayable != null);
  assert.ok(inv.lines.length > 0);
  assert.ok(inv.lines[0].name);
});

test('CII-Rechnung: Kernfelder', async () => {
  const inv = parseInvoiceXml(await fixture('cii.xml'), DOMParser);
  assert.equal(inv.syntax, 'CII');
  assert.ok(inv.number);
  assert.match(inv.issueDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(inv.seller.name);
  assert.ok(inv.totals.duePayable != null);
  assert.ok(inv.lines.length > 0);
});

test('Summenkonsistenz beider Syntaxen ohne Warnungen zu Summen', async () => {
  for (const f of ['ubl.xml', 'cii.xml']) {
    const inv = parseInvoiceXml(await fixture(f), DOMParser);
    const sumWarnings = inv.warnings.filter((w) => w.includes('Summenprüfung'));
    assert.deepEqual(sumWarnings, [], `${f}: ${sumWarnings.join(' | ')}`);
  }
});

test('Kaputtes XML wird abgelehnt', () => {
  assert.throws(() => parseInvoiceXml('<Invoice><kaputt</Invoice>', DOMParser));
});

test('Fremdes XML wird abgelehnt', () => {
  assert.throws(() => parseInvoiceXml('<Andere><Sache/></Andere>', DOMParser), /Unbekanntes Wurzelelement/);
});
