package handler

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

//go:embed templates/*.html
var templateFS embed.FS

// all:dist includes dotfiles too (not needed here, but harmless and future-proof).
//
//go:embed all:dist
var rawDistFS embed.FS

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

// mapsCollection is the PocketBase collection that stores mind maps.
// Each record holds one map's full JSON payload in its "mymind" field.
// There is no dedicated "name" field: the map's name is the root item's
// text, read out of that JSON payload on demand.
const mapsCollection = "maps"

// pageMeta holds the data passed to the base template partial.
type pageMeta struct {
	Title   string
	Favicon bool
}

// catalogData is the template data for catalog.html.
type catalogData struct {
	PageMeta pageMeta
	Maps     []mapEntry
}

// indexData is the template data for index.html / editor.html.
type indexData struct {
	PageMeta pageMeta
}

type mapEntry struct {
	Name    string
	URL     string
	ModTime time.Time
}

type Handler struct {
	App         core.App
	assets      fs.FS // Vite build output (internal/handler/dist), rooted at "."
	catalogTmpl *template.Template
	indexTmpl   *template.Template
	editorTmpl  *template.Template
}

// New builds a Handler backed by the given PocketBase app. The app must
// already have the "maps" collection (see migrations/collections snapshot).
func New(app core.App) *Handler {
	// Each child template is parsed first so it becomes the entry point for
	// Execute(). base.html is parsed second so its {{define "base"}} block is
	// available when the child calls {{template "base" .PageMeta}}.
	const base = "templates/base.html"

	catalogTmpl := template.Must(template.ParseFS(templateFS, "templates/catalog.html", base))
	indexTmpl := template.Must(template.ParseFS(templateFS, "templates/index.html", base))
	editorTmpl := template.Must(template.ParseFS(templateFS, "templates/editor.html", base))

	// Strip the "dist" prefix so asset paths match what the templates/JS
	// reference (e.g. "theme.css", "my-mind.js"), not "dist/theme.css".
	assets, err := fs.Sub(rawDistFS, "dist")
	if err != nil {
		panic(err) // programmer error: dist/ must exist at build time
	}

	return &Handler{
		App:         app,
		assets:      assets,
		catalogTmpl: catalogTmpl,
		indexTmpl:   indexTmpl,
		editorTmpl:  editorTmpl,
	}
}

// renderTemplate buffers template execution so that a template error never
// triggers a superfluous WriteHeader call after the response has already
// started being written.
func renderTemplate(w http.ResponseWriter, tmpl *template.Template, data any) {
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		http.Error(w, "Template error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(buf.Bytes())
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
			h.getMap(w, nameFromMapsPath(path))
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
			h.putMap(w, r, nameFromMapsPath(path))
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	case http.MethodPatch:
		if strings.HasPrefix(path, "/maps/") {
			h.renameMap(w, r, nameFromMapsPath(path))
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	case http.MethodDelete:
		if strings.HasPrefix(path, "/maps/") {
			h.deleteMap(w, nameFromMapsPath(path))
		} else {
			http.Error(w, "Forbidden", http.StatusForbidden)
		}

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// nameFromMapsPath extracts the map name from a "/maps/{name}.mymind" path.
func nameFromMapsPath(path string) string {
	rel := strings.TrimPrefix(path, "/maps/")
	return strings.TrimSuffix(rel, ".mymind")
}

// findMapRecord looks up a maps-collection record by the name stored in its
// mymind.root.text field. PocketBase resolves the dotted path directly
// against the JSON column, so no dedicated "name" field is needed.
func (h *Handler) findMapRecord(name string) (*core.Record, error) {
	return h.App.FindFirstRecordByFilter(
		mapsCollection,
		"mymind.root.text = {:name}",
		dbx.Params{"name": name},
	)
}

// mapName reads the map's display name out of its mymind JSON payload.
func mapName(record *core.Record) string {
	data, err := json.Marshal(record.Get("mymind"))
	if err != nil {
		return ""
	}
	var doc struct {
		Root struct {
			Text string `json:"text"`
		} `json:"root"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return ""
	}
	return doc.Root.Text
}

func (h *Handler) listMaps(w http.ResponseWriter) {
	records, err := h.App.FindRecordsByFilter(mapsCollection, "", "-updated", 0, 0)
	if err != nil {
		http.Error(w, "Failed to read maps: "+err.Error(), http.StatusInternalServerError)
		return
	}

	list := make([]mapEntry, 0, len(records))
	for _, record := range records {
		name := mapName(record)
		if name == "" {
			continue
		}
		list = append(list, mapEntry{
			Name:    name,
			URL:     "/m/" + name + ".mymind",
			ModTime: record.GetDateTime("updated").Time(),
		})
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].ModTime.After(list[j].ModTime)
	})

	renderTemplate(w, h.catalogTmpl, catalogData{
		PageMeta: pageMeta{Title: "Maps"},
		Maps:     list,
	})
}

func (h *Handler) serveIndex(w http.ResponseWriter) {
	renderTemplate(w, h.indexTmpl, indexData{
		PageMeta: pageMeta{Title: "My Mind", Favicon: true},
	})
}

func (h *Handler) serveEditor(w http.ResponseWriter) {
	renderTemplate(w, h.editorTmpl, indexData{
		PageMeta: pageMeta{Title: "Editor"},
	})
}

func (h *Handler) getMap(w http.ResponseWriter, name string) {
	if name == "" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	record, err := h.findMapRecord(name)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	data, err := json.Marshal(record.Get("mymind"))
	if err != nil {
		http.Error(w, "Failed to encode map: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// serveStatic serves a file out of the embedded Vite build (h.assets).
// editor.html is special-cased below: it's a Go template, not a static file.
func (h *Handler) serveStatic(w http.ResponseWriter, path string) {
	path = strings.SplitN(path, "?", 2)[0]
	if path == "/" || path == "" {
		path = "/index.html"
	}

	if path == "/editor.html" {
		h.serveEditor(w)
		return
	}

	// embed.FS/fs.FS paths are always "/"-separated and must not start with "/".
	rel := strings.TrimPrefix(path, "/")
	clean := filepath.ToSlash(filepath.Clean(rel))
	if clean == ".." || strings.HasPrefix(clean, "../") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	data, err := fs.ReadFile(h.assets, clean)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	ext := strings.ToLower(filepath.Ext(clean))
	mime, ok := mimeTypes[ext]
	if !ok {
		mime = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mime)
	w.Write(data)
}

// putMap creates or overwrites the map record whose root.text matches name
// with the JSON payload from the request body.
func (h *Handler) putMap(w http.ResponseWriter, r *http.Request, name string) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	record, err := h.findMapRecord(name)
	if err != nil {
		collection, err := h.App.FindCollectionByNameOrId(mapsCollection)
		if err != nil {
			http.Error(w, "maps collection not found: "+err.Error(), http.StatusInternalServerError)
			return
		}
		record = core.NewRecord(collection)
	}
	record.Set("mymind", payload)
	if err := h.App.Save(record); err != nil {
		http.Error(w, "Failed to save map: "+err.Error(), http.StatusInternalServerError)
		return
	}
	fmt.Printf("[Saved] %s\n", name)
	w.WriteHeader(http.StatusCreated)
}

// renameMap handles PATCH /maps/{name}.mymind.
// Body: plain-text new base name (extension optional).
// Renames the map by rewriting root.text inside its JSON payload.
func (h *Handler) renameMap(w http.ResponseWriter, r *http.Request, oldName string) {
	record, err := h.findMapRecord(oldName)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	newName := strings.TrimSpace(strings.TrimSuffix(string(body), ".mymind"))
	if newName == "" {
		http.Error(w, "New name is required", http.StatusBadRequest)
		return
	}

	if newName != oldName {
		if existing, err := h.findMapRecord(newName); err == nil && existing.Id != record.Id {
			http.Error(w, "Already exists", http.StatusConflict)
			return
		}
	}

	var doc map[string]any
	data, err := json.Marshal(record.Get("mymind"))
	if err != nil {
		http.Error(w, "Failed to read map: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		http.Error(w, "Failed to read map: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if root, ok := doc["root"].(map[string]any); ok {
		root["text"] = newName
		doc["root"] = root
	}
	record.Set("mymind", doc)

	if err := h.App.Save(record); err != nil {
		http.Error(w, "Failed to rename map: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[Renamed] %s -> %s\n", oldName, newName)
	w.WriteHeader(http.StatusNoContent)
}

// deleteMap handles DELETE /maps/{name}.mymind.
func (h *Handler) deleteMap(w http.ResponseWriter, name string) {
	record, err := h.findMapRecord(name)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err := h.App.Delete(record); err != nil {
		http.Error(w, "Failed to delete: "+err.Error(), http.StatusInternalServerError)
		return
	}
	fmt.Printf("[Deleted] %s\n", name)
	w.WriteHeader(http.StatusNoContent)
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Max-Age", "86400")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
}
