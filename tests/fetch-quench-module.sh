#!/usr/bin/env bash
# Récupère le vrai module Foundry Quench (le paquet npm @ethaks/fvtt-quench n'est que des
# types TS, cf. tests/README.md) depuis ses releases GitHub, et le place dans .quench-module/
# (gitignored) pour que docker-compose.yml puisse le monter tel un module Foundry classique.
# À relancer si vous voulez mettre à jour la version de Quench utilisée pour les tests.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DEST=".quench-module"
RELEASE_URL="https://api.github.com/repos/Ethaks/FVTT-Quench/releases/latest"

echo "Récupération de la dernière release Quench..."
DOWNLOAD_URL="$(curl -fsSL "$RELEASE_URL" | grep -o '"browser_download_url": *"[^"]*module.zip"' | grep -o 'https://[^"]*')"

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Impossible de trouver module.zip dans la dernière release Quench." >&2
  exit 1
fi

# Sur Windows, un antivirus qui scanne le dossier juste après le run précédent peut bloquer sa
# suppression un court instant ("Device or resource busy") : on retente une fois avant d'abandonner.
rm -rf "$DEST" 2>/dev/null || { sleep 2; rm -rf "$DEST"; }
mkdir -p "$DEST"
curl -fsSL "$DOWNLOAD_URL" -o "$DEST/module.zip"
unzip -q "$DEST/module.zip" -d "$DEST"
rm "$DEST/module.zip"

# module.zip contient tout sous un dossier dist/ (y compris module.json) : on le remonte à la
# racine de $DEST pour que ce dossier soit directement montable comme module Foundry.
if [ -d "$DEST/dist" ]; then
  mv "$DEST"/dist/* "$DEST"/
  rmdir "$DEST/dist"
fi

echo "Quench installé dans $DEST/"
