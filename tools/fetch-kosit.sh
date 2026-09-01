#!/usr/bin/env bash
# Lädt den offiziellen KoSIT-Validator + XRechnung-Konfiguration in ein Zielverzeichnis.
# Nutzung: tools/fetch-kosit.sh /pfad/zum/ziel  → danach: KOSIT_DIR=/pfad node test/validate-kosit.mjs
set -euo pipefail
DEST="${1:?Zielverzeichnis fehlt}"
mkdir -p "$DEST/xr-config"
VALIDATOR_URL="https://github.com/itplr-kosit/validator/releases/download/v1.6.3/validator-1.6.3-standalone.jar"
VALIDATOR_SHA="799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9"
CONFIG_URL="https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/release-2025-07-10/validator-configuration-xrechnung_3.0.2_2025-07-10.zip"
[ -f "$DEST/validator.jar" ] || curl -sL -o "$DEST/validator.jar" "$VALIDATOR_URL"
echo "$VALIDATOR_SHA  $DEST/validator.jar" | sha256sum -c -
[ -f "$DEST/xr-config/scenarios.xml" ] || { curl -sL -o "$DEST/xr-config.zip" "$CONFIG_URL"; python3 -c "import zipfile,sys; zipfile.ZipFile('$DEST/xr-config.zip').extractall('$DEST/xr-config')"; }
echo "KoSIT-Validator bereit in $DEST"
