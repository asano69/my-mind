package main

import (
	"fmt"
	"my-mind/internal/handler"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	mapsDir := "./maps"

	if err := os.MkdirAll(mapsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create maps dir: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Listening on :%s\n", port)

	h := handler.New(mapsDir)
	if err := http.ListenAndServe(":"+port, h); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
