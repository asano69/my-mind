// main.go
package main

import (
	"fmt"
	"os"

	"github.com/pocketbase/pocketbase"
	pbcmd "github.com/pocketbase/pocketbase/cmd"
	"github.com/spf13/cobra"

	"github.com/asano69/my-mind/internal/cmd/serve"

	"github.com/asano69/my-mind/internal/config"
	_ "github.com/asano69/my-mind/migrations"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{HideStartBanner: true})

	// Registers "my-mind migrate up/down/create/collections/history-sync"
	// for manual or CI-driven schema management. Automigrate is off because
	// the schema is defined purely in Go migration files (internal/migrations),
	// not edited through the PocketBase dashboard.
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: false,
	})

	root := app.RootCmd
	root.Use = "my-mind"
	root.Short = "my-mind"
	root.SilenceUsage = true
	root.Version = "0.0.1-beta.3"

	root.AddCommand(

		serveCmd(app),
		pbcmd.NewSuperuserCommand(app),
	)

	if err := app.Execute(); err != nil {
		os.Exit(1)
	}
}

func serveCmd(app *pocketbase.PocketBase) *cobra.Command {
	return &cobra.Command{
		Use:   "serve",
		Short: "Start the web server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			return serve.Run(app, cfg)
		},
	}
}
