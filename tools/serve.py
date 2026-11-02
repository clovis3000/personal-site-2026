#!/usr/bin/env python3
"""Serve site/ locally with no-store caching. Usage: serve.py [port]

Plain http.server sends no Cache-Control, so Chrome guesses a lifetime from Last-Modified and keeps module workers
even through a hard reload: on 2026-11-02 a stale paint-worker.js dropped the caelum's spin groups and the arch
painted but never turned. The sketchbook (graphic-explorations/incipit/serve.py) serves the same way for the same reason."""
import sys, os, http.server, socketserver

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 4747
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site"))
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", port), H) as s:
    print(f"http://127.0.0.1:{port}", flush=True)
    s.serve_forever()
