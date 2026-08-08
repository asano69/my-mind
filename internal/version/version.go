// Package version holds the application's version string. This is the
// single source of truth, used both by the CLI (see cmd/my-mind/main.go)
// and by the HTTP API (see internal/cmd/serve/serve.go's "/api/version"
// route), so the two never drift out of sync.
package version

const Version = "0.0.6-beta.2"
