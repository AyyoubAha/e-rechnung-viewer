# Qualitätsstandard

Fertig ist eine Änderung erst, wenn:

1. Alle Suiten grün sind:
   npm test; node --test test/generate.test.mjs test/cii.test.mjs test/pruefen.test.mjs;
   node test/e2e.mjs; node test/e2e-erstellen.mjs; node test/e2e-pruefen.mjs;
   node test/e2e-en.mjs; node pro/build.mjs && node test/e2e-pro.mjs;
   node test/e2e-zugferd.mjs (mit MUSTANG_JAR); node test/copy-lint.mjs.
   KoSIT-Validierung: KOSIT_DIR=... node test/validate-kosit.mjs.
2. Gestaltung DESIGN_SYSTEM.md folgt (keine neuen Kästen, Radien, Schatten, Farben).
3. Texte VOICE_AND_COPY.md folgen (Lint erzwingt die harten Regeln).
4. Bei Änderungen an Generatoren oder der Batch-App: Version in pro/build.mjs erhöhen,
   ZIP neu bauen und auf beiden Verkaufskanälen ersetzen.
5. Nach Deploy: Stichprobe der Live-URLs (200, Inhalt entspricht dem getesteten Stand).
6. Bei Gestaltungsänderungen: Screenshots in 1440, 1280, 768 und 390 Pixel Breite.
