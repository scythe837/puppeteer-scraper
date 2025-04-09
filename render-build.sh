#!/usr/bin/env bash
# exit on error
set -o errexit

# Instalează dependențele proiectului (folosește npm dacă nu ai yarn.lock)
yarn install 

# Instalează explicit browserul folosind Puppeteer CLI
# Acest pas este crucial și mai sigur decât a te baza doar pe env var
# Asigură-te că folosești npx dacă puppeteer nu e global
npx puppeteer browsers install chrome 

echo "Build finalizat cu succes și Chromium descărcat."
