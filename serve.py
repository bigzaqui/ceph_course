#!/usr/bin/env python3
"""
Multi-threaded local network web server for the Ceph & CephFS Motion Canvas MP4 Course.
Supports HTTP Range (206 Partial Content) for instant MP4 video seeking.
Binds to 0.0.0.0:8080 so any device on the private LAN can access it.
"""
import http.server
import os
import re
import urllib.parse

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080"))
WEB_DIR = os.path.dirname(os.path.abspath(__file__))


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        range_header = self.headers.get("Range")
        if not range_header:
            return super().do_GET()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()

        file_size = os.path.getsize(path)
        m = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if not m:
            return super().do_GET()

        start_str, end_str = m.groups()
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        end = min(end, file_size - 1)

        if start > end or start >= file_size:
            self.send_error(416, "Requested Range Not Satisfiable")
            return

        length = end - start + 1
        ctype = self.guess_type(path)

        try:
            with open(path, "rb") as f:
                f.seek(start)
                self.send_response(206, "Partial Content")
                self.send_header("Content-type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.end_headers()

                remaining = length
                chunk_size = 64 * 1024
                while remaining > 0:
                    data = f.read(min(chunk_size, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


class ReusableThreadingHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableThreadingHTTPServer((HOST, PORT), RangeHTTPRequestHandler) as httpd:
        print(f"Serving Ceph Motion Canvas MP4 Course at http://{HOST}:{PORT} (LAN: http://192.168.1.20:{PORT})", flush=True)
        httpd.serve_forever()
