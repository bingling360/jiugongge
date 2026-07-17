#!/usr/bin/env python3
"""Playwright 专用的安静静态服务器，兼容魔塔的合并楼层入口。"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, _format, *args):
        pass

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/__all_floors__.js":
            ids = parse_qs(parsed.query).get("id", [])
            floor_ids = ids[0].split(",") if ids else []
            parts = []
            for floor_id in floor_ids:
                filename = ROOT / "project" / "floors" / f"{floor_id}.js"
                if not filename.is_file():
                    self.send_error(404)
                    return
                parts.append(filename.read_text(encoding="utf-8"))
            payload = "\n".join(parts).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if parsed.path == "/__all_animates__":
            ids = parse_qs(parsed.query).get("id", [])
            animate_ids = ids[0].split(",") if ids else []
            parts = []
            for animate_id in animate_ids:
                filename = ROOT / "project" / "animates" / f"{animate_id}.animate"
                parts.append(filename.read_text(encoding="utf-8") if filename.is_file() else "")
            payload = "@@@~~~###~~~@@@".join(parts).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path == "/listFile":
            payload = b"[]"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if urlparse(self.path).path in ("/games/upload.php", "/games/competition/upload.php"):
            payload = b""
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_error(404)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 3000), Handler).serve_forever()
