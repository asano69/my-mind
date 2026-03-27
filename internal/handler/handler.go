package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
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
	path := r.URL.Path
	fmt.Printf("[%s] %s\n", r.Method, path)
	setCORSHeaders(w)
	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		if strings.HasPrefix(path, "/maps/") {
			h.getMap(w, path)
		} else if strings.HasPrefix(path, "/m/") {
			ext := strings.ToLower(filepath.Ext(path))
			if ext == "" {
				http.Redirect(w, r, path+".mymind", http.StatusMovedPermanently)
			} else if ext == ".mymind" {
				h.serveIndex(w)
			} else {
				stripped := strings.TrimPrefix(path, "/m")
				h.serveStatic(w, stripped)
			}
		} else {
			if path == "/" || path == "" {
				now := time.Now()
				filename := fmt.Sprintf("%02d%02d%02d.mymind", now.Year()%100, now.Month(), now.Day())
				http.Redirect(w, r, "/m/"+filename, http.StatusFound)
				return
			}
			h.serveStatic(w, path)
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

// 追加
func (h *Handler) serveIndex(w http.ResponseWriter) {
	fpath := filepath.Join(h.StaticDir, "index.html")
	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func safeJoin(base, reqPath string) (string, error) {
	reqPath = strings.TrimPrefix(reqPath, "/")
	clean := filepath.Clean(reqPath)
	if strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("invalid path")
	}
	return filepath.Join(base, clean), nil
}

func (h *Handler) getMap(w http.ResponseWriter, path string) {
	rel := strings.TrimPrefix(path, "/maps")
	if rel == "" || rel == "/" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	fpath, err := safeJoin(h.MapsDir, rel)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fpath)
	if err != nil || info.IsDir() {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (h *Handler) serveStatic(w http.ResponseWriter, path string) {
	path = strings.SplitN(path, "?", 2)[0]
	if path == "/" || path == "" {
		path = "/index.html"
	}
	fpath, err := safeJoin(h.StaticDir, path)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
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
	fpath, err := safeJoin(h.MapsDir, strings.TrimPrefix(path, "/maps"))
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
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

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
}
