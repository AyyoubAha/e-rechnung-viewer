/**
 * E-Rechnungs-Parser: XRechnung/ZUGFeRD (UBL-Invoice, UBL-CreditNote, UN/CEFACT CII)
 * → gemeinsames Rechnungsmodell nach EN 16931 (BT-Referenzen in Kommentaren).
 *
 * Läuft im Browser (DOMParser) und in Node (mit @xmldom/xmldom im Test).
 * Bewusst namespace-tolerant: Matching über localName, da Präfixe variieren.
 */

// ---------- kleine DOM-Helfer ----------

function children(el, name) {
  const out = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n.localName === name || n.nodeName.split(':').pop() === name)) out.push(n);
  }
  return out;
}

// Pfad wie 'a/b/c' → erstes Element entlang der Kette
function q(el, path) {
  let cur = el;
  for (const part of path.split('/')) {
    if (!cur) return null;
    cur = children(cur, part)[0] || null;
  }
  return cur;
}

function qa(el, path) {
  const parts = path.split('/');
  const last = parts.pop();
  const parent = parts.length ? q(el, parts.join('/')) : el;
  return parent ? children(parent, last) : [];
}

function text(el, path) {
  const n = path ? q(el, path) : el;
  if (!n) return null;
  const t = (n.textContent || '').trim();
  return t === '' ? null : t;
}

function num(el, path) {
  const t = text(el, path);
  if (t == null) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function attr(el, path, name) {
  const n = path ? q(el, path) : el;
  return n && n.getAttribute ? n.getAttribute(name) : null;
}

// CII-Datum: udt:DateTimeString @format=102 → JJJJMMTT
function ciiDate(el, path) {
  const n = q(el, path);
  if (!n) return null;
  const raw = (n.textContent || '').trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw || null;
}

// ---------- gemeinsames Modell ----------

function emptyInvoice() {
  return {
    syntax: null,              // 'UBL' | 'CII'
    docType: 'Rechnung',       // Rechnung | Gutschrift (BT-3)
    profile: null,             // CustomizationID / Guideline (BT-24)
    number: null,              // BT-1
    issueDate: null,           // BT-2
    dueDate: null,             // BT-9
    currency: null,            // BT-5
    buyerReference: null,      // BT-10 (Leitweg-ID)
    orderReference: null,      // BT-13
    notes: [],                 // BT-22
    seller: emptyParty(),      // BG-4
    buyer: emptyParty(),       // BG-7
    payment: { meansCode: null, meansText: null, iban: null, bic: null, accountName: null, reference: null, terms: null }, // BG-16/17, BT-20
    lines: [],                 // BG-25
    vatBreakdown: [],          // BG-23
    totals: {                  // BG-22
      lineTotal: null,         // BT-106
      allowanceTotal: null,    // BT-107
      chargeTotal: null,       // BT-108
      netTotal: null,          // BT-109
      taxTotal: null,          // BT-110
      grossTotal: null,        // BT-112
      prepaid: null,           // BT-113
      duePayable: null,        // BT-115
    },
    warnings: [],
  };
}

function emptyParty() {
  return { name: null, vatId: null, taxNumber: null, street: null, city: null, postcode: null, country: null, email: null, contact: null, phone: null };
}

const DOC_TYPE = (code) => {
  const map = { '380': 'Rechnung', '381': 'Gutschrift', '384': 'Rechnungskorrektur', '389': 'Selbstfakturierte Rechnung', '326': 'Teilrechnung', '875': 'Abschlagsrechnung (Bau)', '876': 'Teilschlussrechnung (Bau)', '877': 'Schlussrechnung (Bau)' };
  return map[code] || (code ? `Dokument (Code ${code})` : 'Rechnung');
};

// ---------- UBL ----------

function parseUbl(root) {
  const inv = emptyInvoice();
  inv.syntax = 'UBL';
  const isCredit = root.localName === 'CreditNote' || root.nodeName.split(':').pop() === 'CreditNote';
  const LINE = isCredit ? 'CreditNoteLine' : 'InvoiceLine';
  const QTY = isCredit ? 'CreditedQuantity' : 'InvoicedQuantity';

  inv.profile = text(root, 'CustomizationID');
  inv.number = text(root, 'ID');
  inv.issueDate = text(root, 'IssueDate');
  inv.dueDate = text(root, 'DueDate');
  inv.docType = isCredit ? 'Gutschrift' : DOC_TYPE(text(root, 'InvoiceTypeCode'));
  inv.currency = text(root, 'DocumentCurrencyCode');
  inv.buyerReference = text(root, 'BuyerReference');
  inv.orderReference = text(root, 'OrderReference/ID');
  inv.notes = qa(root, 'Note').map((n) => (n.textContent || '').trim()).filter(Boolean);

  inv.seller = parseUblParty(q(root, 'AccountingSupplierParty/Party'));
  inv.buyer = parseUblParty(q(root, 'AccountingCustomerParty/Party'));

  const pm = q(root, 'PaymentMeans');
  if (pm) {
    inv.payment.meansCode = text(pm, 'PaymentMeansCode');
    inv.payment.reference = text(pm, 'PaymentID');
    inv.payment.iban = text(pm, 'PayeeFinancialAccount/ID');
    inv.payment.accountName = text(pm, 'PayeeFinancialAccount/Name');
    inv.payment.bic = text(pm, 'PayeeFinancialAccount/FinancialInstitutionBranch/ID');
  }
  inv.payment.terms = text(root, 'PaymentTerms/Note');
  if (!inv.dueDate) inv.dueDate = text(root, 'PaymentMeans/PaymentDueDate');

  for (const cat of qa(root, 'TaxTotal/TaxSubtotal')) {
    inv.vatBreakdown.push({
      taxable: num(cat, 'TaxableAmount'),
      tax: num(cat, 'TaxAmount'),
      category: text(cat, 'TaxCategory/ID'),
      rate: num(cat, 'TaxCategory/Percent'),
      exemptionReason: text(cat, 'TaxCategory/TaxExemptionReason'),
    });
  }
  const tt = q(root, 'TaxTotal');
  inv.totals.taxTotal = tt ? num(tt, 'TaxAmount') : null;

  const lmt = q(root, 'LegalMonetaryTotal');
  if (lmt) {
    inv.totals.lineTotal = num(lmt, 'LineExtensionAmount');
    inv.totals.allowanceTotal = num(lmt, 'AllowanceTotalAmount');
    inv.totals.chargeTotal = num(lmt, 'ChargeTotalAmount');
    inv.totals.netTotal = num(lmt, 'TaxExclusiveAmount');
    inv.totals.grossTotal = num(lmt, 'TaxInclusiveAmount');
    inv.totals.prepaid = num(lmt, 'PrepaidAmount');
    inv.totals.duePayable = num(lmt, 'PayableAmount');
  }

  for (const line of qa(root, LINE)) {
    inv.lines.push({
      id: text(line, 'ID'),
      name: text(line, 'Item/Name'),
      description: text(line, 'Item/Description'),
      quantity: num(line, QTY),
      unit: attr(line, QTY, 'unitCode'),
      unitPrice: num(line, 'Price/PriceAmount'),
      lineTotal: num(line, 'LineExtensionAmount'),
      vatRate: num(line, 'Item/ClassifiedTaxCategory/Percent'),
      note: text(line, 'Note'),
    });
  }
  return inv;
}

function parseUblParty(p) {
  const party = emptyParty();
  if (!p) return party;
  party.name = text(p, 'PartyLegalEntity/RegistrationName') || text(p, 'PartyName/Name');
  for (const pts of qa(p, 'PartyTaxScheme')) {
    const scheme = text(pts, 'TaxScheme/ID');
    const id = text(pts, 'CompanyID');
    if (scheme === 'VAT') party.vatId = id; else if (id) party.taxNumber = id;
  }
  const addr = q(p, 'PostalAddress');
  if (addr) {
    party.street = [text(addr, 'StreetName'), text(addr, 'AdditionalStreetName')].filter(Boolean).join(', ') || null;
    party.city = text(addr, 'CityName');
    party.postcode = text(addr, 'PostalZone');
    party.country = text(addr, 'Country/IdentificationCode');
  }
  const c = q(p, 'Contact');
  if (c) {
    party.contact = text(c, 'Name');
    party.email = text(c, 'ElectronicMail');
    party.phone = text(c, 'Telephone');
  }
  return party;
}

// ---------- CII (ZUGFeRD / Factur-X / XRechnung-CII) ----------

function parseCii(root) {
  const inv = emptyInvoice();
  inv.syntax = 'CII';

  const doc = q(root, 'ExchangedDocument');
  inv.number = doc ? text(doc, 'ID') : null;
  inv.docType = DOC_TYPE(doc ? text(doc, 'TypeCode') : null);
  inv.issueDate = doc ? ciiDate(doc, 'IssueDateTime/DateTimeString') : null;
  if (doc) inv.notes = qa(doc, 'IncludedNote').map((n) => text(n, 'Content')).filter(Boolean);

  inv.profile = text(root, 'ExchangedDocumentContext/GuidelineSpecifiedDocumentContextParameter/ID');

  const trans = q(root, 'SupplyChainTradeTransaction');
  if (!trans) { inv.warnings.push('SupplyChainTradeTransaction fehlt'); return inv; }

  const agreement = q(trans, 'ApplicableHeaderTradeAgreement');
  if (agreement) {
    inv.buyerReference = text(agreement, 'BuyerReference');
    inv.orderReference = text(agreement, 'BuyerOrderReferencedDocument/IssuerAssignedID');
    inv.seller = parseCiiParty(q(agreement, 'SellerTradeParty'));
    inv.buyer = parseCiiParty(q(agreement, 'BuyerTradeParty'));
  }

  const settlement = q(trans, 'ApplicableHeaderTradeSettlement');
  if (settlement) {
    inv.currency = text(settlement, 'InvoiceCurrencyCode');
    inv.payment.reference = text(settlement, 'PaymentReference');
    const pm = q(settlement, 'SpecifiedTradeSettlementPaymentMeans');
    if (pm) {
      inv.payment.meansCode = text(pm, 'TypeCode');
      inv.payment.meansText = text(pm, 'Information');
      inv.payment.iban = text(pm, 'PayeePartyCreditorFinancialAccount/IBANID');
      inv.payment.accountName = text(pm, 'PayeePartyCreditorFinancialAccount/AccountName');
      inv.payment.bic = text(pm, 'PayeeSpecifiedCreditorFinancialInstitution/BICID');
    }
    const terms = q(settlement, 'SpecifiedTradePaymentTerms');
    if (terms) {
      inv.payment.terms = text(terms, 'Description');
      inv.dueDate = ciiDate(terms, 'DueDateDateTime/DateTimeString');
    }
    for (const t of qa(settlement, 'ApplicableTradeTax')) {
      inv.vatBreakdown.push({
        taxable: num(t, 'BasisAmount'),
        tax: num(t, 'CalculatedAmount'),
        category: text(t, 'CategoryCode'),
        rate: num(t, 'RateApplicablePercent'),
        exemptionReason: text(t, 'ExemptionReason'),
      });
    }
    const sums = q(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    if (sums) {
      inv.totals.lineTotal = num(sums, 'LineTotalAmount');
      inv.totals.allowanceTotal = num(sums, 'AllowanceTotalAmount');
      inv.totals.chargeTotal = num(sums, 'ChargeTotalAmount');
      inv.totals.netTotal = num(sums, 'TaxBasisTotalAmount');
      inv.totals.taxTotal = num(sums, 'TaxTotalAmount');
      inv.totals.grossTotal = num(sums, 'GrandTotalAmount');
      inv.totals.prepaid = num(sums, 'TotalPrepaidAmount');
      inv.totals.duePayable = num(sums, 'DuePayableAmount');
    }
  }

  for (const li of qa(trans, 'IncludedSupplyChainTradeLineItem')) {
    const qty = q(li, 'SpecifiedLineTradeDelivery/BilledQuantity');
    inv.lines.push({
      id: text(li, 'AssociatedDocumentLineDocument/LineID'),
      name: text(li, 'SpecifiedTradeProduct/Name'),
      description: text(li, 'SpecifiedTradeProduct/Description'),
      quantity: qty ? num(qty, '') : null,
      unit: qty ? attr(qty, '', 'unitCode') : null,
      unitPrice: num(li, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount'),
      lineTotal: num(li, 'SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount'),
      vatRate: num(li, 'SpecifiedLineTradeSettlement/ApplicableTradeTax/RateApplicablePercent'),
      note: null,
    });
  }
  return inv;
}

function parseCiiParty(p) {
  const party = emptyParty();
  if (!p) return party;
  party.name = text(p, 'Name');
  for (const reg of qa(p, 'SpecifiedTaxRegistration')) {
    const idEl = q(reg, 'ID');
    const scheme = idEl && idEl.getAttribute ? idEl.getAttribute('schemeID') : null;
    const val = idEl ? (idEl.textContent || '').trim() : null;
    if (scheme === 'VA') party.vatId = val; else if (scheme === 'FC') party.taxNumber = val;
  }
  const addr = q(p, 'PostalTradeAddress');
  if (addr) {
    party.street = [text(addr, 'LineOne'), text(addr, 'LineTwo')].filter(Boolean).join(', ') || null;
    party.city = text(addr, 'CityName');
    party.postcode = text(addr, 'PostcodeCode');
    party.country = text(addr, 'CountryID');
  }
  const c = q(p, 'DefinedTradeContact');
  if (c) {
    party.contact = text(c, 'PersonName') || text(c, 'DepartmentName');
    party.email = text(c, 'EmailURIUniversalCommunication/URIID');
    party.phone = text(c, 'TelephoneUniversalCommunication/CompleteNumber');
  }
  if (!party.email) party.email = text(p, 'URIUniversalCommunication/URIID');
  return party;
}

// ---------- Plausibilitäts-Checks (kein Ersatz für Schematron-Validierung) ----------

function plausibilityChecks(inv) {
  const w = inv.warnings;
  const missing = [];
  if (!inv.number) missing.push('Rechnungsnummer (BT-1)');
  if (!inv.issueDate) missing.push('Rechnungsdatum (BT-2)');
  if (!inv.seller.name) missing.push('Verkäufername (BT-27)');
  if (!inv.buyer.name) missing.push('Käufername (BT-44)');
  if (!inv.currency) missing.push('Währung (BT-5)');
  if (inv.totals.duePayable == null) missing.push('Fälliger Betrag (BT-115)');
  if (missing.length) w.push(`Pflichtangaben fehlen oder unlesbar: ${missing.join(', ')}`);

  const t = inv.totals;
  const close = (a, b) => a != null && b != null && Math.abs(a - b) < 0.011;
  if (t.netTotal != null && t.taxTotal != null && t.grossTotal != null && !close(t.netTotal + t.taxTotal, t.grossTotal)) {
    w.push(`Summenprüfung: Netto (${t.netTotal}) + USt (${t.taxTotal}) ≠ Brutto (${t.grossTotal})`);
  }
  if (inv.lines.length) {
    const sum = inv.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    if (t.lineTotal != null && !close(sum, t.lineTotal)) {
      w.push(`Summenprüfung: Positionssumme (${sum.toFixed(2)}) ≠ ausgewiesene Positionssumme (${t.lineTotal})`);
    }
  }
  if (!inv.seller.vatId && !inv.seller.taxNumber) {
    w.push('Weder USt-IdNr. noch Steuernummer des Verkäufers angegeben (BT-31/BT-32)');
  }
  return inv;
}

// ---------- Einstieg ----------

/** Erkennt Syntax anhand des Wurzelelements und parst. Erwartet ein XML-Document. */
export function parseInvoiceDocument(xmlDoc) {
  const root = xmlDoc.documentElement;
  if (!root) throw new Error('Leeres XML-Dokument');
  const local = root.localName || root.nodeName.split(':').pop();
  let inv;
  if (local === 'CrossIndustryInvoice') inv = parseCii(root);
  else if (local === 'Invoice' || local === 'CreditNote') inv = parseUbl(root);
  else throw new Error(`Unbekanntes Wurzelelement: ${local} — keine XRechnung/ZUGFeRD-Datei?`);
  return plausibilityChecks(inv);
}

/** Browser-Komfort: nimmt XML-String, nutzt globalen DOMParser. */
export function parseInvoiceXml(xmlString, DOMParserImpl) {
  const P = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!P) throw new Error('Kein DOMParser verfügbar');
  const doc = new P().parseFromString(xmlString, 'application/xml');
  const err = doc.getElementsByTagName('parsererror');
  if (err && err.length) throw new Error('XML ist nicht wohlgeformt');
  return parseInvoiceDocument(doc);
}
