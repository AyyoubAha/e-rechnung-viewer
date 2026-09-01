/**
 * ZUGFeRD-/Factur-X-PDF-Builder: Rechnungsmodell → PDF/A-3 mit eingebettetem CII-XML
 * (Profil EN 16931, eingebettete Datei factur-x.xml).
 *
 * Umgebungsneutral: Aufrufer übergibt pdf-lib, fontkit und Binär-Assets.
 *   generateZugferdPdf(inv, { PDFLib, fontkit, fontRegular, fontBold, icc })  → Uint8Array
 *
 * Qualitäts-Schranke: test/e2e-zugferd.mjs validiert die Ausgabe mit Mustang
 * (Referenzimplementierung) — XML-Ebene läuft dabei durch die XRechnung-/EN16931-Schematron-Prüfung.
 */

import { validateInvoiceInput, computeTotals } from './ubl-generator.mjs';
import { generateCiiInvoice } from './cii-generator.mjs';

// Deterministische deutsche Zahlformate (bewusst ohne Intl: keine NBSP-Überraschungen in Fonts)
const fmtMoney = (n) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const fmtNum = (n) => String(n).replace('.', ',');
const fmtDate = (iso) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
const UNITS = { C62: 'Stk.', H87: 'Stk.', HUR: 'Std.', DAY: 'Tage', MON: 'Mon.', ANN: 'Jahre', LS: 'pausch.', KGM: 'kg', GRM: 'g', TNE: 't', MTR: 'm', MTK: 'm²', MTQ: 'm³', KMT: 'km', LTR: 'l', MIN: 'Min.', KWH: 'kWh', WEE: 'Wo.', SET: 'Set', PR: 'Paar', PK: 'Pak.', CT: 'Kart.' };
const PAGE_W = 595.28, PAGE_H = 841.89, M = 50;

function xmpDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
}

function buildXmp(inv, now) {
  const d = xmpDate(now);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(inv.docTitle || 'Rechnung ' + inv.number)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${esc(inv.seller.name)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>E-Rechnung Tools (erechnung)</xmp:CreatorTool>
   <xmp:CreateDate>${d}</xmp:CreateDate>
   <xmp:ModifyDate>${d}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>pdf-lib (PDF/A-3, Factur-X)</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentType</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>INVOICE</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>Version</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description>
        </rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function generateZugferdPdf(inv, assets) {
  const { PDFLib, fontkit, fontRegular, fontBold, icc } = assets;
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, rgb } = PDFLib;

  const errs = validateInvoiceInput(inv);
  if (errs.length) {
    const e = new Error('Eingabe unvollständig:\n- ' + errs.join('\n- '));
    e.inputErrors = errs;
    throw e;
  }
  const t = computeTotals(inv);
  const cii = generateCiiInvoice(inv, 'zugferd');
  const now = new Date();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontRegular, { subset: true });
  const bold = await doc.embedFont(fontBold, { subset: true });

  const ink = rgb(0.1, 0.13, 0.2), soft = rgb(0.38, 0.42, 0.5), line = rgb(0.85, 0.87, 0.9);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  const pages = [page];

  const text = (str, x, size = 10, opts = {}) => {
    page.drawText(String(str), { x, y, size, font: opts.bold ? bold : font, color: opts.color || ink, ...opts });
  };
  const rightText = (str, xRight, size = 10, opts = {}) => {
    const f = opts.bold ? bold : font;
    const w = f.widthOfTextAtSize(String(str), size);
    page.drawText(String(str), { x: xRight - w, y, size, font: f, color: opts.color || ink });
  };
  const hline = (x1, x2, color = line, thickness = 0.7) => {
    page.drawLine({ start: { x: x1, y: y }, end: { x: x2, y: y }, color, thickness });
  };
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
  };
  const ensure = (needed) => { if (y - needed < M + 40) newPage(); };
  // simple Umbruch auf Zeichenbasis (DejaVu ~0.55 em Durchschnitt reicht als Näherung mit width-Messung)
  const wrap = (str, maxWidth, size, f = font) => {
    const words = String(str).split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(cand, size) <= maxWidth) cur = cand;
      else { if (cur) out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  };

  const s = inv.seller, b = inv.buyer;

  // Absenderzeile + Empfängerblock (Fensterposition)
  y -= 8;
  text(`${s.name} · ${s.street} · ${s.postcode} ${s.city}`, M, 7.5, { color: soft });
  y -= 26;
  const buyerTop = y;
  text(b.name, M, 11);
  y -= 14; text(b.street, M, 11);
  y -= 14; text(`${b.postcode} ${b.city}`, M, 11);

  // Meta-Block rechts
  y = buyerTop;
  const metaPairs = [
    ['Rechnungs-Nr.', inv.number],
    ['Rechnungsdatum', fmtDate(inv.issueDate)],
    inv.dueDate ? ['Fällig am', fmtDate(inv.dueDate)] : null,
    ['Referenz', inv.buyerReference],
    inv.orderReference ? ['Bestell-Nr.', inv.orderReference] : null,
  ].filter(Boolean);
  for (const [k, v] of metaPairs) {
    text(k, 360, 9, { color: soft });
    rightText(String(v), PAGE_W - M, 9);
    y -= 13;
  }

  y = buyerTop - 90;
  text(`${inv.docType === 'Gutschrift' ? 'Gutschrift' : 'Rechnung'} Nr. ${inv.number}`, M, 15, { bold: true });
  y -= 24;

  // Tabelle
  const cols = { pos: M, name: M + 26, qty: 348, price: 420, vat: 452, total: PAGE_W - M };
  const nameWidth = cols.qty - cols.name - 60;
  const tableHeader = () => {
    text('Pos.', cols.pos, 8, { color: soft });
    text('Bezeichnung', cols.name, 8, { color: soft });
    rightText('Menge', cols.qty, 8, { color: soft });
    rightText('Einzelpreis', cols.price, 8, { color: soft });
    rightText('USt', cols.vat + 22, 8, { color: soft });
    rightText('Betrag', cols.total, 8, { color: soft });
    y -= 5; hline(M, PAGE_W - M, ink, 1); y -= 13;
  };
  tableHeader();
  t.lines.forEach((l, i) => {
    const nameLines = wrap(l.name, nameWidth, 10);
    const descLines = l.description ? wrap(l.description, nameWidth, 8.5) : [];
    ensure(nameLines.length * 12 + descLines.length * 11 + 10);
    if (y === PAGE_H - M) tableHeader();
    const rowTop = y;
    text(String(l.id || i + 1), cols.pos, 10);
    for (const ln of nameLines) { text(ln, cols.name, 10); y -= 12; }
    for (const ln of descLines) { text(ln, cols.name, 8.5, { color: soft }); y -= 11; }
    const yEnd = y;
    y = rowTop;
    rightText(`${fmtNum(l.quantity)} ${UNITS[l.unit] || l.unit || ''}`.trim(), cols.qty, 10);
    rightText(fmtMoney(l.unitPrice), cols.price, 10);
    rightText((inv.taxCategory === 'E' ? '0' : fmtNum(l.rate)) + ' %', cols.vat + 22, 10);
    rightText(fmtMoney(l.lineTotal), cols.total, 10);
    y = yEnd - 4;
    hline(M, PAGE_W - M); y -= 12;
  });

  // Summenblock
  ensure(120);
  const sumRow = (label, val, opts = {}) => {
    text(label, 360, opts.big ? 11 : 10, opts);
    rightText(val, PAGE_W - M, opts.big ? 11 : 10, opts);
    y -= opts.big ? 17 : 14;
  };
  y -= 2;
  sumRow('Nettobetrag', fmtMoney(t.net));
  for (const v of t.vat) {
    if (v.category === 'E') continue;
    sumRow(`Umsatzsteuer ${fmtNum(v.rate)} %`, fmtMoney(v.tax));
  }
  hline(360, PAGE_W - M, ink, 1); y -= 13;
  sumRow('Zu zahlen', fmtMoney(t.payable), { bold: true, big: true });

  if (inv.taxCategory === 'E' && inv.exemptionReason) {
    ensure(24);
    y -= 4;
    for (const ln of wrap(inv.exemptionReason, PAGE_W - 2 * M, 9)) { text(ln, M, 9, { color: soft }); y -= 12; }
  }

  // Zahlungsblock
  ensure(90);
  y -= 14;
  text('Zahlung', M, 9, { bold: true });
  y -= 13;
  if (inv.iban) { text(`IBAN: ${String(inv.iban).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()}${inv.bic ? '   BIC: ' + inv.bic : ''}`, M, 9.5); y -= 12; }
  if (inv.accountName) { text(`Kontoinhaber: ${inv.accountName}`, M, 9.5); y -= 12; }
  if (inv.paymentReference) { text(`Verwendungszweck: ${inv.paymentReference}`, M, 9.5); y -= 12; }
  if (inv.paymentTerms) {
    for (const ln of wrap(inv.paymentTerms, PAGE_W - 2 * M, 9.5)) { text(ln, M, 9.5); y -= 12; }
  }
  if (inv.note) {
    ensure(30);
    y -= 8;
    for (const ln of wrap(inv.note, PAGE_W - 2 * M, 9.5)) { text(ln, M, 9.5, { color: soft }); y -= 12; }
  }

  // Fußzeile auf jeder Seite
  const taxLine = s.vatId ? `USt-IdNr.: ${s.vatId}` : `Steuernr.: ${s.taxNumber}`;
  pages.forEach((p, i) => {
    page = p;
    y = M - 14;
    text(`${s.name} · ${s.street} · ${s.postcode} ${s.city} · ${taxLine} · ${s.email} · ${s.phone}`, M, 7, { color: soft });
    y -= 9;
    text(`Seite ${i + 1}/${pages.length} · Dieses PDF enthält die Rechnungsdaten als eingebettete Factur-X/ZUGFeRD-Datei (factur-x.xml).`, M, 7, { color: soft });
  });

  // --- Metadaten / PDF/A-3-Ausstattung ---
  doc.setTitle(inv.docTitle || `Rechnung ${inv.number}`);
  doc.setAuthor(s.name);
  doc.setCreator('E-Rechnung Tools (erechnung)');
  doc.setProducer('pdf-lib (PDF/A-3, Factur-X)');
  doc.setCreationDate(now);
  doc.setModificationDate(now);

  const ctx = doc.context;

  // XMP-Metadatenstrom (unkomprimiert, PDF/A-Vorgabe)
  const xmp = buildXmp(inv, now);
  const xmpBytes = new TextEncoder().encode(xmp);
  const metaStream = ctx.stream(xmpBytes, { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(metaStream));

  // OutputIntent mit sRGB-ICC
  const iccStream = ctx.flateStream(icc, { N: 3 });
  const iccRef = ctx.register(iccStream);
  const intent = ctx.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: iccRef,
  });
  const intents = PDFArray.withContext(ctx);
  intents.push(ctx.register(intent));
  doc.catalog.set(PDFName.of('OutputIntents'), intents);

  // factur-x.xml manuell einbetten (EmbeddedFile + Filespec + Names-Baum + AF-Array)
  const xmlBytes = new TextEncoder().encode(cii);
  const efStream = ctx.flateStream(xmlBytes, {
    Type: 'EmbeddedFile',
    Subtype: 'text/xml',
    Params: ctx.obj({ Size: xmlBytes.length, ModDate: PDFString.fromDate(now) }),
  });
  const efRef = ctx.register(efStream);
  const filespec = ctx.obj({
    Type: 'Filespec',
    F: PDFString.of('factur-x.xml'),
    UF: PDFHexString.fromText('factur-x.xml'),
    Desc: PDFString.of('Factur-X/ZUGFeRD-Rechnungsdaten (EN 16931)'),
    AFRelationship: 'Data',
    EF: ctx.obj({ F: efRef, UF: efRef }),
  });
  const fsRef = ctx.register(filespec);
  const efNames = PDFArray.withContext(ctx);
  efNames.push(PDFHexString.fromText('factur-x.xml'));
  efNames.push(fsRef);
  const namesDict = ctx.obj({ EmbeddedFiles: ctx.obj({ Names: efNames }) });
  doc.catalog.set(PDFName.of('Names'), namesDict);
  const af = PDFArray.withContext(ctx);
  af.push(fsRef);
  doc.catalog.set(PDFName.of('AF'), af);

  // Trailer-ID (PDF/A-Pflicht, ISO 19005 6.1.3 — pdf-lib setzt sie nicht selbst)
  const idHex = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const idArr = PDFArray.withContext(ctx);
  idArr.push(PDFHexString.of(idHex));
  idArr.push(PDFHexString.of(idHex));
  ctx.trailerInfo.ID = idArr;

  return doc.save({ useObjectStreams: false });
}
