// Round-Trip-Tests CII-Generator → eigener Parser (beide Syntaxen müssen dasselbe Modell liefern).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { generateCiiInvoice } from '../docs/cii-generator.mjs';
import { generateUblInvoice } from '../docs/ubl-generator.mjs';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';
import { SAMPLE_STANDARD, SAMPLE_MIXED_RATES, SAMPLE_KLEINUNTERNEHMER } from './samples.mjs';

class DOMParser extends XmldomParser {
  constructor() { super({ onError: (l, m) => { if (l === 'error' || l === 'fatalError') throw new Error(m); } }); }
}

test('CII Standard: Round-Trip Kernfelder + Summen', () => {
  const inv = parseInvoiceXml(generateCiiInvoice(SAMPLE_STANDARD), DOMParser);
  assert.equal(inv.syntax, 'CII');
  assert.equal(inv.number, 'RE-2026-0042');
  assert.equal(inv.issueDate, '2026-09-01');
  assert.equal(inv.dueDate, '2026-09-15');
  assert.equal(inv.seller.vatId, 'DE123456789');
  assert.equal(inv.payment.iban, 'DE02120300000000202051');
  assert.equal(inv.totals.duePayable, 1392.18);
  assert.deepEqual(inv.warnings, []);
});

test('CII und UBL liefern identische Kernwerte', () => {
  for (const sample of [SAMPLE_STANDARD, SAMPLE_MIXED_RATES, SAMPLE_KLEINUNTERNEHMER]) {
    const cii = parseInvoiceXml(generateCiiInvoice(sample), DOMParser);
    const ubl = parseInvoiceXml(generateUblInvoice(sample), DOMParser);
    assert.equal(cii.number, ubl.number);
    assert.equal(cii.totals.netTotal ?? cii.totals.lineTotal, ubl.totals.netTotal ?? ubl.totals.lineTotal);
    assert.equal(cii.totals.taxTotal, ubl.totals.taxTotal);
    assert.equal(cii.totals.duePayable, ubl.totals.duePayable);
    assert.equal(cii.lines.length, ubl.lines.length);
    assert.equal(cii.vatBreakdown.length, ubl.vatBreakdown.length);
  }
});

test('CII Kleinunternehmer: Kategorie E + Befreiungsgrund', () => {
  const xml = generateCiiInvoice(SAMPLE_KLEINUNTERNEHMER);
  assert.match(xml, /Gemäß § 19 UStG/);
  const inv = parseInvoiceXml(xml, DOMParser);
  assert.equal(inv.totals.taxTotal, 0);
  assert.equal(inv.vatBreakdown[0].category, 'E');
  assert.deepEqual(inv.warnings, []);
});

test('ZUGFeRD-Profil setzt EN-16931-Guideline ohne Peppol-Prozess', () => {
  const xml = generateCiiInvoice(SAMPLE_STANDARD, 'zugferd');
  assert.match(xml, /<ram:ID>urn:cen\.eu:en16931:2017<\/ram:ID>/);
  assert.ok(!xml.includes('peppol'), 'kein BusinessProcess im ZUGFeRD-Profil');
});
