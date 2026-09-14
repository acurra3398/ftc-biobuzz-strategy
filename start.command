#!/bin/sh
# Double-click this file in Finder to launch the app.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8734}"
echo "Close this window (or press Ctrl-C) to stop."
( sleep 1; open "http://localhost:$PORT" ) &
exec python3 serve.py "$PORT"
