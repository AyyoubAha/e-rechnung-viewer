// Realistische Beispiel-Eingaben für Generator-Tests und KoSIT-Validierung.

export const SAMPLE_STANDARD = {
  number: 'RE-2026-0042',
  issueDate: '2026-09-01',
  dueDate: '2026-09-15',
  buyerReference: 'KD-1001',
  note: 'Vielen Dank für Ihren Auftrag.',
  seller: {
    name: 'Muster Webdesign', street: 'Beispielweg 12', postcode: '67663', city: 'Kaiserslautern',
    vatId: 'DE123456789', email: 'rechnung@muster-webdesign.example', contactName: 'Max Muster',
    phone: '+49 631 1234567',
  },
  buyer: {
    name: 'Beispiel GmbH', street: 'Industriestraße 5', postcode: '80331', city: 'München',
    email: 'buchhaltung@beispiel.example',
  },
  iban: 'DE02120300000000202051', bic: 'BYLADEM1001', accountName: 'Max Muster',
  paymentReference: 'RE-2026-0042',
  paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
  lines: [
    { name: 'Webdesign-Leistungen', description: 'Relaunch Startseite', quantity: 12, unit: 'HUR', unitPrice: 95, vatRate: 19 },
    { name: 'Hosting-Paket Business', quantity: 1, unit: 'MON', unitPrice: 29.9, vatRate: 19 },
  ],
};

export const SAMPLE_MIXED_RATES = {
  ...SAMPLE_STANDARD,
  number: 'RE-2026-0043',
  lines: [
    { name: 'Fachbuch „E-Rechnung kompakt"', quantity: 3, unit: 'C62', unitPrice: 24.5, vatRate: 7 },
    { name: 'Versand', quantity: 1, unit: 'C62', unitPrice: 4.9, vatRate: 19 },
    { name: 'Beratung', quantity: 1.5, unit: 'HUR', unitPrice: 120, vatRate: 19 },
  ],
};

export const SAMPLE_KLEINUNTERNEHMER = {
  number: '2026-017',
  issueDate: '2026-09-01',
  buyerReference: 'Auftrag 2026-09',
  taxCategory: 'E',
  exemptionReason: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  seller: {
    name: 'Anna Klein Fotografie', street: 'Gartenstraße 3', postcode: '55116', city: 'Mainz',
    taxNumber: '26/123/45678', email: 'anna@klein-foto.example', contactName: 'Anna Klein',
    phone: '+49 6131 998877',
  },
  buyer: {
    name: 'Familie Sommer', street: 'Am Hang 8', postcode: '55122', city: 'Mainz',
  },
  iban: 'DE75512108001245126199', accountName: 'Anna Klein',
  paymentTerms: 'Zahlbar innerhalb von 7 Tagen.',
  lines: [
    { name: 'Fotoshooting Familienporträt', quantity: 1, unit: 'C62', unitPrice: 240 },
    { name: 'Zusätzliche Bildbearbeitung', quantity: 5, unit: 'C62', unitPrice: 8 },
  ],
};

export const ALL_SAMPLES = {
  'standard-19': SAMPLE_STANDARD,
  'gemischt-19-7': SAMPLE_MIXED_RATES,
  'kleinunternehmer-p19': SAMPLE_KLEINUNTERNEHMER,
};
