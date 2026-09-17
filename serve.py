#!/usr/bin/env python3
"""Static server for FTC Strategy Lab.

Same idea as `python -m http.server`, with two differences that matter:
  * it sends no-cache headers, so editing a file and hitting reload actually
    shows the edit instead of a stale copy;
  * it opens your browser for you.

Works the same on Windows, macOS and Linux. Run it directly:

    py serve.py            (Windows)
    python3 serve.py       (macOS / Linux)

Pass a port number to use a different one, or --no-open to stay put.
"""
import os
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8734


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Only complain about non-2xx responses; a normal load is noise.
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def main(argv):
    args = [a for a in argv[1:] if a != "--no-open"]
    open_browser = "--no-open" not in argv[1:]
    port = int(args[0]) if args else int(os.environ.get("PORT", PORT))

    root = os.path.dirname(os.path.abspath(__file__))
    url = f"http://localhost:{port}"
    handler = partial(NoCacheHandler, directory=root)

    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as err:
        print(f"Could not start on port {port}: {err}")
        print("Something else is probably using it. Try:  python serve.py 8735")
        return 1

    print(f"FTC Strategy Lab  ->  {url}")
    print("Leave this window open. Close it (or press Ctrl-C) to stop.")
    if open_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
