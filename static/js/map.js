'use strict';

var MapCtrl = (function () {
    var map = L.map('map').setView([64.5, 17.5], 5);

    L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
        attribution: '&copy; <a href="https://kartverket.no">Kartverket</a>',
        maxZoom: 18
    }).addTo(map);

    var marker = null;

    // -----------------------------------------------------------------------
    // Overlay layers
    // -----------------------------------------------------------------------

    var heritageLayer = L.layerGroup();
    var natureLayer = L.layerGroup();
    var heritageData = null;
    var natureData = null;
    var overlayState = { heritage: false, nature: false };

    var heritageStyle = {
        color: '#f9a825',
        weight: 2,
        opacity: 0.8,
        fillColor: '#f9a825',
        fillOpacity: 0.25,
    };

    var natureStyle = {
        color: '#4ecdc4',
        weight: 2,
        opacity: 0.8,
        fillColor: '#4ecdc4',
        fillOpacity: 0.25,
    };

    function renderOverlayLayer(data, layer, style) {
        layer.clearLayers();
        if (!data || !data.features) return;
        L.geoJSON(data, {
            style: style,
            pointToLayer: function (_feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 7,
                    color: style.color,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: style.fillColor,
                    fillOpacity: 0.4,
                });
            },
        }).addTo(layer);
    }

    function setHeritageData(geojson) {
        heritageData = geojson;
        if (overlayState.heritage) {
            renderOverlayLayer(heritageData, heritageLayer, heritageStyle);
        }
    }

    function setNatureData(geojson) {
        natureData = geojson;
        if (overlayState.nature) {
            renderOverlayLayer(natureData, natureLayer, natureStyle);
        }
    }

    function clearOverlays() {
        heritageData = null;
        natureData = null;
        heritageLayer.clearLayers();
        natureLayer.clearLayers();
    }

    // -----------------------------------------------------------------------
    // Toggle control
    // -----------------------------------------------------------------------

    var OverlayControl = L.Control.extend({
        options: { position: 'topright' },

        onAdd: function () {
            var container = L.DomUtil.create('div', 'overlay-toggle-control');
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            var btnHeritage = L.DomUtil.create('button', 'overlay-toggle-btn', container);
            btnHeritage.textContent = 'Kulturminner';
            btnHeritage.type = 'button';
            btnHeritage.setAttribute('aria-pressed', 'false');

            var btnNature = L.DomUtil.create('button', 'overlay-toggle-btn', container);
            btnNature.textContent = 'Naturvern';
            btnNature.type = 'button';
            btnNature.setAttribute('aria-pressed', 'false');

            btnHeritage.addEventListener('click', function () {
                overlayState.heritage = !overlayState.heritage;
                btnHeritage.setAttribute('aria-pressed', String(overlayState.heritage));
                if (overlayState.heritage) {
                    btnHeritage.classList.add('active-heritage');
                    heritageLayer.addTo(map);
                    renderOverlayLayer(heritageData, heritageLayer, heritageStyle);
                } else {
                    btnHeritage.classList.remove('active-heritage');
                    map.removeLayer(heritageLayer);
                }
            });

            btnNature.addEventListener('click', function () {
                overlayState.nature = !overlayState.nature;
                btnNature.setAttribute('aria-pressed', String(overlayState.nature));
                if (overlayState.nature) {
                    btnNature.classList.add('active-nature');
                    natureLayer.addTo(map);
                    renderOverlayLayer(natureData, natureLayer, natureStyle);
                } else {
                    btnNature.classList.remove('active-nature');
                    map.removeLayer(natureLayer);
                }
            });

            return container;
        },
    });

    new OverlayControl().addTo(map);

    // -----------------------------------------------------------------------
    // Map click
    // -----------------------------------------------------------------------

    map.on('click', function (e) {
        if (typeof App !== 'undefined') {
            App.onMapClick(e.latlng.lat, e.latlng.lng);
        }
    });

    function placeMarker(lat, lon) {
        if (marker) {
            marker.setLatLng([lat, lon]);
        } else {
            marker = L.marker([lat, lon]).addTo(map);
        }
    }

    function panTo(lat, lon, zoom) {
        map.setView([lat, lon], zoom !== undefined ? zoom : 14);
    }

    function getMap() {
        return map;
    }

    return {
        placeMarker: placeMarker,
        panTo: panTo,
        getMap: getMap,
        setHeritageData: setHeritageData,
        setNatureData: setNatureData,
        clearOverlays: clearOverlays,
    };
}());
