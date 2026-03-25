{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = [ pkgs.python3 ];

  shellHook = ''
        mkdir -p ./maps

        cat > /tmp/webdav_server.py <<'EOF'
    import http.server
    import os

    MAPS_DIR = os.path.join(os.getcwd(), "maps")
    APP_DIR = os.getcwd()

    MIME = {
        "html": "text/html",
        "js":   "application/javascript",
        "css":  "text/css",
        "ico":  "image/x-icon",
        "png":  "image/png",
        "svg":  "image/svg+xml",
        "mymind": "application/json",
    }

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            # /maps/ 以下はWebDAVストレージ
            if self.path.startswith("/maps/"):
                fpath = MAPS_DIR + self.path[len("/maps"):]
                if os.path.isfile(fpath):
                    data = open(fpath, "rb").read()
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    self.send_response(404)
                    self.cors()
                    self.end_headers()
                return

            # それ以外はmy-mindの静的ファイル
            p = self.path.split("?")[0]  # クエリ文字列を除去
            if p in ("/", ""):
                p = "/index.html"
            fpath = APP_DIR + p
            if os.path.isfile(fpath):
                data = open(fpath, "rb").read()
                ext = fpath.rsplit(".", 1)[-1]
                self.send_response(200)
                self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()

        def do_PUT(self):
            if self.path.startswith("/maps/"):
                fpath = MAPS_DIR + self.path[len("/maps"):]
            else:
                fpath = MAPS_DIR + self.path
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            length = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(length)
            open(fpath, "wb").write(data)
            print(f"[Saved] {fpath}")
            self.send_response(201)
            self.cors()
            self.end_headers()

        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Max-Age", "86400")

        def log_message(self, fmt, *args):
            print(f"[{self.command}] {self.path}")

    server = http.server.HTTPServer(("localhost", 8080), Handler)
    print("="*40)
    print("  App  : http://localhost:8080/")
    print("  DAV  : http://localhost:8080/maps/")
    print("="*40)
    server.serve_forever()
    EOF

        python3 /tmp/webdav_server.py &
        SERVER_PID=$!
        echo "Server PID: $SERVER_PID"
        trap "kill $SERVER_PID 2>/dev/null" EXIT
  '';
}
