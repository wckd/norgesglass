package handlers

import (
	"strings"
	"testing"
)

func TestParseNGUGML(t *testing.T) {
	gml := `<?xml version="1.0" encoding="UTF-8"?>
<msGMLOutput xmlns:gml="http://www.opengis.net/gml">
	<Berggrunn_sammenstilt_hovedbergarter_lokal_layer>
		<Berggrunn_sammenstilt_hovedbergarter_lokal_feature>
			<bergartsenhet_tekst>Leirskifer, svart</bergartsenhet_tekst>
			<hovedbergart_tekst>Leirskifer</hovedbergart_tekst>
			<tektoniskhovedinndeling_tekst>Kaledonsk orogen</tektoniskhovedinndeling_tekst>
		</Berggrunn_sammenstilt_hovedbergarter_lokal_feature>
	</Berggrunn_sammenstilt_hovedbergarter_lokal_layer>
</msGMLOutput>`

	fields, err := ParseNGUGML(strings.NewReader(gml))
	if err != nil {
		t.Fatalf("ParseNGUGML returned error: %v", err)
	}

	want := map[string]string{
		"bergartsenhet_tekst":              "Leirskifer, svart",
		"hovedbergart_tekst":               "Leirskifer",
		"tektoniskhovedinndeling_tekst":    "Kaledonsk orogen",
	}

	for k, v := range want {
		if got := fields[k]; got != v {
			t.Errorf("fields[%q] = %q, want %q", k, got, v)
		}
	}
}

func TestParseNGUGMLSediment(t *testing.T) {
	gml := `<?xml version="1.0" encoding="UTF-8"?>
<msGMLOutput xmlns:gml="http://www.opengis.net/gml">
	<Losmasser_nasjonal_hovedlosmassetyper_layer>
		<Losmasser_nasjonal_hovedlosmassetyper_feature>
			<losmassetype_navn>Bart fjell</losmassetype_navn>
			<losmassetype_besk>Fjell med tynt løsmassedekke</losmassetype_besk>
		</Losmasser_nasjonal_hovedlosmassetyper_feature>
	</Losmasser_nasjonal_hovedlosmassetyper_layer>
</msGMLOutput>`

	fields, err := ParseNGUGML(strings.NewReader(gml))
	if err != nil {
		t.Fatalf("ParseNGUGML returned error: %v", err)
	}

	if fields["losmassetype_navn"] != "Bart fjell" {
		t.Errorf("losmassetype_navn = %q, want %q", fields["losmassetype_navn"], "Bart fjell")
	}
	if fields["losmassetype_besk"] != "Fjell med tynt løsmassedekke" {
		t.Errorf("losmassetype_besk = %q, want %q", fields["losmassetype_besk"], "Fjell med tynt løsmassedekke")
	}
}

func TestParseNGUGMLEmpty(t *testing.T) {
	gml := `<?xml version="1.0" encoding="UTF-8"?>
<msGMLOutput xmlns:gml="http://www.opengis.net/gml">
</msGMLOutput>`

	fields, err := ParseNGUGML(strings.NewReader(gml))
	if err != nil {
		t.Fatalf("ParseNGUGML returned error: %v", err)
	}

	if len(fields) != 0 {
		t.Errorf("expected empty map, got %d entries: %v", len(fields), fields)
	}
}

func TestParseNGUGMLMultipleFeatures(t *testing.T) {
	// Should only return the first feature's data.
	gml := `<?xml version="1.0" encoding="UTF-8"?>
<msGMLOutput xmlns:gml="http://www.opengis.net/gml">
	<Test_layer>
		<Test_feature>
			<name>First</name>
		</Test_feature>
		<Test_feature>
			<name>Second</name>
		</Test_feature>
	</Test_layer>
</msGMLOutput>`

	fields, err := ParseNGUGML(strings.NewReader(gml))
	if err != nil {
		t.Fatalf("ParseNGUGML returned error: %v", err)
	}

	if fields["name"] != "First" {
		t.Errorf("expected first feature, got name=%q", fields["name"])
	}
}

func TestValidateCoords(t *testing.T) {
	tests := []struct {
		name    string
		lat     string
		lon     string
		wantErr bool
	}{
		{"valid Oslo", "59.91", "10.75", false},
		{"valid Tromsø", "69.65", "18.96", false},
		{"empty lat", "", "10.75", true},
		{"empty lon", "59.91", "", true},
		{"non-numeric lat", "abc", "10.75", true},
		{"out of bounds south", "50.0", "10.75", true},
		{"out of bounds east", "59.91", "40.0", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := validateCoords(tt.lat, tt.lon)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateCoords(%q, %q) error = %v, wantErr %v", tt.lat, tt.lon, err, tt.wantErr)
			}
		})
	}
}
