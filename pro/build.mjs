// Baut das Pro-Auslieferungspaket: dist/XRechnung-Batch-Pro.html + Vorlage + LIESMICH → dist/paket/
// Aufruf: node pro/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const PKG = join(DIST, 'paket');
mkdirSync(PKG, { recursive: true });

const VERSION = 'v1.3';
const DATE = new Date().toISOString().slice(0, 10);

const strip = (src) => src.replace(/^export /gm, '').replace(/^import .*$/gm, '');
// Module als IIFE kapseln: keine Kollisionen interner Helfer (esc, r2, money, …),
// nur die öffentlichen Funktionen landen im globalen Scope.
const wrapModule = (path, expose) => {
  const src = strip(readFileSync(join(ROOT, path), 'utf8'));
  return `(function () {\n${src}\n${expose.map((n) => `window.${n} = ${n};`).join('\n')}\n})();`;
};
const generator = wrapModule('docs/ubl-generator.mjs', ['generateUblInvoice', 'validateInvoiceInput', 'computeTotals']);
const ciiGenerator = wrapModule('docs/cii-generator.mjs', ['generateCiiInvoice']);
const zfPdf = wrapModule('docs/zugferd-pdf.mjs', ['generateZugferdPdf']);
const mapper = wrapModule('pro/mapper.mjs', ['mapWorkbook']);
const xlsxLib = readFileSync(join(ROOT, 'pro/vendor/xlsx.full.min.js'), 'utf8');
const jszipLib = readFileSync(join(ROOT, 'node_modules/jszip/dist/jszip.min.js'), 'utf8');
const pdfLibJs = readFileSync(join(ROOT, 'node_modules/pdf-lib/dist/pdf-lib.min.js'), 'utf8');
const fontkitJs = readFileSync(join(ROOT, 'node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js'), 'utf8');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

let html = readFileSync(join(ROOT, 'pro/app-template.html'), 'utf8');
for (const [key, val] of Object.entries({
  XLSX_LIB: xlsxLib, JSZIP_LIB: jszipLib, PDFLIB_JS: pdfLibJs, FONTKIT_JS: fontkitJs,
  GENERATOR: generator, CII_GENERATOR: ciiGenerator, ZF_PDF: zfPdf, MAPPER: mapper,
  FONT_REG_B64: b64('pro/assets/DejaVuSans.ttf'), FONT_BOLD_B64: b64('pro/assets/DejaVuSans-Bold.ttf'),
  ICC_B64: b64('pro/assets/sRGB.icc'), VERSION, DATE,
})) {
  html = html.split(`{{${key}}}`).join(val);
}
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unersetzte Platzhalter im Build!');
writeFileSync(join(PKG, 'XRechnung-Batch-Pro.html'), html);

execFileSync('python3', [join(ROOT, 'pro/make-template.py'), join(PKG, 'Vorlage-Rechnungen.xlsx')], { stdio: 'inherit' });

writeFileSync(join(PKG, 'LIESMICH.txt'), `XRechnung Batch Pro ${VERSION} (${DATE})
====================================================

Vielen Dank für Ihren Kauf!

SCHNELLSTART
1. Vorlage-Rechnungen.xlsx in Excel öffnen:
   - Blatt "Absender": Ihre Daten einmalig eintragen
   - Blatt "Rechnungen": eine Zeile pro Rechnungsposition
     (mehrere Positionen einer Rechnung = gleiche Rechnungsnummer,
      Rechnungs-/Empfängerfelder nur in der ersten Zeile nötig)
2. XRechnung-Batch-Pro.html doppelklicken (öffnet im Browser,
   funktioniert komplett offline - keine Installation, kein Upload)
3. Ausgefüllte Excel-Datei hineinziehen
4. Ausgabeformat wählen: XRechnung (XML), ZUGFeRD-PDF oder beides
5. Alle Rechnungen als ZIP herunterladen, Prüfbericht drucken

HINWEISE
- XRechnung 3.0 (EN 16931, UBL) - der Generator wird gegen den
  offiziellen KoSIT-Validator getestet.
- ZUGFeRD/Factur-X (NEU in v1.1): ansehnliches PDF/A-3 mit eingebetteten
  Rechnungsdaten (Profil EN 16931), validiert mit der
  Referenzimplementierung Mustang.
- Kleinunternehmer (§ 19 UStG): im Blatt "Absender" auf "ja" stellen.
- Ihre Daten verlassen Ihr Gerät nie.

SUPPORT & UPDATES
kontakt@ayyoubaharchi.de
Kostenlose Tools: https://ayyoubaha.github.io/e-rechnung-viewer/

Keine Steuer- oder Rechtsberatung. Bitte Rechnungen vor Versand prüfen.
`);

// ZIP fürs Polar-Datei-Benefit
execFileSync('python3', ['-c', `
import zipfile, os
src = ${JSON.stringify(PKG)}
out = ${JSON.stringify(join(DIST, 'XRechnung-Batch-Pro.zip'))}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(src)):
        z.write(os.path.join(src, f), f)
print('Paket:', out, os.path.getsize(out), 'Bytes')
`], { stdio: 'inherit' });
