// ZUGFeRD-PDF-Qualitätsschranke: erzeugte PDFs gegen Mustang (Referenzimplementierung) validieren
// + Round-Trip: eingebettetes XML mit pdf.js extrahieren und mit eigenem Parser lesen.
// Aufruf: MUSTANG_JAR=/pfad/mustang.jar node test/e2e-zugferd.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as PDFLib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { generateZugferdPdf } from '../docs/zugferd-pdf.mjs';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';
import { ALL_SAMPLES } from './samples.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const MUSTANG = process.env.MUSTANG_JAR;

class DOMParser extends XmldomParser {
  constructor() { super({ onError: (l, m) => { if (l === 'error' || l === 'fatalError') throw new Error(m); } }); }
}

const assets = {
  PDFLib, fontkit,
  fontRegular: readFileSync(join(ROOT, 'pro/assets/DejaVuSans.ttf')),
  fontBold: readFileSync(join(ROOT, 'pro/assets/DejaVuSans-Bold.ttf')),
  icc: readFileSync(join(ROOT, 'pro/assets/sRGB.icc')),
};

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

for (const [name, sample] of Object.entries(ALL_SAMPLES)) {
  const pdfBytes = await generateZugferdPdf(sample, assets);
  const file = join(OUT, `zf-${name}.pdf`);
  writeFileSync(file, pdfBytes);
  check(pdfBytes.length > 20000, `${name}: PDF erzeugt (${(pdfBytes.length / 1024).toFixed(0)} KB)`);

  // Round-Trip: XML via pdf.js extrahieren (derselbe Weg wie im Viewer)
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const att = await pdf.getAttachments();
  const key = att && Object.keys(att).find((k) => k.toLowerCase() === 'factur-x.xml');
  check(!!key, `${name}: factur-x.xml eingebettet`);
  if (key) {
    const inv = parseInvoiceXml(new TextDecoder().decode(att[key].content), DOMParser);
    check(inv.number === sample.number, `${name}: Round-Trip Rechnungsnummer`);
    check(inv.warnings.length === 0, `${name}: Round-Trip ohne Warnungen`);
  }

  // Referenz-Validierung mit Mustang
  if (MUSTANG) {
    try {
      const out = execFileSync('java', ['-jar', MUSTANG, '--action', 'validate', '--source', file], { stdio: 'pipe' }).toString();
      // streng: KEIN invalid auf irgendeiner Ebene, PDF/A-Prüfung compliant, Gesamtergebnis valid
      const valid = /summary status="valid"/.test(out) && !/status="invalid"/.test(out) && !/isCompliant=false/.test(out);
      check(valid, `${name}: Mustang-Validierung auf ALLEN Ebenen (PDF/A + XML) bestanden`);
      if (!valid) console.log(out.split('\n').filter((l) => /error|invalid|failed=|isCompliant|<criterion/i.test(l)).slice(0, 15).join('\n'));
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || '')).toString();
      check(false, `${name}: Mustang-Gesamtvalidierung "valid"`);
      console.log(out.split('\n').filter((l) => /error|invalid|failed|status=/i.test(l)).slice(0, 15).join('\n'));
    }
  }
}
console.log(failures === 0 ? '\nZUGFERD: ALLE CHECKS BESTANDEN' : `\nZUGFERD: ${failures} FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
