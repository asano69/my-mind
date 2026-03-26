package main

import (
	"fmt"
	"my-mind/internal/handler"
	"net/http"
	"os"
)

func main() {
	// bind用（コンテナ内部）
	bind := os.Getenv("BIND")
	if bind == "" {
		bind = "0.0.0.0"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	addr := bind + ":" + port

	// 表示用URL
	publicHost := os.Getenv("PUBLIC_HOST")
	if publicHost == "" {
		publicHost = "localhost"
	}

	useTLS := os.Getenv("TLS") == "1"

	scheme := "http"
	if useTLS {
		scheme = "https"
	}

	publicAddr := publicHost + ":" + port

	staticDir := "./static"
	mapsDir := "./maps"

	if err := os.MkdirAll(mapsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create maps dir: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("========================================")
	fmt.Printf("  App  : %s://%s/\n", scheme, publicAddr)
	fmt.Printf("  DAV  : %s://%s/maps/\n", scheme, publicAddr)
	fmt.Println("========================================")

	h := handler.New(staticDir, mapsDir)
	http.Handle("/", h)

	var err error
	if useTLS {
		cert := os.Getenv("TLS_CERT")
		key := os.Getenv("TLS_KEY")
		err = http.ListenAndServeTLS(addr, cert, key, nil)
	} else {
		err = http.ListenAndServe(addr, nil)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
