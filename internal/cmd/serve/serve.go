package serve

import (
	"fmt"

	"github.com/asano69/my-mind/internal/assets"
	"github.com/asano69/my-mind/internal/config"

	"github.com/google/uuid"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/sirupsen/logrus"
)

const mapsCollection = "maps"

// Run opens the database and collection once, registers all drill routes, then
// starts listening. The database and collection are shared across all sessions.
func Run(app *pocketbase.PocketBase, cfg *config.Config) error {
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)

	// Every map gets a public uuid the moment it's first saved, so the
	// frontend can address it as /maps/<uuid> instead of depending on
	// PocketBase's own record id.
	app.OnRecordCreate(mapsCollection).BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("uuid") == "" {
			e.Record.Set("uuid", uuid.NewString())
		}
		return e.Next()
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Serve the whole Vite build output as-is: index.html, editor.html,
		// the hashed assets/ bundle, and the public/ files copied alongside
		// them (theme.css, my-mind.css, favicon.svg, img/, ...). Any request
		// path that doesn't match a real file falls back to index.html so
		// Solid Router can take over client-side.
		e.Router.GET("/{path...}", apis.Static(assets.FS, true))
		return e.Next()
	})

	logrus.WithField("addr", addr).Info("listening")
	return apis.Serve(app, apis.ServeConfig{
		HttpAddr:        addr,
		ShowStartBanner: false,
	})
}
