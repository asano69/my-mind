package serve

import (
	"fmt"
	"net/http"

	"github.com/asano69/my-mind/internal/assets"
	"github.com/asano69/my-mind/internal/config"
	"github.com/asano69/my-mind/internal/db"

	"github.com/google/uuid"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/sirupsen/logrus"
)

const (
	mapsCollection      = "maps"
	snapshotsCollection = "snapshots"
)

// Run opens the database and collection once, registers all drill routes, then
// starts listening. The database and collection are shared across all sessions.
func Run(app *pocketbase.PocketBase, cfg *config.Config) error {
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)

	database, err := db.New(app)
	if err != nil {
		return err
	}

	// Every map gets a public uuid the moment it's first saved, so the
	// frontend can address it as /maps/<uuid> instead of depending on
	// PocketBase's own record id. UUIDv7 is used instead of v4 so ids are
	// time-ordered, which keeps the "uuid" index roughly insertion-sorted.
	app.OnRecordCreate(mapsCollection).BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("uuid") == "" {
			id, err := uuid.NewV7()
			if err != nil {
				return err
			}
			e.Record.Set("uuid", id.String())
		}
		return e.Next()
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Serve rendered map/snapshot thumbnails as real image responses
		// instead of embedding their SVG (with its own <style> block)
		// directly into the frontend's DOM. An SVG's <style> element is
		// not scoped to that SVG -- it applies globally to the whole
		// document -- so multiple thumbnails (or the live mind-map
		// canvas) rendered via innerHTML on the same page would bleed
		// their styles into each other. Serving them as an <img> src
		// instead sandboxes each SVG's CSS to its own image resource.
		e.Router.GET("/maps/{uuid}/svg", func(e *core.RequestEvent) error {
			record, err := app.FindFirstRecordByFilter(
				mapsCollection,
				"uuid = {:uuid}",
				dbx.Params{"uuid": e.Request.PathValue("uuid")},
			)
			if err != nil {
				return e.NotFoundError("map not found", err)
			}
			return e.Blob(http.StatusOK, "image/svg+xml", []byte(record.GetString("svg")))
		})
		e.Router.GET("/snapshots/{id}/svg", func(e *core.RequestEvent) error {
			record, err := app.FindRecordById(snapshotsCollection, e.Request.PathValue("id"))
			if err != nil {
				return e.NotFoundError("snapshot not found", err)
			}
			return e.Blob(http.StatusOK, "image/svg+xml", []byte(record.GetString("svg")))
		})

		// Serve the whole Vite build output as-is: index.html, editor.html,
		// the hashed assets/ bundle, and the public/ files copied alongside
		// them (theme.css, my-mind.css, favicon.svg, img/, ...). Any request
		// path that doesn't match a real file falls back to index.html so
		// Solid Router can take over client-side.
		e.Router.GET("/{path...}", apis.Static(assets.FS, true))
		return e.Next()
	})

	// Snapshot the working tier once a minute while maps are being
	// edited. Daily/weekly/... tiers are simple enough to be handled by
	// PocketBase's own cron-based collection rules instead (see
	// docs/design.md).
	app.Cron().MustAdd("workingSnapshotBackup", "* * * * *", func() {
		if err := database.BackupWorkingSnapshots(); err != nil {
			logrus.WithError(err).Error("working snapshot backup failed")
		}
	})

	logrus.WithField("addr", addr).Info("listening")
	return apis.Serve(app, apis.ServeConfig{
		HttpAddr:        addr,
		ShowStartBanner: false,
	})
}
