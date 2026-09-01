# Stack-Entscheidungen

- Statisches HTML mit ES-Modulen, ohne Framework und ohne Build-Zwang für die Website.
  Begründung: Datenschutz-Versprechen (lokale Verarbeitung), Betrieb auf GitHub Pages,
  minimale Angriffsfläche.
- Vendorte Bibliotheken (docs/vendor/): pdf.js 4.10.38 (CVE-2024-4367 ist in dieser Linie
  behoben), SaxonJS 2.7 Runtime (Lizenz beigelegt), pdf-lib 1.17.1 plus fontkit für die
  ZUGFeRD-Erzeugung. Keine CDNs, keine Webfonts.
- Batch-App: SheetJS 0.20.3 als vendortes Standalone (pro/vendor/), Upgrade von npm 0.18.5
  wegen CVE-2023-30533; das npm-Paket xlsx bleibt nur für Tests/Tooling und wird nicht
  mehr in die App eingebettet.
- Tests: node:test für Parser und Generatoren, Playwright (Chromium, devDependency) für
  Oberflächen, KoSIT-Validator und Mustang-CLI als externe Referenzprüfungen, eigener
  Copy-Lint.
- Kein neuer Runtime-Code ohne Eintrag hier; Versionen vor Releases gegen die jeweiligen
  Security Advisories prüfen.
