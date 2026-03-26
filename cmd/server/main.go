package main

import (
	"fmt"
	"my-mind/internal/handler"
	"net/http"
	"os"
)

func main() {
	host := os.Getenv("HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	addr := host + ":" + port

	staticDir := "./static"
	mapsDir := "./maps"

	if err := os.MkdirAll(mapsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create maps dir: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("========================================")
	fmt.Printf("  App  : http://%s/\n", addr)
	fmt.Printf("  DAV  : http://%s/maps/\n", addr)
	fmt.Println("========================================")

	h := handler.New(staticDir, mapsDir)
	http.Handle("/", h)

	if err := http.ListenAndServe(addr, nil); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

