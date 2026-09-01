// E2E-Smoke: englische Seiten (Viewer + Validator).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { generateUblInvoice } from '../docs/ubl-generator.mjs';
import { SAMPLE_STANDARD } from './samples.mjs';

const SITE = new URL('../docs/', import.meta.url).pathname;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.pdf': 'application/pdf', '.ttf': 'font/ttf' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = readFileSync(join(SITE, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

writeFileSync(join(SHOTS, 'valid.xml'), generateUblInvoice(SAMPLE_STANDARD));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); failures++; });

let failures = 0;
const check = (cond, label) => { console.log((cond ? '✓ ' : '✗ ') + label); if (!cond) failures++; };

// EN-Viewer
await page.goto(base + '/en/', { waitUntil: 'load' });
check((await page.title()).includes('E-Invoice Viewer'), 'EN-Viewer lädt');
await page.setInputFiles('#fileinput', join(SHOTS, 'valid.xml'));
await page.waitForSelector('#result.show', { timeout: 8000 });
const sheet = await page.textContent('#sheet');
check(/Amount due/.test(sheet) && /Seller/.test(sheet), 'EN-Viewer rendert englisch');
check(/1,392\.18/.test(sheet), 'EN-Zahlformat (1,392.18)');

// EN-Validator
await page.goto(base + '/en/validate.html', { waitUntil: 'load' });
check((await page.title()).includes('Validator'), 'EN-Validator lädt');
await page.setInputFiles('#fileinput', join(SHOTS, 'valid.xml'));
await page.waitForSelector('#report.show', { timeout: 90000 });
check(await page.isVisible('.verdict.ok'), 'EN-Validator: grünes Urteil');
check(/No rule violations/.test(await page.textContent('#verdict')), 'EN-Urteilstext englisch');
await page.screenshot({ path: join(SHOTS, '8-en-validate.png') });

await browser.close();
server.close();
console.log(failures === 0 ? '\nE2E EN: ALLE CHECKS BESTANDEN' : `\nE2E EN: ${failures} FEHLGESCHLAGEN`);
process.exit(failures === 0 ? 0 : 1);
