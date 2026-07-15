// Package serve implements the "serve" command, which runs a single HTTP server
// that hosts the index page and all drill sessions defined in the config file.
package serve

import (
	"fmt"

	"github.com/asano69/my-mind/internal/assets"
	"github.com/asano69/my-mind/internal/config"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/sirupsen/logrus"
)

// Run opens the database and collection once, registers all drill routes, then
// starts listening. The database and collection are shared across all sessions.
func Run(app *pocketbase.PocketBase, cfg *config.Config) error {
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)

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
