'use strict';

var MapCtrl = (function () {
    var map = L.map('map').setView([64.5, 17.5], 5);

    L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
        attribution: '&copy; <a href="https://kartverket.no">Kartverket</a>',
        maxZoom: 18
    }).addTo(map);

    var marker = null;

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
        getMap: getMap
    };
}());
