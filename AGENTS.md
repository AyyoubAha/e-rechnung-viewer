# Hinweise für Agenten

Dieses Repo ist die Quelle der Website (docs/) und der Batch-App (pro/). Entwickelt wird
direkt hier auf main; Betriebswissen und Verkaufs-IDs liegen im privaten Repo GeldMacher.

Vor jeder Änderung lesen:
- docs-standards/PRODUCT_QUALITY_STANDARD.md (alle Prüfungen, die grün sein müssen)
- docs-standards/DESIGN_SYSTEM.md (Gestaltung „Fachliteratur")
- docs-standards/VOICE_AND_COPY.md (Textregeln, per test/copy-lint.mjs erzwungen)
- docs-standards/STACK_DECISIONS.md und DEFINITION_OF_DONE.md

Schnellprüfung: npm test && node test/copy-lint.mjs. Vollprüfung siehe Qualitätsstandard.
