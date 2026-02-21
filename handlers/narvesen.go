package handlers

import (
	"encoding/json"
	"errors"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type narvesenStore struct {
	Name    string  `json:"name"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Address string  `json:"address"`
	City    string  `json:"city"`
}

var (
	narvesenMu      sync.Mutex
	narvesenCache   []narvesenStore
	narvesenCacheAt time.Time
)

const narvesenCacheTTL = 24 * time.Hour
const narvesenURL = "https://narvesen.no/finn-butikk"

// Regex patterns to extract store data from each <li> element.
var (
	reLi            = regexp.MustCompile(`(?s)<li\s+data-lat="([^"]+)"\s+data-lng="([^"]+)"\s+data-title="([^"]+)"[^>]*>.*?</li>`)
	reStreetAddress = regexp.MustCompile(`<div class="street-address">([^<]+)</div>`)
	reLocality      = regexp.MustCompile(`<span class="locality">([^<]+)</span>`)
)

func parseNarvesenHTML(rawHTML string) []narvesenStore {
	matches := reLi.FindAllStringSubmatch(rawHTML, -1)
	stores := make([]narvesenStore, 0, len(matches))

	for _, m := range matches {
		lat, err := strconv.ParseFloat(m[1], 64)
		if err != nil {
			continue
		}
		lng, err := strconv.ParseFloat(m[2], 64)
		if err != nil {
			continue
		}

		name := html.UnescapeString(strings.TrimSpace(m[3]))
		body := m[0]

		var address, city string
		if sm := reStreetAddress.FindStringSubmatch(body); len(sm) > 1 {
			address = html.UnescapeString(strings.TrimSpace(sm[1]))
		}
		if sm := reLocality.FindStringSubmatch(body); len(sm) > 1 {
			city = html.UnescapeString(strings.TrimSpace(sm[1]))
		}

		stores = append(stores, narvesenStore{
			Name:    name,
			Lat:     lat,
			Lng:     lng,
			Address: address,
			City:    city,
		})
	}
	return stores
}

func fetchNarvesenStores() ([]narvesenStore, error) {
	narvesenMu.Lock()
	if narvesenCache != nil && time.Since(narvesenCacheAt) < narvesenCacheTTL {
		cached := narvesenCache
		narvesenMu.Unlock()
		return cached, nil
	}
	narvesenMu.Unlock()

	req, err := http.NewRequest(http.MethodGet, narvesenURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Norgesglass/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil, &upstreamError{status: resp.StatusCode}
	}

	const maxBody = 2*1024*1024 + 1 // 2 MB + 1 to detect truncation
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxBody)))
	if err != nil {
		return nil, err
	}
	if len(body) >= maxBody {
		return nil, errBodyTooLarge
	}

	stores := parseNarvesenHTML(string(body))
	if len(stores) == 0 {
		log.Printf("Narvesen: parsed 0 stores from %d bytes — upstream HTML may have changed", len(body))
		return nil, errors.New("parsed 0 stores from upstream response")
	}

	narvesenMu.Lock()
	narvesenCache = stores
	narvesenCacheAt = time.Now()
	narvesenMu.Unlock()

	return stores, nil
}

type upstreamError struct {
	status int
}

func (e *upstreamError) Error() string {
	return "upstream returned " + strconv.Itoa(e.status)
}

var errBodyTooLarge = errors.New("narvesen: upstream response exceeded 2 MB limit")

// NarvesenHandler returns the full list of Narvesen stores as JSON.
func NarvesenHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stores, err := fetchNarvesenStores()
	if err != nil {
		log.Printf("Narvesen fetch error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "upstream request failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stores)
}
