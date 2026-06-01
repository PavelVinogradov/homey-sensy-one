#!/bin/bash
# Serve zone editor locally to avoid CORS/HTTPS issues when opening file:// directly.
# Usage: ./serve.sh [port]
PORT=${1:-8080}
echo "Zone editor: http://localhost:$PORT/zone-editor.html"
python3 -m http.server "$PORT"
