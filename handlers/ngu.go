package handlers

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

var httpClient = &http.Client{Timeout: 15e9} // 15 seconds

const (
	latMin = 57.0
	latMax = 82.0
	lonMin = -2.0
	lonMax = 35.0
)

func validateCoords(latStr, lonStr string) (lat, lon float64, err error) {
	if latStr == "" || lonStr == "" {
		return 0, 0, fmt.Errorf("lat and lon are required")
	}
	lat, err = strconv.ParseFloat(latStr, 64)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid lat: must be a number")
	}
	lon, err = strconv.ParseFloat(lonStr, 64)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid lon: must be a number")
	}
	if lat < latMin || lat > latMax || lon < lonMin || lon > lonMax {
		return 0, 0, fmt.Errorf("coordinates out of Norway bounds (lat 57-82, lon -2 to 35)")
	}
	return lat, lon, nil
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ParseNGUGML parses an NGU WMS GetFeatureInfo GML (msGMLOutput) response.
// It extracts element name/text pairs from the first feature element found.
// Exported for unit testing.
func ParseNGUGML(r io.Reader) (map[string]string, error) {
	fields := make(map[string]string)
	decoder := xml.NewDecoder(r)

	// We look for elements ending in "_feature" which contain the data.
	// Inside those, each child element is a field: <tag>value</tag>.
	inFeature := false
	var currentTag string

	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parsing GML: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			name := t.Name.Local
			if strings.HasSuffix(name, "_feature") {
				inFeature = true
				continue
			}
			if inFeature {
				currentTag = name
			}
		case xml.CharData:
			if inFeature && currentTag != "" {
				text := strings.TrimSpace(string(t))
				if text != "" {
					fields[currentTag] = text
				}
			}
		case xml.EndElement:
			name := t.Name.Local
			if strings.HasSuffix(name, "_feature") {
				// Only parse the first feature per layer.
				return fields, nil
			}
			if inFeature {
				currentTag = ""
			}
		}
	}

	return fields, nil
}

// NGUHandler proxies NGU WMS GetFeatureInfo requests and returns JSON.
func NGUHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	q := r.URL.Query()
	lat, lon, err := validateCoords(q.Get("lat"), q.Get("lon"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	layer := q.Get("layer")
	var baseURL, layers string
	switch layer {
	case "bedrock", "":
		layer = "bedrock"
		baseURL = "https://geo.ngu.no/mapserver/BerggrunnWMS3"
		layers = "Berggrunn_sammenstilt_hovedbergarter"
	case "sediment":
		baseURL = "https://geo.ngu.no/mapserver/LosmasserWMS3"
		layers = "Losmasser_temakart_nasjonal"
	default:
		writeJSONError(w, http.StatusBadRequest, "layer must be 'bedrock' or 'sediment'")
		return
	}

	bbox := fmt.Sprintf("%f,%f,%f,%f",
		lon-0.01, lat-0.01,
		lon+0.01, lat+0.01,
	)

	wmsURL := fmt.Sprintf(
		"%s?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo"+
			"&INFO_FORMAT=application/vnd.ogc.gml&SRS=EPSG:4326"+
			"&WIDTH=101&HEIGHT=101&X=50&Y=50"+
			"&LAYERS=%s&QUERY_LAYERS=%s&BBOX=%s",
		baseURL, layers, layers, bbox,
	)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, wmsURL, nil)
	if err != nil {
		log.Printf("NGU request build error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to build upstream request")
		return
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("NGU upstream error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		log.Printf("NGU upstream returned HTTP %d for layer=%s lat=%f lon=%f", resp.StatusCode, layer, lat, lon)
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("upstream returned %d", resp.StatusCode))
		return
	}

	fields, err := ParseNGUGML(resp.Body)
	if err != nil {
		log.Printf("NGU GML parse error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to parse upstream response")
		return
	}

	available := len(fields) > 0
	if fields == nil {
		fields = make(map[string]string)
	}

	type response struct {
		Layer     string            `json:"layer"`
		Available bool              `json:"available"`
		Fields    map[string]string `json:"fields"`
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response{
		Layer:     layer,
		Available: available,
		Fields:    fields,
	})
}
