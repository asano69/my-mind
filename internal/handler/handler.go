package handler

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// catalog.html をバイナリに埋め込みます
//
//go:embed catalog.html
var embeddedFiles embed.FS

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

type mapEntry struct {
	Name    string
	URL     string
	ModTime time.Time
}

type Handler struct {
	StaticDir string
	MapsDir   string
	listTmpl  *template.Template
}

func New(staticDir, mapsDir string) *Handler {
	tmpl := template.Must(template.ParseFS(embeddedFiles, "catalog.html"))
	return &Handler{
		StaticDir: staticDir,
		MapsDir:   mapsDir,
		listTmpl:  tmpl,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	fmt.Printf("[%s] %s\n", r.Method, path)
	setCORSHeaders(w)

	switch r.Method {
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)

	case http.MethodGet:
		switch {
		case path == "/catalog":
			h.listMaps(w)
		case strings.HasPrefix(path, "/maps/"):
			h.getMap(w, path)
		case strings.HasPrefix(path, "/m/"):
			ext := strings.ToLower(filepath.Ext(path))
			switch ext {
			case "":
				http.Redirect(w, r, path+".mymind", http.StatusMovedPermanently)
			case ".mymind":
				h.serveIndex(w)
			default:
				h.serveStatic(w, strings.TrimPrefix(path, "/m"))
			}
		case path == "/" || path == "":
			now := time.Now()
			filename := fmt.Sprintf("%02d%02d%02d.mymind", now.Year()%100, now.Month(), now.Day())
			http.Redirect(w, r, "/m/"+filename, http.StatusFound)
		default:
			h.serveStatic(w, path)
		}

	case http.MethodPut:
		if strings.HasPrefix(path, "/maps/") {
			h.putMap(w, r, path)
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	case http.MethodPatch:
		if strings.HasPrefix(path, "/maps/") {
			h.renameMap(w, r, path)
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	case http.MethodDelete:
		if strings.HasPrefix(path, "/maps/") {
			h.deleteMap(w, path)
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) listMaps(w http.ResponseWriter) {
	entries, err := os.ReadDir(h.MapsDir)
	if err != nil {
		http.Error(w, "Failed to read maps directory", http.StatusInternalServerError)
		return
	}

	list := make([]mapEntry, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || strings.ToLower(filepath.Ext(e.Name())) != ".mymind" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		list = append(list, mapEntry{
			Name:    strings.TrimSuffix(e.Name(), ".mymind"),
			URL:     "/m/" + e.Name(),
			ModTime: info.ModTime(),
		})
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].ModTime.After(list[j].ModTime)
	})

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := h.listTmpl.Execute(w, list); err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
	}
}

func (h *Handler) serveIndex(w http.ResponseWriter) {
	fpath := filepath.Join(h.StaticDir, "index.html")
	data, err := os.ReadFile(fpath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(data)
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

// renameMap は PATCH /maps/{name}.mymind を処理する。
// ボディ: プレーンテキストの新しいベース名（拡張子なしでも可）。
// ファイルのリネームに加えて、JSON 内の root.text も新しいベース名に書き換える。
func (h *Handler) renameMap(w http.ResponseWriter, r *http.Request, path string) {
	srcRel := strings.TrimPrefix(path, "/maps")
	srcPath, err := safeJoin(h.MapsDir, srcRel)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if _, err := os.Stat(srcPath); err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	newBase := strings.TrimSpace(string(bodyBytes))
	if newBase == "" {
		http.Error(w, "New name is required", http.StatusBadRequest)
		return
	}
	// 拡張子を正規化
	newFileName := newBase
	if !strings.HasSuffix(newFileName, ".mymind") {
		newFileName += ".mymind"
	}
	if strings.ContainsAny(newFileName, `/\`) {
		http.Error(w, "Invalid name", http.StatusBadRequest)
		return
	}
	// root.text に使うベース名（拡張子なし）
	newText := strings.TrimSuffix(newFileName, ".mymind")

	dstPath := filepath.Join(h.MapsDir, newFileName)
	if srcPath != dstPath {
		if _, err := os.Stat(dstPath); err == nil {
			http.Error(w, "Already exists", http.StatusConflict)
			return
		}
	}

	// ファイルを読み込み、root.text を書き換える
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	var doc map[string]any
	if jsonErr := json.Unmarshal(raw, &doc); jsonErr == nil {
		if root, ok := doc["root"].(map[string]any); ok {
			root["text"] = newText
			doc["root"] = root
		}
		if updated, marshalErr := json.MarshalIndent(doc, "", "\t"); marshalErr == nil {
			raw = updated
		}
		// パース/マーシャル失敗時はファイル内容そのままでリネームのみ続行
	}

	if srcPath == dstPath {
		// ファイル名変更なし・JSON 内容だけ更新
		if err := os.WriteFile(srcPath, raw, 0644); err != nil {
			http.Error(w, "Failed to write file", http.StatusInternalServerError)
			return
		}
	} else {
		// 新パスに書いてから旧ファイルを削除（クロスデバイスでも安全）
		if err := os.WriteFile(dstPath, raw, 0644); err != nil {
			http.Error(w, "Failed to write file", http.StatusInternalServerError)
			return
		}
		if err := os.Remove(srcPath); err != nil {
			os.Remove(dstPath) // ロールバック
			http.Error(w, "Failed to remove old file", http.StatusInternalServerError)
			return
		}
	}

	fmt.Printf("[Renamed] %s -> %s (root.text=%q)\n", srcPath, dstPath, newText)
	w.WriteHeader(http.StatusNoContent)
}

// deleteMap は DELETE /maps/{name}.mymind を処理する。
func (h *Handler) deleteMap(w http.ResponseWriter, path string) {
	rel := strings.TrimPrefix(path, "/maps")
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
	if err := os.Remove(fpath); err != nil {
		http.Error(w, "Failed to delete", http.StatusInternalServerError)
		return
	}
	fmt.Printf("[Deleted] %s\n", fpath)
	w.WriteHeader(http.StatusNoContent)
}

func safeJoin(base, reqPath string) (string, error) {
	reqPath = strings.TrimPrefix(reqPath, "/")
	clean := filepath.Clean(reqPath)
	if strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("invalid path")
	}
	return filepath.Join(base, clean), nil
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
}
