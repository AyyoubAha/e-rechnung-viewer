// Offizielle Validierung generierter XRechnungen mit dem KoSIT-Validator (Java).
// Aufruf: KOSIT_DIR=/pfad/mit/validator node test/validate-kosit.mjs
// Erwartet in KOSIT_DIR: validator.jar + xr-config/ (scenarios.xml etc.)
// Beschaffung: tools/fetch-kosit.sh
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateUblInvoice } from '../docs/ubl-generator.mjs';
import { generateCiiInvoice } from '../docs/cii-generator.mjs';
import { ALL_SAMPLES } from './samples.mjs';

const KOSIT = process.env.KOSIT_DIR;
if (!KOSIT || !existsSync(join(KOSIT, 'validator.jar'))) {
  console.error('KOSIT_DIR nicht gesetzt oder validator.jar fehlt — siehe tools/fetch-kosit.sh');
  process.exit(2);
}

const OUT = join(KOSIT, 'generated');
mkdirSync(OUT, { recursive: true });

const CASES = {};
for (const [name, sample] of Object.entries(ALL_SAMPLES)) {
  CASES[`${name}-ubl`] = generateUblInvoice(sample);
  CASES[`${name}-cii`] = generateCiiInvoice(sample, 'xrechnung');
}

let failures = 0;
for (const [name, xml] of Object.entries(CASES)) {
  const file = join(OUT, `${name}.xml`);
  writeFileSync(file, xml);
  try {
    execFileSync('java', ['-jar', join(KOSIT, 'validator.jar'), '-s', join(KOSIT, 'xr-config', 'scenarios.xml'), '-r', join(KOSIT, 'xr-config'), '-o', OUT, file], { stdio: 'pipe' });
    console.log(`✓ ${name}: KoSIT-Validierung bestanden`);
  } catch (e) {
    failures++;
    console.log(`✗ ${name}: ABGELEHNT — Report: ${join(OUT, name + '-report.xml')}`);
    const out = (e.stdout || '').toString() + (e.stderr || '').toString();
    console.log(out.split('\n').filter((l) => l.trim()).slice(-12).join('\n'));
  }
}
console.log(failures === 0 ? '\nALLE GENERIERTEN RECHNUNGEN OFFIZIELL VALIDE' : `\n${failures} DATEI(EN) ABGELEHNT`);
process.exit(failures === 0 ? 0 : 1);
