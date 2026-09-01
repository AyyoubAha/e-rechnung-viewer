/**
 * XRechnung-Generator: Rechnungsdaten → UBL-Invoice-XML (XRechnung 3.0, EN 16931).
 * Gegenstück zu invoice-parser.mjs (symmetrisches Datenmodell).
 *
 * Erzeugt Rechnungen mit USt-Kategorien:
 *  - "S":  Regelbesteuerung (Prozentsatz > 0, z. B. 19 / 7)
 *  - "E":  steuerbefreit mit Begründung (z. B. Kleinunternehmer § 19 UStG)
 * Zahlung: SEPA-Überweisung (Code 58) bei IBAN, sonst Überweisung (30).
 *
 * Designziel: Ausgabe besteht die offizielle KoSIT-Validierung (Schematron XRechnung 3.0.x).
 * Die Testsuite validiert generierte Beispiele mit dem offiziellen Validator (test/validate-kosit.mjs).
 */

const CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n) => r2(n).toFixed(2);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/**
 * @typedef {Object} InvoiceInput
 * Pflicht: number, issueDate, currency?, buyerReference, seller{...}, buyer{...}, lines[...]
 * seller: name, street, postcode, city, countryCode?, vatId und/oder taxNumber,
 *         email (BT-34/BT-43), contactName (BT-41), phone (BT-42)
 * buyer:  name, street, postcode, city, countryCode?, email?
 * lines:  name, quantity, unit?, unitPrice, vatRate (bei taxCategory "S"), description?
 * Zahlung: iban?, bic?, accountName?, paymentReference?, paymentTerms? oder dueDate
 * Steuer:  taxCategory? ("S" default | "E"), exemptionReason? (Pflicht bei "E")
 */

export function validateInvoiceInput(inv) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };

  need(inv && typeof inv === 'object', 'Rechnungsobjekt fehlt');
  if (!inv) return errs;

  need(inv.number, 'Rechnungsnummer fehlt (BT-1)');
  need(isDate(inv.issueDate), `Rechnungsdatum fehlt oder nicht im Format JJJJ-MM-TT (BT-2): "${inv.issueDate ?? ''}"`);
  if (inv.dueDate) need(isDate(inv.dueDate), 'Fälligkeitsdatum nicht im Format JJJJ-MM-TT (BT-9)');
  need(inv.buyerReference, 'Käufer-Referenz fehlt (BT-10; bei Behörden die Leitweg-ID, sonst z. B. Kundennummer oder E-Mail des Empfängers): Pflicht in XRechnung (BR-DE-15)');

  const s = inv.seller || {};
  need(s.name, 'Verkäufer: Name fehlt (BT-27)');
  need(s.street, 'Verkäufer: Straße fehlt (BR-DE-3)');
  need(s.postcode, 'Verkäufer: PLZ fehlt (BR-DE-4)');
  need(s.city, 'Verkäufer: Ort fehlt (BR-DE-2)');
  need(s.vatId || s.taxNumber, 'Verkäufer: USt-IdNr. (BT-31) oder Steuernummer (BT-32) fehlt (BR-DE-16)');
  need(s.email, 'Verkäufer: E-Mail fehlt (elektronische Adresse BT-34 und Kontakt BT-43)');
  need(s.contactName, 'Verkäufer: Ansprechpartner fehlt (BT-41, BR-DE-5)');
  need(s.phone, 'Verkäufer: Telefonnummer fehlt (BT-42, BR-DE-6)');

  const b = inv.buyer || {};
  need(b.name, 'Käufer: Name fehlt (BT-44)');
  need(b.street, 'Käufer: Straße fehlt (BR-DE-10)');
  need(b.postcode, 'Käufer: PLZ fehlt (BR-DE-9)');
  need(b.city, 'Käufer: Ort fehlt (BR-DE-8)');

  const cat = inv.taxCategory || 'S';
  need(cat === 'S' || cat === 'E', `Steuerkategorie "${cat}" wird nicht unterstützt (nur S = Regelbesteuerung, E = steuerbefreit)`);
  if (cat === 'E') need(inv.exemptionReason, 'Befreiungsgrund fehlt (BT-121/BT-120), z. B. "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."');

  need(Array.isArray(inv.lines) && inv.lines.length > 0, 'Mindestens eine Rechnungsposition nötig (BG-25)');
  (inv.lines || []).forEach((l, i) => {
    const p = `Position ${i + 1}: `;
    need(l.name, p + 'Bezeichnung fehlt (BT-153)');
    need(Number.isFinite(Number(l.quantity)), p + 'Menge fehlt/ungültig (BT-129)');
    need(Number.isFinite(Number(l.unitPrice)), p + 'Einzelpreis fehlt/ungültig (BT-146)');
    need(Number(l.unitPrice) >= 0, p + 'Einzelpreis darf nicht negativ sein (BR-27)');
    if (cat === 'S') need(Number.isFinite(Number(l.vatRate)) && Number(l.vatRate) > 0, p + 'USt-Satz fehlt/ungültig (BT-152), z. B. 19 oder 7');
  });

  if (!inv.dueDate && !inv.paymentTerms) errs.push('Fälligkeitsdatum (BT-9) ODER Zahlungsbedingungen (BT-20) angeben (BR-CO-25)');
  if (inv.iban) need(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(String(inv.iban).replace(/\s+/g, '').toUpperCase()), 'IBAN sieht ungültig aus (BT-84)');
  return errs;
}

/** Berechnet Positionssummen, USt-Aufschlüsselung und Endsummen. */
export function computeTotals(inv) {
  const cat = inv.taxCategory || 'S';
  const lines = inv.lines.map((l) => {
    const qty = Number(l.quantity);
    const price = Number(l.unitPrice);
    const lineTotal = l.lineTotal != null ? r2(Number(l.lineTotal)) : r2(qty * price);
    const rate = cat === 'S' ? Number(l.vatRate) : 0;
    return { ...l, quantity: qty, unitPrice: price, lineTotal, rate };
  });

  const byRate = new Map();
  for (const l of lines) {
    const key = cat === 'S' ? l.rate : 'E';
    const e = byRate.get(key) || { category: cat, rate: cat === 'S' ? l.rate : 0, taxable: 0 };
    e.taxable = r2(e.taxable + l.lineTotal);
    byRate.set(key, e);
  }
  const vat = [...byRate.values()].map((e) => ({
    ...e,
    tax: cat === 'S' ? r2(e.taxable * e.rate / 100) : 0,
    exemptionReason: cat === 'E' ? inv.exemptionReason : undefined,
  })).sort((a, b) => b.rate - a.rate);

  const lineTotalSum = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const taxTotal = r2(vat.reduce((s, v) => s + v.tax, 0));
  const net = lineTotalSum;
  const gross = r2(net + taxTotal);
  const prepaid = inv.prepaid != null ? r2(Number(inv.prepaid)) : 0;
  const payable = r2(gross - prepaid);
  return { lines, vat, lineTotalSum, net, taxTotal, gross, prepaid, payable };
}

/** Erzeugt XRechnung-UBL-XML. Wirft Error mit allen Eingabefehlern, wenn Eingabe unvollständig. */
export function generateUblInvoice(inv) {
  const errs = validateInvoiceInput(inv);
  if (errs.length) {
    const e = new Error('Eingabe unvollständig:\n- ' + errs.join('\n- '));
    e.inputErrors = errs;
    throw e;
  }
  const cur = inv.currency || 'EUR';
  const cat = inv.taxCategory || 'S';
  const t = computeTotals(inv);
  const s = inv.seller, b = inv.buyer;
  const sCountry = s.countryCode || 'DE', bCountry = b.countryCode || 'DE';
  const iban = inv.iban ? String(inv.iban).replace(/\s+/g, '').toUpperCase() : null;
  const meansCode = iban ? '58' : '30';
  const meansName = iban ? 'SEPA credit transfer' : 'Credit transfer';

  const x = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
  x.push('             xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
  x.push('             xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">');
  x.push(`  <cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>`);
  x.push(`  <cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>`);
  x.push(`  <cbc:ID>${esc(inv.number)}</cbc:ID>`);
  x.push(`  <cbc:IssueDate>${inv.issueDate}</cbc:IssueDate>`);
  if (inv.dueDate) x.push(`  <cbc:DueDate>${inv.dueDate}</cbc:DueDate>`);
  x.push(`  <cbc:InvoiceTypeCode>${esc(inv.typeCode || '380')}</cbc:InvoiceTypeCode>`);
  if (inv.note) x.push(`  <cbc:Note>${esc(inv.note)}</cbc:Note>`);
  x.push(`  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>`);
  x.push(`  <cbc:BuyerReference>${esc(inv.buyerReference)}</cbc:BuyerReference>`);
  if (inv.orderReference) {
    x.push('  <cac:OrderReference>');
    x.push(`    <cbc:ID>${esc(inv.orderReference)}</cbc:ID>`);
    x.push('  </cac:OrderReference>');
  }

  // --- Verkäufer (BG-4) ---
  x.push('  <cac:AccountingSupplierParty>');
  x.push('    <cac:Party>');
  x.push(`      <cbc:EndpointID schemeID="EM">${esc(s.email)}</cbc:EndpointID>`);
  if (!s.vatId) {
    // BR-CO-26: ohne USt-IdNr. (BT-31) muss eine Verkäufer-Kennung (BT-29/BT-30) vorhanden sein
    // → Steuernummer zusätzlich als BT-29 ausgeben.
    x.push('      <cac:PartyIdentification>');
    x.push(`        <cbc:ID>${esc(s.taxNumber)}</cbc:ID>`);
    x.push('      </cac:PartyIdentification>');
  }
  x.push('      <cac:PostalAddress>');
  x.push(`        <cbc:StreetName>${esc(s.street)}</cbc:StreetName>`);
  x.push(`        <cbc:CityName>${esc(s.city)}</cbc:CityName>`);
  x.push(`        <cbc:PostalZone>${esc(s.postcode)}</cbc:PostalZone>`);
  x.push('        <cac:Country>');
  x.push(`          <cbc:IdentificationCode>${esc(sCountry)}</cbc:IdentificationCode>`);
  x.push('        </cac:Country>');
  x.push('      </cac:PostalAddress>');
  if (s.vatId) {
    x.push('      <cac:PartyTaxScheme>');
    x.push(`        <cbc:CompanyID>${esc(s.vatId)}</cbc:CompanyID>`);
    x.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    x.push('      </cac:PartyTaxScheme>');
  }
  if (s.taxNumber) {
    x.push('      <cac:PartyTaxScheme>');
    x.push(`        <cbc:CompanyID>${esc(s.taxNumber)}</cbc:CompanyID>`);
    x.push('        <cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme>');
    x.push('      </cac:PartyTaxScheme>');
  }
  x.push('      <cac:PartyLegalEntity>');
  x.push(`        <cbc:RegistrationName>${esc(s.name)}</cbc:RegistrationName>`);
  if (s.legalInfo) x.push(`        <cbc:CompanyLegalForm>${esc(s.legalInfo)}</cbc:CompanyLegalForm>`);
  x.push('      </cac:PartyLegalEntity>');
  x.push('      <cac:Contact>');
  x.push(`        <cbc:Name>${esc(s.contactName)}</cbc:Name>`);
  x.push(`        <cbc:Telephone>${esc(s.phone)}</cbc:Telephone>`);
  x.push(`        <cbc:ElectronicMail>${esc(s.email)}</cbc:ElectronicMail>`);
  x.push('      </cac:Contact>');
  x.push('    </cac:Party>');
  x.push('  </cac:AccountingSupplierParty>');

  // --- Käufer (BG-7) ---
  x.push('  <cac:AccountingCustomerParty>');
  x.push('    <cac:Party>');
  x.push(`      <cbc:EndpointID schemeID="EM">${esc(b.email || s.email)}</cbc:EndpointID>`);
  x.push('      <cac:PostalAddress>');
  x.push(`        <cbc:StreetName>${esc(b.street)}</cbc:StreetName>`);
  x.push(`        <cbc:CityName>${esc(b.city)}</cbc:CityName>`);
  x.push(`        <cbc:PostalZone>${esc(b.postcode)}</cbc:PostalZone>`);
  x.push('        <cac:Country>');
  x.push(`          <cbc:IdentificationCode>${esc(bCountry)}</cbc:IdentificationCode>`);
  x.push('        </cac:Country>');
  x.push('      </cac:PostalAddress>');
  if (b.vatId) {
    x.push('      <cac:PartyTaxScheme>');
    x.push(`        <cbc:CompanyID>${esc(b.vatId)}</cbc:CompanyID>`);
    x.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    x.push('      </cac:PartyTaxScheme>');
  }
  x.push('      <cac:PartyLegalEntity>');
  x.push(`        <cbc:RegistrationName>${esc(b.name)}</cbc:RegistrationName>`);
  x.push('      </cac:PartyLegalEntity>');
  x.push('    </cac:Party>');
  x.push('  </cac:AccountingCustomerParty>');

  // --- Lieferung: Liefer-/Leistungsdatum (BT-72; Default: Rechnungsdatum) ---
  x.push('  <cac:Delivery>');
  x.push(`    <cbc:ActualDeliveryDate>${inv.deliveryDate || inv.issueDate}</cbc:ActualDeliveryDate>`);
  x.push('  </cac:Delivery>');

  // --- Zahlung (BG-16, BR-DE-1) ---
  x.push('  <cac:PaymentMeans>');
  x.push(`    <cbc:PaymentMeansCode name="${meansName}">${meansCode}</cbc:PaymentMeansCode>`);
  if (inv.paymentReference) x.push(`    <cbc:PaymentID>${esc(inv.paymentReference)}</cbc:PaymentID>`);
  if (iban) {
    x.push('    <cac:PayeeFinancialAccount>');
    x.push(`      <cbc:ID>${esc(iban)}</cbc:ID>`);
    if (inv.accountName) x.push(`      <cbc:Name>${esc(inv.accountName)}</cbc:Name>`);
    if (inv.bic) {
      x.push('      <cac:FinancialInstitutionBranch>');
      x.push(`        <cbc:ID>${esc(inv.bic)}</cbc:ID>`);
      x.push('      </cac:FinancialInstitutionBranch>');
    }
    x.push('    </cac:PayeeFinancialAccount>');
  }
  x.push('  </cac:PaymentMeans>');
  if (inv.paymentTerms) {
    x.push('  <cac:PaymentTerms>');
    x.push(`    <cbc:Note>${esc(inv.paymentTerms)}</cbc:Note>`);
    x.push('  </cac:PaymentTerms>');
  }

  // --- USt (BG-22/23) ---
  x.push('  <cac:TaxTotal>');
  x.push(`    <cbc:TaxAmount currencyID="${cur}">${money(t.taxTotal)}</cbc:TaxAmount>`);
  for (const v of t.vat) {
    x.push('    <cac:TaxSubtotal>');
    x.push(`      <cbc:TaxableAmount currencyID="${cur}">${money(v.taxable)}</cbc:TaxableAmount>`);
    x.push(`      <cbc:TaxAmount currencyID="${cur}">${money(v.tax)}</cbc:TaxAmount>`);
    x.push('      <cac:TaxCategory>');
    x.push(`        <cbc:ID>${v.category}</cbc:ID>`);
    x.push(`        <cbc:Percent>${v.rate}</cbc:Percent>`);
    if (v.exemptionReason) x.push(`        <cbc:TaxExemptionReason>${esc(v.exemptionReason)}</cbc:TaxExemptionReason>`);
    x.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    x.push('      </cac:TaxCategory>');
    x.push('    </cac:TaxSubtotal>');
  }
  x.push('  </cac:TaxTotal>');
  x.push('  <cac:LegalMonetaryTotal>');
  x.push(`    <cbc:LineExtensionAmount currencyID="${cur}">${money(t.lineTotalSum)}</cbc:LineExtensionAmount>`);
  x.push(`    <cbc:TaxExclusiveAmount currencyID="${cur}">${money(t.net)}</cbc:TaxExclusiveAmount>`);
  x.push(`    <cbc:TaxInclusiveAmount currencyID="${cur}">${money(t.gross)}</cbc:TaxInclusiveAmount>`);
  if (t.prepaid) x.push(`    <cbc:PrepaidAmount currencyID="${cur}">${money(t.prepaid)}</cbc:PrepaidAmount>`);
  x.push(`    <cbc:PayableAmount currencyID="${cur}">${money(t.payable)}</cbc:PayableAmount>`);
  x.push('  </cac:LegalMonetaryTotal>');

  // --- Positionen (BG-25) ---
  t.lines.forEach((l, i) => {
    x.push('  <cac:InvoiceLine>');
    x.push(`    <cbc:ID>${esc(l.id || String(i + 1))}</cbc:ID>`);
    x.push(`    <cbc:InvoicedQuantity unitCode="${esc(l.unit || 'C62')}">${l.quantity}</cbc:InvoicedQuantity>`);
    x.push(`    <cbc:LineExtensionAmount currencyID="${cur}">${money(l.lineTotal)}</cbc:LineExtensionAmount>`);
    x.push('    <cac:Item>');
    if (l.description) x.push(`      <cbc:Description>${esc(l.description)}</cbc:Description>`);
    x.push(`      <cbc:Name>${esc(l.name)}</cbc:Name>`);
    x.push('      <cac:ClassifiedTaxCategory>');
    x.push(`        <cbc:ID>${cat}</cbc:ID>`);
    x.push(`        <cbc:Percent>${cat === 'S' ? l.rate : 0}</cbc:Percent>`);
    x.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    x.push('      </cac:ClassifiedTaxCategory>');
    x.push('    </cac:Item>');
    x.push('    <cac:Price>');
    x.push(`      <cbc:PriceAmount currencyID="${cur}">${l.unitPrice}</cbc:PriceAmount>`);
    x.push('    </cac:Price>');
    x.push('  </cac:InvoiceLine>');
  });

  x.push('</ubl:Invoice>');
  return x.join('\n');
}
