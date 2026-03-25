package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	port    = ":8080"
	mapsDir = "./maps"
	appDir  = "."
)

var mimeTypes = map[string]string{
	".html":   "text/html; charset=utf-8",
	".js":     "application/javascript",
	".css":    "text/css",
	".ico":    "image/x-icon",
	".png":    "image/png",
	".svg":    "image/svg+xml",
	".gif":    "image/gif",
	".mymind": "application/json",
}

func corsHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

func handler(w http.ResponseWriter, r *http.Request) {
	decodedPath, err := url.QueryUnescape(r.URL.RequestURI())
	if err != nil {
		decodedPath = r.URL.Path
	}

	fmt.Printf("[%s] %s\n", r.Method, decodedPath)

	corsHeaders(w)

	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)

	case http.MethodGet:
		if strings.HasPrefix(decodedPath, "/maps/") {
			serveMapFile(w, r, decodedPath)
		} else {
			serveAppFile(w, r, decodedPath)
		}

	case http.MethodPut:
		saveMapFile(w, r, decodedPath)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func serveMapFile(w http.ResponseWriter, r *http.Request, path string) {
	fpath := filepath.Join(mapsDir, strings.TrimPrefix(path, "/maps"))
	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func serveAppFile(w http.ResponseWriter, r *http.Request, path string) {
	// クエリ文字列を除去
	path = strings.SplitN(path, "?", 2)[0]
	if path == "/" || path == "" {
		path = "/index.html"
	}

	fpath := filepath.Join(appDir, path)
	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	ext := strings.ToLower(filepath.Ext(fpath))
	mime, ok := mimeTypes[ext]
	if !ok {
		mime = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mime)
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func saveMapFile(w http.ResponseWriter, r *http.Request, path string) {
	var fpath string
	if strings.HasPrefix(path, "/maps/") {
		fpath = filepath.Join(mapsDir, strings.TrimPrefix(path, "/maps"))
	} else {
		fpath = filepath.Join(mapsDir, path)
	}

	if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
		http.Error(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	if err := os.WriteFile(fpath, data, 0644); err != nil {
		http.Error(w, "Failed to write file", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[Saved] %s\n", fpath)
	w.WriteHeader(http.StatusCreated)
}

func main() {
	if err := os.MkdirAll(mapsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create maps dir: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("========================================")
	fmt.Printf("  App  : http://localhost%s/\n", port)
	fmt.Printf("  DAV  : http://localhost%s/maps/\n", port)
	fmt.Println("========================================")

	http.HandleFunc("/", handler)
	if err := http.ListenAndServe(port, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
