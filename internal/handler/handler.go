package handler

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
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

type Handler struct {
	StaticDir string
	MapsDir   string
}

func New(staticDir, mapsDir string) *Handler {
	return &Handler{StaticDir: staticDir, MapsDir: mapsDir}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path, err := url.QueryUnescape(r.URL.RequestURI())
	if err != nil {
		path = r.URL.Path
	}

	fmt.Printf("[%s] %s\n", r.Method, path)

	setCORSHeaders(w)

	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		if strings.HasPrefix(path, "/maps/") {
			h.getMap(w, path)
		} else {
			h.getStatic(w, path)
		}
	case http.MethodPut:
		if strings.HasPrefix(path, "/maps/") {
			h.putMap(w, r, path)
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) getMap(w http.ResponseWriter, path string) {
	fpath := filepath.Join(h.MapsDir, strings.TrimPrefix(path, "/maps"))
	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (h *Handler) getStatic(w http.ResponseWriter, path string) {
	// クエリ文字列を除去
	path = strings.SplitN(path, "?", 2)[0]
	if path == "/" || path == "" {
		path = "/index.html"
	}

	fpath := filepath.Join(h.StaticDir, path)
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

func (h *Handler) putMap(w http.ResponseWriter, r *http.Request, path string) {
	fpath := filepath.Join(h.MapsDir, strings.TrimPrefix(path, "/maps"))

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

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
}
