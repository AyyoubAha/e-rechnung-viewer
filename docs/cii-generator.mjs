/**
 * CII-Generator: Rechnungsdaten → UN/CEFACT CrossIndustryInvoice (CII).
 * Zweite E-Rechnungs-Syntax neben UBL (ubl-generator.mjs); Grundlage für ZUGFeRD/Factur-X,
 * denn dort MUSS das eingebettete XML CII sein.
 *
 * Profile:
 *  - 'xrechnung' (Default): XRechnung-3.0-CIUS (für reine XML-Rechnungen an Behörden/Firmen)
 *  - 'zugferd'  : EN-16931-Profil (Guideline urn:cen.eu:en16931:2017) für Factur-X/ZUGFeRD-PDFs
 *
 * Nutzt dasselbe Eingabemodell + Validierung + Summenlogik wie der UBL-Generator.
 * Qualitäts-Schranke: test/validate-kosit.mjs prüft die XRechnung-Ausgabe mit dem offiziellen
 * KoSIT-Validator; die ZUGFeRD-Ausgabe wird über Mustang (PDF-Ebene) geprüft.
 */

import { validateInvoiceInput, computeTotals } from './ubl-generator.mjs';

const GUIDELINES = {
  xrechnung: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  zugferd: 'urn:cen.eu:en16931:2017',
};
const BUSINESS_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n) => r2(n).toFixed(2);
const dt102 = (iso) => iso.replace(/-/g, '');

export function generateCiiInvoice(inv, profile = 'xrechnung') {
  const errs = validateInvoiceInput(inv);
  if (errs.length) {
    const e = new Error('Eingabe unvollständig:\n- ' + errs.join('\n- '));
    e.inputErrors = errs;
    throw e;
  }
  if (!GUIDELINES[profile]) throw new Error(`Unbekanntes Profil: ${profile}`);

  const cur = inv.currency || 'EUR';
  const cat = inv.taxCategory || 'S';
  const t = computeTotals(inv);
  const s = inv.seller, b = inv.buyer;
  const iban = inv.iban ? String(inv.iban).replace(/\s+/g, '').toUpperCase() : null;

  const x = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
  x.push('                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"');
  x.push('                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">');

  // --- Kontext (BG-2) ---
  x.push('  <rsm:ExchangedDocumentContext>');
  if (profile === 'xrechnung') {
    x.push('    <ram:BusinessProcessSpecifiedDocumentContextParameter>');
    x.push(`      <ram:ID>${BUSINESS_PROCESS}</ram:ID>`);
    x.push('    </ram:BusinessProcessSpecifiedDocumentContextParameter>');
  }
  x.push('    <ram:GuidelineSpecifiedDocumentContextParameter>');
  x.push(`      <ram:ID>${GUIDELINES[profile]}</ram:ID>`);
  x.push('    </ram:GuidelineSpecifiedDocumentContextParameter>');
  x.push('  </rsm:ExchangedDocumentContext>');

  // --- Dokument (BT-1..3, BT-22) ---
  x.push('  <rsm:ExchangedDocument>');
  x.push(`    <ram:ID>${esc(inv.number)}</ram:ID>`);
  x.push(`    <ram:TypeCode>${esc(inv.typeCode || '380')}</ram:TypeCode>`);
  x.push('    <ram:IssueDateTime>');
  x.push(`      <udt:DateTimeString format="102">${dt102(inv.issueDate)}</udt:DateTimeString>`);
  x.push('    </ram:IssueDateTime>');
  if (inv.note) {
    x.push('    <ram:IncludedNote>');
    x.push(`      <ram:Content>${esc(inv.note)}</ram:Content>`);
    x.push('    </ram:IncludedNote>');
  }
  x.push('  </rsm:ExchangedDocument>');

  x.push('  <rsm:SupplyChainTradeTransaction>');

  // --- Positionen (BG-25), in CII ZUERST ---
  t.lines.forEach((l, i) => {
    x.push('    <ram:IncludedSupplyChainTradeLineItem>');
    x.push('      <ram:AssociatedDocumentLineDocument>');
    x.push(`        <ram:LineID>${esc(l.id || String(i + 1))}</ram:LineID>`);
    x.push('      </ram:AssociatedDocumentLineDocument>');
    x.push('      <ram:SpecifiedTradeProduct>');
    x.push(`        <ram:Name>${esc(l.name)}</ram:Name>`);
    if (l.description) x.push(`        <ram:Description>${esc(l.description)}</ram:Description>`);
    x.push('      </ram:SpecifiedTradeProduct>');
    x.push('      <ram:SpecifiedLineTradeAgreement>');
    x.push('        <ram:NetPriceProductTradePrice>');
    x.push(`          <ram:ChargeAmount>${l.unitPrice}</ram:ChargeAmount>`);
    x.push('        </ram:NetPriceProductTradePrice>');
    x.push('      </ram:SpecifiedLineTradeAgreement>');
    x.push('      <ram:SpecifiedLineTradeDelivery>');
    x.push(`        <ram:BilledQuantity unitCode="${esc(l.unit || 'C62')}">${l.quantity}</ram:BilledQuantity>`);
    x.push('      </ram:SpecifiedLineTradeDelivery>');
    x.push('      <ram:SpecifiedLineTradeSettlement>');
    x.push('        <ram:ApplicableTradeTax>');
    x.push('          <ram:TypeCode>VAT</ram:TypeCode>');
    x.push(`          <ram:CategoryCode>${cat}</ram:CategoryCode>`);
    x.push(`          <ram:RateApplicablePercent>${cat === 'S' ? l.rate : 0}</ram:RateApplicablePercent>`);
    x.push('        </ram:ApplicableTradeTax>');
    x.push('        <ram:SpecifiedTradeSettlementLineMonetarySummation>');
    x.push(`          <ram:LineTotalAmount>${money(l.lineTotal)}</ram:LineTotalAmount>`);
    x.push('        </ram:SpecifiedTradeSettlementLineMonetarySummation>');
    x.push('      </ram:SpecifiedLineTradeSettlement>');
    x.push('    </ram:IncludedSupplyChainTradeLineItem>');
  });

  // --- Vereinbarung: Parteien (BG-4, BG-7) ---
  x.push('    <ram:ApplicableHeaderTradeAgreement>');
  x.push(`      <ram:BuyerReference>${esc(inv.buyerReference)}</ram:BuyerReference>`);
  x.push('      <ram:SellerTradeParty>');
  if (!s.vatId) x.push(`        <ram:ID>${esc(s.taxNumber)}</ram:ID>`);
  x.push(`        <ram:Name>${esc(s.name)}</ram:Name>`);
  if (s.legalInfo) {
    x.push('        <ram:SpecifiedLegalOrganization>');
    x.push(`          <ram:TradingBusinessName>${esc(s.legalInfo)}</ram:TradingBusinessName>`);
    x.push('        </ram:SpecifiedLegalOrganization>');
  }
  x.push('        <ram:DefinedTradeContact>');
  x.push(`          <ram:PersonName>${esc(s.contactName)}</ram:PersonName>`);
  x.push('          <ram:TelephoneUniversalCommunication>');
  x.push(`            <ram:CompleteNumber>${esc(s.phone)}</ram:CompleteNumber>`);
  x.push('          </ram:TelephoneUniversalCommunication>');
  x.push('          <ram:EmailURIUniversalCommunication>');
  x.push(`            <ram:URIID>${esc(s.email)}</ram:URIID>`);
  x.push('          </ram:EmailURIUniversalCommunication>');
  x.push('        </ram:DefinedTradeContact>');
  x.push('        <ram:PostalTradeAddress>');
  x.push(`          <ram:PostcodeCode>${esc(s.postcode)}</ram:PostcodeCode>`);
  x.push(`          <ram:LineOne>${esc(s.street)}</ram:LineOne>`);
  x.push(`          <ram:CityName>${esc(s.city)}</ram:CityName>`);
  x.push(`          <ram:CountryID>${esc(s.countryCode || 'DE')}</ram:CountryID>`);
  x.push('        </ram:PostalTradeAddress>');
  x.push(`        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(s.email)}</ram:URIID></ram:URIUniversalCommunication>`);
  if (s.vatId) {
    x.push('        <ram:SpecifiedTaxRegistration>');
    x.push(`          <ram:ID schemeID="VA">${esc(s.vatId)}</ram:ID>`);
    x.push('        </ram:SpecifiedTaxRegistration>');
  }
  if (s.taxNumber) {
    x.push('        <ram:SpecifiedTaxRegistration>');
    x.push(`          <ram:ID schemeID="FC">${esc(s.taxNumber)}</ram:ID>`);
    x.push('        </ram:SpecifiedTaxRegistration>');
  }
  x.push('      </ram:SellerTradeParty>');
  x.push('      <ram:BuyerTradeParty>');
  x.push(`        <ram:Name>${esc(b.name)}</ram:Name>`);
  x.push('        <ram:PostalTradeAddress>');
  x.push(`          <ram:PostcodeCode>${esc(b.postcode)}</ram:PostcodeCode>`);
  x.push(`          <ram:LineOne>${esc(b.street)}</ram:LineOne>`);
  x.push(`          <ram:CityName>${esc(b.city)}</ram:CityName>`);
  x.push(`          <ram:CountryID>${esc(b.countryCode || 'DE')}</ram:CountryID>`);
  x.push('        </ram:PostalTradeAddress>');
  x.push(`        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(b.email || s.email)}</ram:URIID></ram:URIUniversalCommunication>`);
  if (b.vatId) {
    x.push('        <ram:SpecifiedTaxRegistration>');
    x.push(`          <ram:ID schemeID="VA">${esc(b.vatId)}</ram:ID>`);
    x.push('        </ram:SpecifiedTaxRegistration>');
  }
  x.push('      </ram:BuyerTradeParty>');
  if (inv.orderReference) {
    x.push('      <ram:BuyerOrderReferencedDocument>');
    x.push(`        <ram:IssuerAssignedID>${esc(inv.orderReference)}</ram:IssuerAssignedID>`);
    x.push('      </ram:BuyerOrderReferencedDocument>');
  }
  x.push('    </ram:ApplicableHeaderTradeAgreement>');

  // --- Lieferung: Liefer-/Leistungsdatum (BT-72; Default: Rechnungsdatum) ---
  const deliveryDate = inv.deliveryDate || inv.issueDate;
  x.push('    <ram:ApplicableHeaderTradeDelivery>');
  x.push('      <ram:ActualDeliverySupplyChainEvent>');
  x.push('        <ram:OccurrenceDateTime>');
  x.push(`          <udt:DateTimeString format="102">${dt102(deliveryDate)}</udt:DateTimeString>`);
  x.push('        </ram:OccurrenceDateTime>');
  x.push('      </ram:ActualDeliverySupplyChainEvent>');
  x.push('    </ram:ApplicableHeaderTradeDelivery>');

  // --- Abrechnung (BG-16, BG-22, BG-23) ---
  x.push('    <ram:ApplicableHeaderTradeSettlement>');
  if (inv.paymentReference) x.push(`      <ram:PaymentReference>${esc(inv.paymentReference)}</ram:PaymentReference>`);
  x.push(`      <ram:InvoiceCurrencyCode>${esc(cur)}</ram:InvoiceCurrencyCode>`);
  x.push('      <ram:SpecifiedTradeSettlementPaymentMeans>');
  x.push(`        <ram:TypeCode>${iban ? '58' : '30'}</ram:TypeCode>`);
  if (iban) {
    x.push('        <ram:PayeePartyCreditorFinancialAccount>');
    x.push(`          <ram:IBANID>${esc(iban)}</ram:IBANID>`);
    if (inv.accountName) x.push(`          <ram:AccountName>${esc(inv.accountName)}</ram:AccountName>`);
    x.push('        </ram:PayeePartyCreditorFinancialAccount>');
    if (inv.bic) {
      x.push('        <ram:PayeeSpecifiedCreditorFinancialInstitution>');
      x.push(`          <ram:BICID>${esc(inv.bic)}</ram:BICID>`);
      x.push('        </ram:PayeeSpecifiedCreditorFinancialInstitution>');
    }
  }
  x.push('      </ram:SpecifiedTradeSettlementPaymentMeans>');
  for (const v of t.vat) {
    x.push('      <ram:ApplicableTradeTax>');
    x.push(`        <ram:CalculatedAmount>${money(v.tax)}</ram:CalculatedAmount>`);
    x.push('        <ram:TypeCode>VAT</ram:TypeCode>');
    if (v.exemptionReason) x.push(`        <ram:ExemptionReason>${esc(v.exemptionReason)}</ram:ExemptionReason>`);
    x.push(`        <ram:BasisAmount>${money(v.taxable)}</ram:BasisAmount>`);
    x.push(`        <ram:CategoryCode>${v.category}</ram:CategoryCode>`);
    x.push(`        <ram:RateApplicablePercent>${v.rate}</ram:RateApplicablePercent>`);
    x.push('      </ram:ApplicableTradeTax>');
  }
  if (inv.paymentTerms || inv.dueDate) {
    x.push('      <ram:SpecifiedTradePaymentTerms>');
    if (inv.paymentTerms) x.push(`        <ram:Description>${esc(inv.paymentTerms)}</ram:Description>`);
    if (inv.dueDate) {
      x.push('        <ram:DueDateDateTime>');
      x.push(`          <udt:DateTimeString format="102">${dt102(inv.dueDate)}</udt:DateTimeString>`);
      x.push('        </ram:DueDateDateTime>');
    }
    x.push('      </ram:SpecifiedTradePaymentTerms>');
  }
  x.push('      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  x.push(`        <ram:LineTotalAmount>${money(t.lineTotalSum)}</ram:LineTotalAmount>`);
  x.push(`        <ram:TaxBasisTotalAmount>${money(t.net)}</ram:TaxBasisTotalAmount>`);
  x.push(`        <ram:TaxTotalAmount currencyID="${esc(cur)}">${money(t.taxTotal)}</ram:TaxTotalAmount>`);
  x.push(`        <ram:GrandTotalAmount>${money(t.gross)}</ram:GrandTotalAmount>`);
  if (t.prepaid) x.push(`        <ram:TotalPrepaidAmount>${money(t.prepaid)}</ram:TotalPrepaidAmount>`);
  x.push(`        <ram:DuePayableAmount>${money(t.payable)}</ram:DuePayableAmount>`);
  x.push('      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  x.push('    </ram:ApplicableHeaderTradeSettlement>');

  x.push('  </rsm:SupplyChainTradeTransaction>');
  x.push('</rsm:CrossIndustryInvoice>');
  return x.join('\n');
}
