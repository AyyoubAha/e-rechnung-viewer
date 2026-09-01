// E2E: „XRechnung erstellen"-Seite im echten Chromium — Formular → Download → Prüfung.
// Aufruf: node test/e2e-erstellen.mjs [screenshot-verzeichnis]
// Optional: KOSIT_DIR gesetzt → heruntergeladene Datei wird zusätzlich offiziell validiert.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { parseInvoiceXml } from '../docs/invoice-parser.mjs';

const SITE = new URL('../docs/', import.meta.url).pathname;
const SHOTS = process.argv[2] || new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

class DOMParser extends XmldomParser {
  constructor() { super({ onError: (l, m) => { if (l === 'error' || l === 'fatalError') throw new Error(m); } }); }
}

const MIME = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.xml':'application/xml' };
const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = readFileSync(join(SITE, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); process.exitCode = 1; });

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

await page.goto(base + '/erstellen.html', { waitUntil: 'load' });
check((await page.title()).includes('XRechnung erstellen'), 'Seite lädt');

// Negativfall zuerst: leeres Formular → konkrete Fehlermeldungen
await page.click('#generate');
await page.waitForSelector('#errbox.show', { timeout: 5000 });
const errText = await page.textContent('#errbox');
check(/Rechnungsnummer/.test(errText) && /Leitweg|Käufer-Referenz|BR-DE-15/.test(errText), 'Leeres Formular: konkrete Fehlerliste');

// Formular ausfüllen
const fill = async (id, v) => page.fill('#' + id, v);
await fill('s_name', 'Muster Webdesign');
await fill('s_contact', 'Max Muster');
await fill('s_street', 'Beispielweg 12');
await fill('s_plz', '67663');
await fill('s_city', 'Kaiserslautern');
await fill('s_email', 'rechnung@muster.example');
await fill('s_phone', '+49 631 1234567');
await fill('s_vat', 'DE123456789');
await fill('b_name', 'Beispiel GmbH');
await fill('b_street', 'Industriestraße 5');
await fill('b_plz', '80331');
await fill('b_city', 'München');
await fill('leitweg', 'KD-1001');
await fill('rnum', 'RE-2026-0099');
await fill('terms', 'Zahlbar innerhalb von 14 Tagen ohne Abzug.');
await fill('iban', 'DE02120300000000202051');
await page.fill('#lines .l_name', 'Webdesign-Leistungen');
await page.fill('#lines .l_qty', '10');
await page.fill('#lines .l_price', '95');

// Live-Summen
const gross = await page.textContent('#sum_gross');
check(/1\.130,50/.test(gross), `Live-Summe brutto korrekt (${gross.trim()})`);

// Download
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.click('#generate'),
]);
const file = join(SHOTS, 'download.xml');
await download.saveAs(file);
check(download.suggestedFilename() === 'xrechnung_RE-2026-0099.xml', 'Dateiname korrekt');
const xml = readFileSync(file, 'utf8');
const inv = parseInvoiceXml(xml, DOMParser);
check(inv.number === 'RE-2026-0099', 'XML: Rechnungsnummer');
check(inv.totals.duePayable === 1130.5, 'XML: Zahlbetrag 1130.50');
check(inv.payment.iban === 'DE02120300000000202051', 'XML: IBAN');
check(inv.warnings.length === 0, 'XML: keine Plausibilitätswarnungen');
await page.screenshot({ path: join(SHOTS, '4-erstellen.png') });

// ZUGFeRD-PDF-Fluss (lädt pdf-lib + Fonts lokal nach)
const [zfDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.click('#generatezf'),
]);
const zfFile = join(SHOTS, 'download-zugferd.pdf');
await zfDownload.saveAs(zfFile);
check(zfDownload.suggestedFilename() === 'zugferd_RE-2026-0099.pdf', 'ZUGFeRD: PDF-Dateiname korrekt');
{
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(zfFile)) }).promise;
  const att = await pdf.getAttachments();
  const key = att && Object.keys(att).find((k) => k.toLowerCase() === 'factur-x.xml');
  check(!!key, 'ZUGFeRD: factur-x.xml im Browser-PDF eingebettet');
  if (key) {
    const emb = parseInvoiceXml(new TextDecoder().decode(att[key].content), DOMParser);
    check(emb.number === 'RE-2026-0099' && emb.totals.duePayable === 1130.5, 'ZUGFeRD: eingebettete Daten korrekt');
  }
}

// Kleinunternehmer-Modus: USt-Spalte verschwindet
await page.check('#klein');
const vatVisible = await page.isVisible('#lines .l_vat');
check(!vatVisible, 'Kleinunternehmer-Modus blendet USt aus');

// Optional: offizielle Validierung des Downloads
if (process.env.KOSIT_DIR) {
  try {
    execFileSync('java', ['-jar', join(process.env.KOSIT_DIR, 'validator.jar'), '-s', join(process.env.KOSIT_DIR, 'xr-config', 'scenarios.xml'), '-r', join(process.env.KOSIT_DIR, 'xr-config'), '-o', SHOTS, file], { stdio: 'pipe' });
    check(true, 'Download besteht offizielle KoSIT-Validierung');
  } catch { check(false, 'Download besteht offizielle KoSIT-Validierung'); }
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nE2E ERSTELLEN: ALLE CHECKS BESTANDEN' : `\nE2E ERSTELLEN: ${failures} FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
