package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
)

var nveAPIKey string

func init() {
	nveAPIKey = os.Getenv("NVE_API_KEY")
	if nveAPIKey == "" {
		log.Println("WARNING: NVE_API_KEY environment variable is not set; /api/nve will return 503")
	}
}

// buildWKTPolygon returns an 8-vertex approximate circle around (lat, lon)
// with radius 0.1 degrees, formatted as a WKT POLYGON string.
func buildWKTPolygon(lat, lon float64) string {
	const radius = 0.1
	const vertices = 8

	coords := make([]string, 0, vertices+1)
	for i := 0; i < vertices; i++ {
		angle := 2 * math.Pi * float64(i) / float64(vertices)
		pLon := lon + radius*math.Cos(angle)
		pLat := lat + radius*math.Sin(angle)
		coords = append(coords, fmt.Sprintf("%f %f", pLon, pLat))
	}
	// Close the ring by repeating the first point.
	coords = append(coords, coords[0])

	return "POLYGON((" + strings.Join(coords, ",") + "))"
}

// NVEHandler proxies NVE HydAPI requests, injecting the configured API key.
func NVEHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if nveAPIKey == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "NVE API key not configured")
		return
	}

	q := r.URL.Query()
	lat, lon, err := validateCoords(q.Get("lat"), q.Get("lon"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	polygon := buildWKTPolygon(lat, lon)
	params := url.Values{}
	params.Set("Active", "1")
	params.Set("ParameterName", "1000,1001")
	params.Set("Polygon", polygon)
	nveURL := "https://hydapi.nve.no/api/v1/Stations?" + params.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, nveURL, nil)
	if err != nil {
		log.Printf("NVE request build error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("X-API-Key", nveAPIKey)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("NVE upstream error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		log.Printf("NVE upstream returned HTTP %d for lat=%f lon=%f", resp.StatusCode, lat, lon)
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("upstream returned %d", resp.StatusCode))
		return
	}

	const maxBody = 512*1024 + 1 // 512 KB + 1 to detect truncation
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxBody)))
	if err != nil {
		log.Printf("NVE body read error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "failed to read upstream response")
		return
	}

	if len(body) >= maxBody {
		log.Printf("NVE upstream response exceeded 512KB limit (truncated)")
		writeJSONError(w, http.StatusBadGateway, "upstream response too large")
		return
	}

	if !json.Valid(body) {
		log.Printf("NVE upstream returned non-JSON body (len=%d)", len(body))
		writeJSONError(w, http.StatusBadGateway, "upstream returned invalid JSON")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
