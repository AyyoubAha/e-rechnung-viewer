// E2E: XRechnung Batch Pro (Offline-App via file://) — Vorlage rein → ZIP raus → offizielle Validierung.
// Aufruf: node test/e2e-pro.mjs   (baut vorher das Paket; KOSIT_DIR optional für amtliche Prüfung)
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

class DOMParser extends XmldomParser {
  constructor() { super({ onError: (l, m) => { if (l === 'error' || l === 'fatalError') throw new Error(m); } }); }
}

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

// Frisch bauen
execFileSync('node', [join(ROOT, 'pro/build.mjs')], { stdio: 'pipe' });
check(true, 'Build läuft durch');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1250, height: 950 } });
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); failures++; });

await page.goto('file://' + join(ROOT, 'dist/paket/XRechnung-Batch-Pro.html'), { waitUntil: 'load' });
check((await page.title()).includes('Batch Pro'), 'Offline-App lädt via file://');

// Die mitgelieferte Vorlage (mit 2 Beispielrechnungen) direkt einwerfen
await page.setInputFiles('#fileinput', join(ROOT, 'dist/paket/Vorlage-Rechnungen.xlsx'));
await page.waitForSelector('#resultarea', { state: 'visible', timeout: 10000 });
const summary = await page.textContent('#summary');
check(/2 Rechnung\(en\)/.test(summary) && /2 fehlerfrei/.test(summary), `Beide Beispielrechnungen fehlerfrei („${summary.trim()}")`);

const rowsText = await page.textContent('#rows');
check(/RE-2026-001/.test(rowsText) && /RE-2026-002/.test(rowsText), 'Beide Rechnungsnummern in Tabelle');
check(/1\.392,18/.test(rowsText), 'Brutto RE-2026-001 korrekt (1.169,90 € netto + 19 % = 1.392,18 €)');
await page.screenshot({ path: join(SHOTS, '5-batch-pro.png') });

// ZIP-Download: Format „beides" → XML + ZUGFeRD-PDF je Rechnung
await page.check('input[name="fmt"][value="both"]');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.click('#zipbtn'),
]);
const zipPath = join(SHOTS, 'batch.zip');
await download.saveAs(zipPath);
const zip = await JSZip.loadAsync(readFileSync(zipPath));
const names = Object.keys(zip.files).sort();
check(names.length === 4 && names.includes('xrechnung_RE-2026-001.xml') && names.includes('zugferd_RE-2026-001.pdf'),
  `ZIP enthält 4 Dateien: 2×XML + 2×PDF (${names.join(', ')})`);
// ZUGFeRD-PDF aus dem Browser-Batch mit Mustang validieren
if (process.env.MUSTANG_JAR && names.includes('zugferd_RE-2026-001.pdf')) {
  const pdfOut = join(SHOTS, 'batch-zf-1.pdf');
  writeFileSync(pdfOut, await zip.files['zugferd_RE-2026-001.pdf'].async('nodebuffer'));
  try {
    const out = execFileSync('java', ['-jar', process.env.MUSTANG_JAR, '--action', 'validate', '--source', pdfOut], { stdio: 'pipe' }).toString();
    check(/summary status="valid"/.test(out) && !/status="invalid"/.test(out) && !/isCompliant=false/.test(out),
      'Batch-ZUGFeRD-PDF: Mustang-Validierung alle Ebenen');
  } catch { check(false, 'Batch-ZUGFeRD-PDF: Mustang-Validierung alle Ebenen'); }
}

for (const name of names.filter((n) => n.endsWith('.xml'))) {
  const xml = await zip.files[name].async('string');
  const inv = parseInvoiceXml(xml, DOMParser);
  check(inv.warnings.length === 0, `${name}: keine Plausibilitätswarnungen`);
  writeFileSync(join(SHOTS, name), xml);
  if (process.env.KOSIT_DIR) {
    try {
      execFileSync('java', ['-jar', join(process.env.KOSIT_DIR, 'validator.jar'), '-s', join(process.env.KOSIT_DIR, 'xr-config', 'scenarios.xml'), '-r', join(process.env.KOSIT_DIR, 'xr-config'), '-o', SHOTS, join(SHOTS, name)], { stdio: 'pipe' });
      check(true, `${name}: offizielle KoSIT-Validierung bestanden`);
    } catch { check(false, `${name}: offizielle KoSIT-Validierung bestanden`); }
  }
}

await browser.close();
console.log(failures === 0 ? '\nE2E PRO: ALLE CHECKS BESTANDEN' : `\nE2E PRO: ${failures} FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
