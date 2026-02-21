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
    var storeLayer = L.layerGroup();
    var heritageData = null;
    var natureData = null;
    var storeRawData = null;
    var overlayState = { heritage: false, nature: false, stores: false };

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

    var coopChainLabels = {
        'prix': 'Prix', 'extra': 'Extra', 'mega': 'Mega',
        'obs': 'Obs', 'marked': 'Marked', 'matkroken': 'Matkroken',
        'byggmix': 'Byggmix', 'elektro': 'Elektro',
    };
    var ngChainLabels = {
        '1100': 'Kiwi', '1210': 'Spar', '1220': 'Joker',
        '1270': 'Nærbutikken', '1300': 'Meny', '1410': 'Mix',
        '1800': 'Deli de Luca', '4150': 'Snarkjøp',
        '9944': 'Esso', '9947': 'Esso',
    };

    function escText(str) {
        var el = document.createElement('span');
        el.textContent = str;
        return el.innerHTML;
    }

    function renderStoreLayer() {
        storeLayer.clearLayers();
        if (!storeRawData) return;
        var features = [];
        var coopData = storeRawData.coop;
        var ngData = storeRawData.ng;
        if (coopData && coopData.stores) {
            for (var i = 0; i < coopData.stores.length; i++) {
                var s = coopData.stores[i];
                if (s.latitude != null && s.longitude != null) {
                    var addr = s.address || {};
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
                        properties: {
                            name: s.name || '',
                            chain: coopChainLabels[s.chain] || (s.chain ? s.chain.charAt(0).toUpperCase() + s.chain.slice(1) : 'Coop'),
                            address: [addr.street, [addr.zipCode, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
                            hours: typeof s.openingHours === 'string' ? s.openingHours : '',
                        },
                    });
                }
            }
        }
        if (ngData) {
            for (var j = 0; j < ngData.length; j++) {
                var entry = ngData[j];
                var d = entry.store && entry.store.storeDetails;
                if (d && d.position) {
                    var org = d.organization || {};
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [d.position.lng, d.position.lat] },
                        properties: {
                            name: d.storeName || '',
                            chain: ngChainLabels[d.chainId] || (d.storeName ? d.storeName.split(' ')[0] : ''),
                            address: [org.address, [org.postalCode, org.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
                            hours: entry.hours || '',
                        },
                    });
                }
            }
        }
        if (!features.length) return;
        L.geoJSON({ type: 'FeatureCollection', features: features }, {
            pointToLayer: function (feature, latlng) {
                var label = feature.properties.name || 'Butikk';
                var icon = L.divIcon({
                    className: 'store-marker',
                    html: '<span class="store-marker-label">' + escText(label) + '</span>',
                    iconSize: null,
                    iconAnchor: [20, 12],
                });
                return L.marker(latlng, { icon: icon });
            },
            onEachFeature: function (feature, layer) {
                var p = feature.properties;
                var tip = '<strong>' + escText(p.name) + '</strong>';
                if (p.address) tip += '<br>' + escText(p.address);
                if (p.hours) tip += '<br>' + escText(p.hours);
                layer.bindTooltip(tip);
            },
        }).addTo(storeLayer);
    }

    function setStoreData(coopData, ngData) {
        storeRawData = { coop: coopData, ng: ngData };
        if (overlayState.stores) {
            renderStoreLayer();
        }
    }

    function clearOverlays() {
        heritageData = null;
        natureData = null;
        storeRawData = null;
        heritageLayer.clearLayers();
        natureLayer.clearLayers();
        storeLayer.clearLayers();
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

            var btnStores = L.DomUtil.create('button', 'overlay-toggle-btn', container);
            btnStores.textContent = 'Butikker';
            btnStores.type = 'button';
            btnStores.setAttribute('aria-pressed', 'false');

            btnStores.addEventListener('click', function () {
                overlayState.stores = !overlayState.stores;
                btnStores.setAttribute('aria-pressed', String(overlayState.stores));
                if (overlayState.stores) {
                    btnStores.classList.add('active-stores');
                    storeLayer.addTo(map);
                    renderStoreLayer();
                } else {
                    btnStores.classList.remove('active-stores');
                    map.removeLayer(storeLayer);
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
        var current = map.getZoom();
        var target = zoom !== undefined ? zoom : Math.max(current, 14);
        map.setView([lat, lon], target);
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
        setStoreData: setStoreData,
        clearOverlays: clearOverlays,
    };
}());
