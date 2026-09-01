// Prüf-Engine-Tests: offizielle Regeln (SEF) via SaxonJS gegen valide + absichtlich kaputte Rechnungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import SaxonJS from 'saxon-js';
import { join } from 'node:path';
import { generateUblInvoice } from '../docs/ubl-generator.mjs';
import { generateCiiInvoice } from '../docs/cii-generator.mjs';
import { validateInvoice, detectInvoice } from '../docs/pruefen-engine.mjs';
import { SAMPLE_STANDARD, SAMPLE_KLEINUNTERNEHMER } from './samples.mjs';

const SEF_DIR = new URL('../docs/sef/', import.meta.url).pathname;
const opts = {
  SaxonJS,
  sefLocation: (name) => join(SEF_DIR, `${name}.sef.json`),
  DOMParserImpl: XmldomParser,
};

test('UBL valide: 0 Fehler auf beiden Ebenen', async () => {
  const r = await validateInvoice(generateUblInvoice(SAMPLE_STANDARD), opts);
  assert.equal(r.syntax, 'ubl');
  assert.equal(r.isXRechnung, true);
  assert.equal(r.layers.length, 2);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.slice(0, 2)));
});

test('CII valide (Kleinunternehmer): 0 Fehler', async () => {
  const r = await validateInvoice(generateCiiInvoice(SAMPLE_KLEINUNTERNEHMER), opts);
  assert.equal(r.syntax, 'cii');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.slice(0, 2)));
});

test('UBL ohne Rechnungsnummer: BR-02 wird gefunden', async () => {
  const broken = generateUblInvoice(SAMPLE_STANDARD).replace(/<cbc:ID>RE-2026-0042<\/cbc:ID>/, '');
  const r = await validateInvoice(broken, opts);
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some((f) => f.id.includes('BR-02') || f.text.includes('BT-1')), JSON.stringify(r.errors[0]));
});

test('UBL ohne BuyerReference: BR-DE-15 aus der deutschen Ebene', async () => {
  const broken = generateUblInvoice(SAMPLE_STANDARD).replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '');
  const r = await validateInvoice(broken, opts);
  assert.ok(r.errors.some((f) => f.id.includes('BR-DE-15')), JSON.stringify(r.errors.map((e) => e.id)));
});

test('CII mit falscher Summe: Rechenregel schlägt an', async () => {
  const broken = generateCiiInvoice(SAMPLE_STANDARD).replace('<ram:DuePayableAmount>1392.18</ram:DuePayableAmount>', '<ram:DuePayableAmount>999.99</ram:DuePayableAmount>');
  const r = await validateInvoice(broken, opts);
  assert.ok(r.errors.length > 0, 'Summenfehler muss erkannt werden');
});

test('EN-Profil (ZUGFeRD) prüft nur EN-Ebene', async () => {
  const r = await validateInvoice(generateCiiInvoice(SAMPLE_STANDARD, 'zugferd'), opts);
  assert.equal(r.isXRechnung, false);
  assert.equal(r.layers.length, 1);
  assert.equal(r.errors.length, 0);
});

test('Fremdes XML wird abgelehnt', async () => {
  await assert.rejects(() => validateInvoice('<Quatsch/>', opts), /Kein E-Rechnungs-Dokument/);
});
