/**
 * Prüf-Engine: XRechnung-/EN-16931-Validierung mit den offiziellen KoSIT-Prüfregeln
 * (Schematron, kompiliert als SEF), ausgeführt lokal via SaxonJS.
 *
 * Geprüft werden die Geschäftsregeln (EN 16931 + ggf. XRechnung-CIUS) — dieselbe Regelbasis,
 * die auch der offizielle Validator nutzt. Keine XSD-Schemaprüfung (transparent kommunizieren).
 *
 * Umgebungsneutral: SaxonJS und der SEF-Pfad-Resolver werden übergeben.
 */

const XR_MARKER = 'xrechnung';

export function detectInvoice(xmlDoc) {
  const root = xmlDoc.documentElement;
  const local = root.localName || root.nodeName.split(':').pop();
  let syntax = null;
  if (local === 'CrossIndustryInvoice') syntax = 'cii';
  else if (local === 'Invoice' || local === 'CreditNote') syntax = 'ubl';
  else throw new Error(`Kein E-Rechnungs-Dokument: Wurzelelement „${local}"`);

  // Profil: CustomizationID (UBL) bzw. GuidelineSpecifiedDocumentContextParameter/ID (CII)
  let profileId = '';
  const all = xmlDoc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    const ln = n.localName || n.nodeName.split(':').pop();
    if (ln === 'CustomizationID') { profileId = (n.textContent || '').trim(); break; }
    if (ln === 'GuidelineSpecifiedDocumentContextParameter') {
      const id = n.getElementsByTagName('*');
      for (let j = 0; j < id.length; j++) {
        const l2 = id[j].localName || id[j].nodeName.split(':').pop();
        if (l2 === 'ID') { profileId = (id[j].textContent || '').trim(); break; }
      }
      break;
    }
  }
  const isXRechnung = profileId.toLowerCase().includes(XR_MARKER);
  return { syntax, profileId, isXRechnung };
}

/** SVRL-Ausgabe → Befundliste */
export function parseSvrl(svrlString, layer, DOMParserImpl) {
  const P = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  const doc = new P().parseFromString(svrlString, 'application/xml');
  const findings = [];
  const collect = (tag, kind) => {
    const nodes = doc.getElementsByTagName('*');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const ln = n.localName || n.nodeName.split(':').pop();
      if (ln !== tag) continue;
      let text = '';
      for (let c = n.firstChild; c; c = c.nextSibling) {
        const cl = c.localName || (c.nodeName || '').split(':').pop();
        if (cl === 'text') { text = (c.textContent || '').trim().replace(/\s+/g, ' '); break; }
      }
      findings.push({
        layer,
        kind,
        id: n.getAttribute('id') || '',
        flag: n.getAttribute('flag') || 'fatal',
        location: n.getAttribute('location') || '',
        text,
      });
    }
  };
  collect('failed-assert', 'assert');
  collect('successful-report', 'report');
  return findings;
}

/**
 * Führt die Prüfung aus.
 * opts: { SaxonJS, sefLocation(name)→URL/Pfad, DOMParserImpl? }
 * Rückgabe: { syntax, profileId, isXRechnung, layers:[{name,label}], findings, errors, warnings }
 */
export async function validateInvoice(xmlString, opts) {
  const { SaxonJS, sefLocation, DOMParserImpl } = opts;
  const P = DOMParserImpl || DOMParser;
  const doc = new P().parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML ist nicht wohlgeformt.');
  const info = detectInvoice(doc);

  const layers = [{ name: `${info.syntax}-en`, label: 'EN 16931 (europäische Norm)' }];
  if (info.isXRechnung) layers.push({ name: `${info.syntax}-xr`, label: 'XRechnung-CIUS (deutsche Zusatzregeln)' });

  let findings = [];
  for (const layer of layers) {
    const result = await SaxonJS.transform({
      stylesheetLocation: sefLocation(layer.name),
      sourceText: xmlString,
      destination: 'serialized',
    }, 'async');
    findings = findings.concat(parseSvrl(result.principalResult, layer.label, DOMParserImpl));
  }

  const errors = findings.filter((f) => f.flag === 'fatal' || f.flag === 'error');
  const warnings = findings.filter((f) => f.flag === 'warning');
  const infos = findings.filter((f) => !errors.includes(f) && !warnings.includes(f));
  return { ...info, layers, findings, errors, warnings, infos };
}
