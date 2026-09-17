#!/bin/sh
# Double-click this file in Finder to launch the app. (Windows: start.bat)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 serve.py "$@"; fi
if command -v python  >/dev/null 2>&1; then exec python  serve.py "$@"; fi
if command -v node    >/dev/null 2>&1; then exec node tools/serve.mjs "$@"; fi
echo "Needs Python or Node. Install one: https://www.python.org/downloads/"
