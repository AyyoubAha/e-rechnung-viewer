# E-Rechnung Viewer – XRechnung & ZUGFeRD kostenlos öffnen

**E-Rechnungen (XRechnung-XML und ZUGFeRD-PDF) im Browser öffnen, lesen, prüfen und als PDF
drucken – 100 % lokal, ohne Upload, ohne Registrierung.**

➡️ **Tool nutzen: https://ayyoubaha.github.io/e-rechnung-viewer/**

Seit dem 1.1.2025 müssen alle Unternehmer in Deutschland E-Rechnungen empfangen können — auch
Kleinunternehmer, Vermieter und Vereine. Wer eine `rechnung.xml` per E-Mail bekommt, sieht ohne
Viewer nur Spitzklammern. Dieses Tool macht daraus wieder eine lesbare Rechnung.

## Funktionen

- **XRechnung öffnen** — beide XML-Syntaxen (UBL und UN/CEFACT CII) werden unterstützt
- **ZUGFeRD / Factur-X lesen** — extrahiert und zeigt das im PDF eingebettete Rechnungs-XML
- **XML-Rechnung in PDF umwandeln** — aufbereitete Ansicht über den Druckdialog als PDF speichern
- **Plausibilitätsprüfung** — Hinweise auf fehlende Pflichtangaben und unstimmige Summen
  (Netto + USt ≠ Brutto, Positionssummen)
- **Mehrere Dateien** gleichzeitig laden und durchklicken
- **Zahlungsdaten auf einen Blick** — IBAN, Verwendungszweck, Fälligkeit, Zahlungsbedingungen

## Datenschutz: keine Server, kein Upload

Die Verarbeitung findet **ausschließlich lokal in deinem Browser** statt. Es gibt keinen Server,
der deine Rechnungen sieht — die Seite lädt nicht einmal Inhalte von Dritt-CDNs nach
(pdf.js wird mitgeliefert). Nach dem ersten Laden funktioniert das Tool auch offline.
Das unterscheidet es von den meisten Online-Viewern, die deine Rechnung auf ihre Server hochladen.

Läuft auf **Windows, macOS, Linux, iPad und Android** — ohne Installation.

## Unterstützte Formate

| Format | Endung | Unterstützt |
|---|---|---|
| XRechnung (UBL Invoice / CreditNote) | `.xml` | ✅ |
| XRechnung (UN/CEFACT CII) | `.xml` | ✅ |
| ZUGFeRD 2.x / Factur-X (PDF mit eingebettetem XML) | `.pdf` | ✅ |
| ZUGFeRD 1.0 (ZUGFeRD-invoice.xml) | `.pdf` | ✅ |

## Entwicklung

Kein Build-Schritt — `docs/` ist die komplette Website (statisch, Vanilla JS).

```bash
npm install        # nur für Tests nötig
npm test           # Unit-Tests des Parsers (gegen offizielle KoSIT-Beispieldateien)
node test/e2e.mjs  # End-to-End-Test im echten Chromium
```

## Lizenz

MIT — siehe [LICENSE](LICENSE). Enthält [pdf.js](https://github.com/mozilla/pdf.js)
(Apache-2.0, siehe `docs/vendor/PDFJS-LICENSE`).

---

*Hinweise auf dieser Seite und im Tool sind keine Steuer- oder Rechtsberatung.*
