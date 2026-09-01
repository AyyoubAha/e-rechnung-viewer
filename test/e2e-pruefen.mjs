// E2E: Prüf-Seite im echten Chromium — valide/kaputte XML + ZUGFeRD-PDF.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { generateUblInvoice } from '../docs/ubl-generator.mjs';
import { SAMPLE_STANDARD } from './samples.mjs';

const SITE = new URL('../docs/', import.meta.url).pathname;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml' };
const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = readFileSync(join(SITE, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

writeFileSync(join(SHOTS, 'valid.xml'), generateUblInvoice(SAMPLE_STANDARD));
writeFileSync(join(SHOTS, 'broken.xml'), generateUblInvoice(SAMPLE_STANDARD).replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); failures++; });

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

await page.goto(base + '/pruefen.html', { waitUntil: 'load' });
check((await page.title()).includes('prüfen'), 'Seite lädt');

// Valide Rechnung
await page.setInputFiles('#fileinput', join(SHOTS, 'valid.xml'));
await page.waitForSelector('#report.show', { timeout: 90000 });
check(await page.isVisible('.verdict.ok'), 'Valide XRechnung: grünes Urteil');
const meta = await page.textContent('#meta');
check(/UBL/.test(meta) && /XRechnung-CIUS/.test(meta), 'Meta zeigt Syntax + beide Ebenen');
await page.screenshot({ path: join(SHOTS, '6-pruefen-ok.png') });

// Kaputte Rechnung
await page.click('#resetbtn');
await page.setInputFiles('#fileinput', join(SHOTS, 'broken.xml'));
await page.waitForSelector('.verdict.bad', { timeout: 90000 });
const rows = await page.textContent('#rows');
check(/BR-DE-15/.test(rows), 'Kaputte Rechnung: BR-DE-15 im Bericht');
await page.screenshot({ path: join(SHOTS, '7-pruefen-fehler.png') });

// ZUGFeRD-PDF (aus vorherigem Testlauf)
await page.click('#resetbtn');
await page.setInputFiles('#fileinput', join(SHOTS, 'zf-standard-19.pdf'));
await page.waitForSelector('#report.show', { timeout: 90000 });
const meta2 = await page.textContent('#meta');
check(/CII/.test(meta2), 'ZUGFeRD-PDF: XML extrahiert und geprüft (CII)');
check(await page.isVisible('.verdict.ok'), 'ZUGFeRD-PDF: grünes Urteil');

await browser.close();
server.close();
console.log(failures === 0 ? '\nE2E PRUEFEN: ALLE CHECKS BESTANDEN' : `\nE2E PRUEFEN: ${failures} FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
