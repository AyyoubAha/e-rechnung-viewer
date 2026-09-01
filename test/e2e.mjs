// E2E-Smoketest im echten Chromium: XML- und PDF-Fluss + Screenshots.
// Aufruf: node test/e2e.mjs [screenshot-verzeichnis]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const SITE = new URL('../docs/', import.meta.url).pathname;
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const SHOTS = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

// ZUGFeRD-Fixture bei Bedarf laden
const pdfPath = join(FIX, 'zugferd.pdf');
if (!existsSync(pdfPath)) {
  const res = await fetch('https://raw.githubusercontent.com/ZUGFeRD/corpus/master/ZUGFeRDv2/correct/Mustangproject/MustangGnuaccountingBeispielRE-20201121_508.pdf');
  if (!res.ok) throw new Error('ZUGFeRD-Fixture-Download fehlgeschlagen: ' + res.status);
  writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
}

// Mini-Static-Server
const MIME = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css' };
const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = readFileSync(join(SITE, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy}`] : []), '--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', e => { console.error('PAGEERROR:', e.message); process.exitCode = 1; });

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

await page.goto(base + '/', { waitUntil: 'networkidle' });
check((await page.title()).includes('E-Rechnung'), 'Seite lädt, Titel gesetzt');
await page.screenshot({ path: join(SHOTS, '1-startseite.png') });

// --- XML-Fluss (UBL) ---
await page.setInputFiles('#fileinput', join(FIX, 'ubl.xml'));
await page.waitForSelector('#result.show', { timeout: 5000 });
const sheetText = await page.textContent('#sheet');
check(/Rechnung/.test(sheetText), 'XML: Dokumenttyp erscheint');
check(/Rechnungssteller/.test(sheetText), 'XML: Verkäufer-Block erscheint');
check(/Zu zahlen/.test(sheetText), 'XML: Zahlbetrag erscheint');
check(/IBAN/.test(sheetText) || /Zahlung/.test(sheetText), 'XML: Zahlungsblock erscheint');
await page.screenshot({ path: join(SHOTS, '2-xrechnung-ansicht.png'), fullPage: false });

// --- Reset ---
await page.click('#resetbtn');
check(!(await page.isVisible('#result.show')), 'Reset leert die Ansicht');

// --- PDF-Fluss (ZUGFeRD, lädt pdf.js vom CDN) ---
await page.setInputFiles('#fileinput', pdfPath);
try {
  await page.waitForSelector('#result.show', { timeout: 30000 });
  const t2 = await page.textContent('#sheet');
  check(/RE-20201121\/508/.test(t2), 'PDF: Rechnungsnummer aus eingebettetem XML');
  check(/Bei Spiel GmbH/.test(t2), 'PDF: Verkäufer aus eingebettetem XML');
  check(/571,04/.test(t2), 'PDF: Betrag formatiert (de-DE)');
  check(/factur-x\.xml/.test(t2), 'PDF: eingebettete Datei ausgewiesen');
  await page.screenshot({ path: join(SHOTS, '3-zugferd-ansicht.png') });
} catch (e) {
  const err = await page.textContent('#errbox').catch(() => '');
  check(false, 'PDF-Fluss (CDN erreichbar?): ' + (err || e.message));
}

// --- Fehlerfall: kaputte Datei (frische Seite, unabhängig vom Vorzustand) ---
writeFileSync(join(FIX, 'kaputt.xml'), '<Invoice><kaputt</Invoice>');
await page.goto(base + '/', { waitUntil: 'load' });
await page.setInputFiles('#fileinput', join(FIX, 'kaputt.xml'));
try {
  await page.waitForSelector('#errbox.show', { timeout: 5000 });
  check(true, 'Kaputte Datei zeigt Fehlermeldung statt Absturz');
} catch { check(false, 'Kaputte Datei zeigt Fehlermeldung statt Absturz'); }

await browser.close();
server.close();
console.log(failures === 0 ? '\nE2E: ALLE CHECKS BESTANDEN' : `\nE2E: ${failures} CHECK(S) FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
