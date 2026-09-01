// Round-Trip-Tests: Generator → eigener Parser + Eingabevalidierung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { generateUblInvoice, validateInvoiceInput, computeTotals } from '../docs/ubl-generator.mjs';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';
import { SAMPLE_STANDARD, SAMPLE_MIXED_RATES, SAMPLE_KLEINUNTERNEHMER } from './samples.mjs';

class DOMParser extends XmldomParser {
  constructor() {
    super({ onError: (level, msg) => { if (level === 'error' || level === 'fatalError') throw new Error('XML nicht wohlgeformt: ' + msg); } });
  }
}

const roundtrip = (input) => parseInvoiceXml(generateUblInvoice(input), DOMParser);

test('Standard 19%: Round-Trip Kernfelder + Summen', () => {
  const inv = roundtrip(SAMPLE_STANDARD);
  assert.equal(inv.number, 'RE-2026-0042');
  assert.equal(inv.issueDate, '2026-09-01');
  assert.equal(inv.dueDate, '2026-09-15');
  assert.equal(inv.buyerReference, 'KD-1001');
  assert.equal(inv.seller.name, 'Muster Webdesign');
  assert.equal(inv.seller.vatId, 'DE123456789');
  assert.equal(inv.payment.iban, 'DE02120300000000202051');
  assert.equal(inv.payment.meansCode, '58');
  // 12*95 + 29.90 = 1169.90 netto; USt 19% = 222.28; brutto 1392.18
  assert.equal(inv.totals.netTotal, 1169.9);
  assert.equal(inv.totals.taxTotal, 222.28);
  assert.equal(inv.totals.grossTotal, 1392.18);
  assert.equal(inv.totals.duePayable, 1392.18);
  assert.equal(inv.lines.length, 2);
  assert.deepEqual(inv.warnings, []);
});

test('Gemischte Sätze 19/7: zwei USt-Subtotale, konsistente Summen', () => {
  const inv = roundtrip(SAMPLE_MIXED_RATES);
  assert.equal(inv.vatBreakdown.length, 2);
  const rates = inv.vatBreakdown.map((v) => v.rate).sort((a, b) => a - b);
  assert.deepEqual(rates, [7, 19]);
  // 7%: 3*24.50=73.50 → 5.15 | 19%: 4.90+180=184.90 → 35.13
  const v7 = inv.vatBreakdown.find((v) => v.rate === 7);
  const v19 = inv.vatBreakdown.find((v) => v.rate === 19);
  assert.equal(v7.taxable, 73.5);
  assert.equal(v7.tax, 5.15);
  assert.equal(v19.taxable, 184.9);
  assert.equal(v19.tax, 35.13);
  assert.equal(inv.totals.taxTotal, 40.28);
  assert.deepEqual(inv.warnings, []);
});

test('Kleinunternehmer §19: Kategorie E, 0 USt, Befreiungsgrund im XML', () => {
  const xml = generateUblInvoice(SAMPLE_KLEINUNTERNEHMER);
  assert.match(xml, /Gemäß § 19 UStG/);
  const inv = parseInvoiceXml(xml, DOMParser);
  assert.equal(inv.totals.taxTotal, 0);
  assert.equal(inv.totals.grossTotal, 280);
  assert.equal(inv.vatBreakdown[0].category, 'E');
  assert.equal(inv.seller.taxNumber, '26/123/45678');
  assert.deepEqual(inv.warnings, []);
});

test('Eingabevalidierung: fehlende Pflichtfelder werden konkret benannt', () => {
  const errs = validateInvoiceInput({ lines: [{}] });
  const text = errs.join('\n');
  assert.match(text, /Rechnungsnummer/);
  assert.match(text, /BR-DE-15/);
  assert.match(text, /USt-IdNr\.|Steuernummer/);
  assert.match(text, /Ansprechpartner/);
  assert.match(text, /Telefonnummer/);
  assert.match(text, /Bezeichnung fehlt/);
  assert.throws(() => generateUblInvoice({}), /Eingabe unvollständig/);
});

test('Kleinunternehmer ohne Befreiungsgrund wird abgelehnt', () => {
  const bad = { ...SAMPLE_KLEINUNTERNEHMER, exemptionReason: undefined };
  assert.match(validateInvoiceInput(bad).join('\n'), /Befreiungsgrund/);
});

test('Rundung: 3 × 0,10 € bei 19 %', () => {
  const t = computeTotals({ taxCategory: 'S', lines: [{ quantity: 3, unitPrice: 0.1, vatRate: 19 }] });
  assert.equal(t.net, 0.3);
  assert.equal(t.taxTotal, 0.06);
  assert.equal(t.payable, 0.36);
});

test('XML-Escaping: Sonderzeichen in Texten', () => {
  const input = { ...SAMPLE_STANDARD, number: 'RE<&>"2026', note: 'Rabatt & Co. <wichtig>' };
  const inv = roundtrip(input);
  assert.equal(inv.number, 'RE<&>"2026');
  assert.match(inv.notes[0], /Rabatt & Co\. <wichtig>/);
});
