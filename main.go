package main

import (
	"log"
	"net/http"
	"norgesglass/handlers"
	"os"
)

// noDirFS wraps http.FileSystem to prevent directory listings.
type noDirFS struct {
	fs http.FileSystem
}

func (n noDirFS) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if stat.IsDir() {
		index, err := n.fs.Open(name + "/index.html")
		if err != nil {
			f.Close()
			return nil, os.ErrNotExist
		}
		index.Close()
	}
	return f, nil
}

func main() {
	mux := http.NewServeMux()

	// API proxy routes
	mux.HandleFunc("/api/ngu", handlers.NGUHandler)
	mux.HandleFunc("/api/nve", handlers.NVEHandler)

	// Static files (directory listings disabled)
	mux.Handle("/", http.FileServer(noDirFS{http.Dir("static")}))

	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "localhost:8080"
	}
	log.Printf("Norgesglass running on http://%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
