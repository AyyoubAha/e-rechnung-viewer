# Design-System „Fachliteratur"

Art Direction in einem Satz: Ein nüchternes Prüfwerkzeug im Duktus deutscher Fachliteratur
mit Serifen-Überschriften, Urkundenblau auf kühlem Grauweiß, Dokumentlinien statt Karten
und Monospace für Kennungen und IBAN.

## Typografie
- Überschriften (h1 bis h3, Wortmarke): Serifenstapel Charter, "Bitstream Charter", Cambria,
  Georgia. Fließtext: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial.
  Kennungen, Regel-IDs, IBAN: Monospace-Stapel. Begründung für Systemschriften: Das
  Produktversprechen (funktioniert offline, kein Request an Dritte) verbietet Webfonts.
- Zahlen mit font-variant-numeric: tabular-nums. Tabellenköpfe und Kleinbeschriftungen
  versal mit letter-spacing 0.1 em.

## Farbe (Tokens in docs/stil.css)
- grund #f2f3f5, flaeche #ffffff, tinte #14181f, grau #556070, linie #ccd2db
- blau #1a4a8f (einzige Akzentfarbe), ok #1d6b46, warn #79591c, rot #9c2f2f.
  Dunkelmodus über prefers-color-scheme.

## Container-Logik
- Border-Radius 0, Schatten 0. Keine Pills, keine Badges, keine Karten-Grids.
- Header mit 2px-Unterlinie in Tinte; Navigation als Tab-Leiste mit 3px-Unterstrich
  am aktiven Eintrag (aria-current="page").
- Ablagefelder (Dropzone): 1px-Rahmen in Tinte mit innenliegender 1px-Linie
  (outline, offset -5px); im Drag-Zustand 2px in Blau.
- Dokumente (Rechnungsansicht, Prüfbericht): weiße Fläche mit 1px-Rand; Dokumentkopf
  mit 3px-Doppellinie; Endsummen über 3px-Doppellinie.
- Betonte Nebeninhalte: Linksstrich-Blöcke (3px) in blau, warn oder rot; keine Kästen.
- Featurelisten als Definitionslisten mit Trennlinien, FAQ als details mit Trennlinien.

## Zustände
- Fokus global :focus-visible mit 2px Blau. Hover mit definierten Farbwechseln.
- Fehler und Warnungen als Linksstrich-Blöcke mit role="alert".
- Bewegung nur als Farbtransition unter prefers-reduced-motion: no-preference;
  scrollIntoView nutzt "smooth" nur ohne Reduced Motion.

## Dateien
- Gemeinsames Stylesheet docs/stil.css; Werkzeugseiten tragen zusätzlich ihren
  seitenspezifischen Block (Dropzone, Blatt, Bericht). Die verkaufte Batch-App
  (pro/app-template.html) folgt derselben Palette und Kantenlogik.
