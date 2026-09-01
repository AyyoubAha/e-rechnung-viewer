# E-Rechnung Viewer – XRechnung & ZUGFeRD öffnen, erstellen und prüfen

**E-Rechnungen (XRechnung-XML und ZUGFeRD-PDF) im Browser öffnen, lesen, prüfen und als PDF
drucken – 100 % lokal, ohne Upload, ohne Registrierung.**

➡️ **Tool nutzen: https://ayyoubaha.github.io/e-rechnung-viewer/**

Seit dem 1.1.2025 müssen alle Unternehmer in Deutschland E-Rechnungen empfangen können – auch
Kleinunternehmer, Vermieter und Vereine. Wer eine `rechnung.xml` per E-Mail bekommt, sieht ohne
Viewer nur Spitzklammern. Dieses Tool macht daraus wieder eine lesbare Rechnung.

## Werkzeuge

| Werkzeug | Link |
|---|---|
| E-Rechnung öffnen und lesen (XRechnung, ZUGFeRD, Factur-X, Peppol/UBL) | [Viewer](https://ayyoubaha.github.io/e-rechnung-viewer/) |
| XRechnung erstellen, auch als ZUGFeRD-PDF | [Erstellen](https://ayyoubaha.github.io/e-rechnung-viewer/erstellen.html) |
| Gegen die offiziellen KoSIT-Regeln validieren (EN 16931 + XRechnung CIUS) | [Prüfen](https://ayyoubaha.github.io/e-rechnung-viewer/pruefen.html) |
| English: viewer and EN 16931 validator | [English tools](https://ayyoubaha.github.io/e-rechnung-viewer/en/) |
| XRechnungen im Stapel aus einer Excel-Vorlage (kostenpflichtig) | [Batch Pro](https://ayyoubaha.github.io/e-rechnung-viewer/batch-pro.html) |

## Funktionen des Viewers

- **XRechnung öffnen** – beide XML-Syntaxen (UBL und UN/CEFACT CII) werden unterstützt
- **ZUGFeRD / Factur-X lesen** – extrahiert und zeigt das im PDF eingebettete Rechnungs-XML
- **XML-Rechnung in PDF umwandeln** – aufbereitete Ansicht über den Druckdialog als PDF speichern
- **Plausibilitätsprüfung** – Hinweise auf fehlende Pflichtangaben und unstimmige Summen
  (Netto + USt ≠ Brutto, Positionssummen)
- **Mehrere Dateien** gleichzeitig laden und durchklicken
- **Zahlungsdaten auf einen Blick** – IBAN, Verwendungszweck, Fälligkeit, Zahlungsbedingungen

## Datenschutz: keine Server, kein Upload

Die Verarbeitung findet **ausschließlich lokal in deinem Browser** statt. Es gibt keinen Server,
der deine Rechnungen sieht – die Seite lädt nicht einmal Inhalte von Dritt-CDNs nach
(pdf.js wird mitgeliefert). Nach dem ersten Laden funktioniert das Tool auch offline.
Das unterscheidet es von den meisten Online-Viewern, die deine Rechnung auf ihre Server hochladen.

Läuft auf **Windows, macOS, Linux, iPad und Android** – ohne Installation.

## Unterstützte Formate

| Format | Endung | Unterstützt |
|---|---|---|
| XRechnung (UBL Invoice / CreditNote) | `.xml` | ✅ |
| XRechnung (UN/CEFACT CII) | `.xml` | ✅ |
| ZUGFeRD 2.x / Factur-X (PDF mit eingebettetem XML) | `.pdf` | ✅ |
| ZUGFeRD 1.0 (ZUGFeRD-invoice.xml) | `.pdf` | ✅ |

## Ratgeber

- [E-Rechnungspflicht 2027 und 2028: Zeitplan und Pflichten](https://ayyoubaha.github.io/e-rechnung-viewer/e-rechnung-pflicht-2027-2028.html)
- [E-Rechnung für Kleinunternehmer (§ 19 UStG)](https://ayyoubaha.github.io/e-rechnung-viewer/e-rechnung-kleinunternehmer.html)
- [E-Rechnung für Vermieter](https://ayyoubaha.github.io/e-rechnung-viewer/e-rechnung-vermieter.html)
- [E-Rechnung für Vereine](https://ayyoubaha.github.io/e-rechnung-viewer/e-rechnung-verein.html)
- [ZUGFeRD-Datei öffnen](https://ayyoubaha.github.io/e-rechnung-viewer/zugferd-datei-oeffnen.html)
- [XML-Rechnung in PDF umwandeln](https://ayyoubaha.github.io/e-rechnung-viewer/xml-rechnung-in-pdf-umwandeln.html)
- [XRechnung auf dem Mac öffnen](https://ayyoubaha.github.io/e-rechnung-viewer/xrechnung-oeffnen-mac.html)

## Entwicklung

Kein Build-Schritt – `docs/` ist die komplette Website (statisch, Vanilla JS).

```bash
npm install        # nur für Tests nötig
npm test           # Unit-Tests des Parsers (gegen offizielle KoSIT-Beispieldateien)
node test/e2e.mjs  # End-to-End-Test im echten Chromium
```

## Lizenz

MIT – siehe [LICENSE](LICENSE). Enthält [pdf.js](https://github.com/mozilla/pdf.js)
(Apache-2.0, siehe `docs/vendor/PDFJS-LICENSE`).

---

*Hinweise auf dieser Seite und im Tool sind keine Steuer- oder Rechtsberatung.*
