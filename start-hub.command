#!/bin/bash
# Projekt-Hub starten (Mac): holt zuerst Updates, dann startet der Server.
cd "$(dirname "$0")"
if command -v git >/dev/null; then
  echo "Suche Updates..."
  git pull --ff-only || echo "Update nicht möglich – starte mit der vorhandenen Version."
fi
if ! command -v node >/dev/null; then
  echo "Node.js fehlt. Bitte installieren: https://nodejs.org"; read -r; exit 1
fi
(sleep 2; open http://localhost:3000) &
echo "Hub läuft auf http://localhost:3000 – dieses Fenster offen lassen."
node server.js
