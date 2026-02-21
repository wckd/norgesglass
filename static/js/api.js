'use strict';

const trunc = (v, dp = 4) => parseFloat(Number(v).toFixed(dp));

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let ngStoreCachePromise = null;
let narvesenCachePromise = null;

function ngTodayHours(openingHours, today) {
  if (!openingHours || !Array.isArray(openingHours.upcomingOpeningHours)) return '';
  for (const day of openingHours.upcomingOpeningHours) {
    if (day.date === today) {
      if (day.closed) return 'Stengt';
      if (day.opens && day.closes) return day.opens + '\u2013' + day.closes;
      return '';
    }
  }
  return '';
}

const API = {

  async searchAddress(query) {
    const url = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(query)}&fuzzy=true&treffPerSide=5&side=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`searchAddress failed: ${res.status}`);
    return res.json();
  },

  async getAdminUnit(lat, lon) {
    const url = `https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getAdminUnit failed: ${res.status}`);
    return res.json();
  },

  async getPlaceNames(lat, lon) {
    const url = `https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258&radius=500&treffPerSide=10`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getPlaceNames failed: ${res.status}`);
    return res.json();
  },

  async getForecast(lat, lon) {
    const lat4 = trunc(lat);
    const lon4 = trunc(lon);
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat4}&lon=${lon4}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Norgesglass/1.0 github.com/norgesglass' },
    });
    if (!res.ok) throw new Error(`getForecast failed: ${res.status}`);
    return res.json();
  },

  async getNowcast(lat, lon) {
    const lat4 = trunc(lat);
    const lon4 = trunc(lon);
    const url = `https://api.met.no/weatherapi/nowcast/2.0/complete?lat=${lat4}&lon=${lon4}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Norgesglass/1.0 github.com/norgesglass' },
    });
    if (res.status === 422) return null;
    if (!res.ok) throw new Error(`getNowcast failed: ${res.status}`);
    return res.json();
  },

  async getSunrise(lat, lon, date = new Date().toISOString().slice(0, 10)) {
    const lat4 = trunc(lat);
    const lon4 = trunc(lon);
    const url = `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat4}&lon=${lon4}&date=${date}&offset=+01:00`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Norgesglass/1.0 github.com/norgesglass' },
    });
    if (!res.ok) throw new Error(`getSunrise failed: ${res.status}`);
    return res.json();
  },

  async getNatureReserves(lat, lon) {
    const latMin = lat - 0.05;
    const latMax = lat + 0.05;
    const lonMin = lon - 0.05;
    const lonMax = lon + 0.05;
    const url = `https://kart.miljodirektoratet.no/arcgis/rest/services/vern/MapServer/0/query?where=1%3D1&geometry=${lonMin},${latMin},${lonMax},${latMax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&resultRecordCount=50&f=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getNatureReserves failed: ${res.status}`);
    return res.json();
  },

  async getGeology(lat, lon, layer = 'bedrock') {
    const url = `/api/ngu?lat=${lat}&lon=${lon}&layer=${layer}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getGeology failed: ${res.status}`);
    return res.json();
  },

  async getCulturalHeritage(lat, lon) {
    const latMin = lat - 0.005;
    const latMax = lat + 0.005;
    const lonMin = lon - 0.005;
    const lonMax = lon + 0.005;
    const url = `https://kart.ra.no/arcgis/rest/services/Distribusjon/Kulturminner20180301/MapServer/7/query?where=1%3D1&geometry=${lonMin},${latMin},${lonMax},${latMax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&resultRecordCount=50&f=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getCulturalHeritage failed: ${res.status}`);
    return res.json();
  },

  async getPopulation(kommunenummer) {
    const url = 'https://data.ssb.no/api/v0/no/table/06913';
    const body = {
      query: [
        { code: 'Region',       selection: { filter: 'item', values: [kommunenummer] } },
        { code: 'ContentsCode', selection: { filter: 'item', values: ['Folkemengde'] } },
        { code: 'Tid',          selection: { filter: 'top',  values: ['1'] } },
      ],
      response: { format: 'json-stat2' },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`getPopulation failed: ${res.status}`);
    return res.json();
  },

  async getBusinesses(kommunenummer) {
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommunenummer}&size=5&sort=stiftelsesdato,desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getBusinesses failed: ${res.status}`);
    return res.json();
  },

  async getHydrology(lat, lon) {
    const url = `/api/nve?lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getHydrology failed: ${res.status}`);
    return res.json();
  },

  async getCoopStores(lat, lon) {
    const d = 0.045;
    const dLon = d / Math.cos(lat * Math.PI / 180);
    const url = `https://www.coop.no/api/client/stores/FindByBoundingBox?latitude=${lat}&longitude=${lon}&northWestLatitude=${lat + d}&northWestLongitude=${lon - dLon}&southEastLatitude=${lat - d}&southEastLongitude=${lon + dLon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getCoopStores failed: ${res.status}`);
    return res.json();
  },

  async getNarvesenStores(lat, lon) {
    if (!narvesenCachePromise) {
      narvesenCachePromise = fetch('/api/narvesen')
        .then((res) => {
          if (!res.ok) throw new Error(`getNarvesenStores failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error('getNarvesenStores: unexpected response');
          return data;
        })
        .catch((err) => {
          narvesenCachePromise = null;
          throw err;
        });
    }
    const stores = await narvesenCachePromise;
    return stores
      .map((s) => ({
        store: s,
        distKm: haversineKm(lat, lon, s.lat, s.lng),
      }))
      .filter((s) => s.distKm <= 5)
      .sort((a, b) => a.distKm - b.distKm);
  },

  async getNorgesgruppenStores(lat, lon) {
    if (!ngStoreCachePromise) {
      ngStoreCachePromise = fetch('https://api.ngdata.no/sylinder/stores/v1/extended-info')
        .then((res) => {
          if (!res.ok) throw new Error(`getNorgesgruppenStores failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error('getNorgesgruppenStores: unexpected response');
          return data;
        })
        .catch((err) => {
          ngStoreCachePromise = null;
          throw err;
        });
    }
    const stores = await ngStoreCachePromise;
    const today = new Date().toISOString().slice(0, 10);
    return stores
      .filter((s) => s.storeDetails && s.storeDetails.position)
      .map((s) => ({
        store: s,
        distKm: haversineKm(lat, lon, s.storeDetails.position.lat, s.storeDetails.position.lng),
        hours: ngTodayHours(s.openingHours, today),
      }))
      .filter((s) => s.distKm <= 5)
      .sort((a, b) => a.distKm - b.distKm);
  },

};
