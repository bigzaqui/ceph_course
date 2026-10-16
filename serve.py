#!/usr/bin/env python3
"""
Local network web server for the Ceph & CephFS Visual Animation.
Binds to 0.0.0.0:8080, serves static files, caches ElevenLabs MP3s to /opt/argon/audio/,
and pre-generates any missing ElevenLabs segments in a background thread on startup.
"""
import http.server
import socketserver
import threading
import urllib.parse
import os

from generate_elevenlabs import synthesize_all

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080"))
WEB_DIR = os.path.dirname(os.path.abspath(__file__))


class CephAnimationHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/save-audio":
            qs = urllib.parse.parse_qs(parsed.query)
            rel_file = qs.get("file", [""])[0]
            # Only allow saving inside audio/seg-*.mp3
            if rel_file.startswith("audio/seg-") and rel_file.endswith(".mp3") and ".." not in rel_file:
                length = int(self.headers.get("Content-Length", "0"))
                if 1000 < length < 10_000_000:
                    data = self.rfile.read(length)
                    dest = os.path.join(WEB_DIR, rel_file)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, "wb") as f:
                        f.write(data)
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"OK")
                    return
        self.send_response(400)
        self.end_headers()


if __name__ == "__main__":
    # Start background ElevenLabs pre-generation into /opt/argon/audio/
    threading.Thread(target=synthesize_all, kwargs={"quiet": False}, daemon=True).start()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((HOST, PORT), CephAnimationHandler) as httpd:
        print(f"Serving Ceph Visualized at http://{HOST}:{PORT} (LAN: http://192.168.1.20:{PORT})")
        httpd.serve_forever()
