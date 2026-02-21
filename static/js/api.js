'use strict';

const trunc = (v, dp = 4) => parseFloat(Number(v).toFixed(dp));

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
    const url = `https://kart.miljodirektoratet.no/arcgis/rest/services/vern/MapServer/0/query?where=1%3D1&geometry=${lonMin},${latMin},${lonMax},${latMax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
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
    const url = `https://kart.ra.no/arcgis/rest/services/Distribusjon/Kulturminner20180301/MapServer/7/query?where=1%3D1&geometry=${lonMin},${latMin},${lonMax},${latMax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
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

};
