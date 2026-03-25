package main

import (
	"fmt"
	"net/http"
	"os"

	"my-mind/internal/handler"
)

const port = ":8080"

func main() {
	staticDir := "./static"
	mapsDir := "./maps"

	if err := os.MkdirAll(mapsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create maps dir: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("========================================")
	fmt.Printf("  App  : http://localhost%s/\n", port)
	fmt.Printf("  DAV  : http://localhost%s/maps/\n", port)
	fmt.Println("========================================")

	h := handler.New(staticDir, mapsDir)
	http.Handle("/", h)

	if err := http.ListenAndServe(port, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
