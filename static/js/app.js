'use strict';

var App = (function () {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  let state = {
    lat: null,
    lon: null,
    kommunenummer: null,
    fetchId: 0,
  };

  // -------------------------------------------------------------------------
  // Panel element references
  // -------------------------------------------------------------------------

  const els = {
    admin:      document.getElementById('admin-content'),
    weather:    document.getElementById('weather-content'),
    sun:        document.getElementById('sun-content'),
    nature:     document.getElementById('nature-content'),
    placenames: document.getElementById('placenames-content'),
    geology:    document.getElementById('geology-content'),
    heritage:   document.getElementById('heritage-content'),
    hydro:      document.getElementById('hydro-content'),
    population: document.getElementById('population-content'),
    business:   document.getElementById('business-content'),
  };

  // -------------------------------------------------------------------------
  // Search state
  // -------------------------------------------------------------------------

  let searchResults = [];
  let activeIndex   = -1;
  let debounceTimer = null;

  // -------------------------------------------------------------------------
  // Core: lookupLocation
  // -------------------------------------------------------------------------

  function lookupLocation(lat, lon, label) {
    state.fetchId += 1;
    const id = state.fetchId;

    state.lat = lat;
    state.lon = lon;
    state.kommunenummer = null;

    MapCtrl.placeMarker(lat, lon);
    MapCtrl.panTo(lat, lon);
    MapCtrl.clearOverlays();

    // Scroll sidebar to top and reset all panels to loading
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.scrollTop = 0;

    for (const el of Object.values(els)) {
      Panels.setLoading(el);
    }

    const stale = () => state.fetchId !== id;

    // --- Weather (forecast + nowcast together) ---
    Promise.all([API.getForecast(lat, lon), API.getNowcast(lat, lon)])
      .then(([forecast, nowcast]) => {
        if (stale()) return;
        Panels.renderWeather(els.weather, forecast, nowcast);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.weather, err.message);
      });

    // --- Sunrise ---
    API.getSunrise(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderSun(els.sun, data);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.sun, err.message);
      });

    // --- Nature reserves ---
    API.getNatureReserves(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderNature(els.nature, data);
        MapCtrl.setNatureData(data);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.nature, err.message);
      });

    // --- Place names ---
    API.getPlaceNames(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderPlaceNames(els.placenames, data);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.placenames, err.message);
      });

    // --- Geology (bedrock + sediment together) ---
    Promise.all([API.getGeology(lat, lon, 'bedrock'), API.getGeology(lat, lon, 'sediment')])
      .then(([bedrock, sediment]) => {
        if (stale()) return;
        Panels.renderGeology(els.geology, bedrock, sediment);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.geology, err.message);
      });

    // --- Cultural heritage ---
    API.getCulturalHeritage(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderHeritage(els.heritage, data);
        MapCtrl.setHeritageData(data);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.heritage, err.message);
      });

    // --- Hydrology ---
    API.getHydrology(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderHydro(els.hydro, data);
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.hydro, err.message);
      });

    // --- Admin unit → then population + businesses ---
    API.getAdminUnit(lat, lon)
      .then((data) => {
        if (stale()) return;
        Panels.renderAdmin(els.admin, data);

        const kommunenummer = data && data.kommunenummer ? data.kommunenummer : null;
        state.kommunenummer = kommunenummer;

        if (!kommunenummer) {
          Panels.setError(els.population, 'Kommunenummer ikke tilgjengelig');
          Panels.setError(els.business,   'Kommunenummer ikke tilgjengelig');
          return;
        }

        API.getPopulation(kommunenummer)
          .then((popData) => {
            if (stale()) return;
            Panels.renderPopulation(els.population, popData);
          })
          .catch((err) => {
            if (stale()) return;
            Panels.setError(els.population, err.message);
          });

        API.getBusinesses(kommunenummer)
          .then((bizData) => {
            if (stale()) return;
            Panels.renderBusiness(els.business, bizData);
          })
          .catch((err) => {
            if (stale()) return;
            Panels.setError(els.business, err.message);
          });
      })
      .catch((err) => {
        if (stale()) return;
        Panels.setError(els.admin,      err.message);
        Panels.setError(els.population, err.message);
        Panels.setError(els.business,   err.message);
      });
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  function closeResults() {
    const input = document.getElementById('search-input');
    const list  = document.getElementById('search-results');
    if (!input || !list) return;
    list.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    clearActive(list);
  }

  function clearActive(list) {
    const items = list.querySelectorAll('li');
    for (const item of items) {
      item.classList.remove('active');
      item.removeAttribute('aria-selected');
    }
  }

  function setActive(list, index) {
    const items = list.querySelectorAll('li');
    clearActive(list);
    if (index >= 0 && index < items.length) {
      items[index].classList.add('active');
      items[index].setAttribute('aria-selected', 'true');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectResult(index) {
    const addr = searchResults[index];
    if (!addr) return;

    const lat = addr.representasjonspunkt && addr.representasjonspunkt.lat;
    const lon = addr.representasjonspunkt && addr.representasjonspunkt.lon;
    if (lat == null || lon == null) return;

    closeResults();

    const input = document.getElementById('search-input');
    if (input) {
      input.value = addr.adressetekst || '';
    }

    lookupLocation(lat, lon, addr.adressetekst || null);
  }

  function populateResults(addresses) {
    const list = document.getElementById('search-results');
    const input = document.getElementById('search-input');
    if (!list || !input) return;

    list.innerHTML = '';
    activeIndex = -1;

    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-index', String(i));

      const main = document.createElement('div');
      main.className = 'search-result-main';
      main.textContent = addr.adressetekst || '';

      const sub = document.createElement('div');
      sub.className = 'search-result-sub';
      sub.textContent = [addr.kommunenavn, addr.fylkesnavn].filter(Boolean).join(', ');

      li.appendChild(main);
      li.appendChild(sub);
      list.appendChild(li);
    }

    list.removeAttribute('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function setupSearch() {
    const input = document.getElementById('search-input');
    const list  = document.getElementById('search-results');
    if (!input || !list) return;

    // Debounced input handler
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();

      if (query.length < 2) {
        closeResults();
        searchResults = [];
        return;
      }

      debounceTimer = setTimeout(() => {
        API.searchAddress(query)
          .then((data) => {
            const addresses = (data && data.adresser) ? data.adresser : [];
            searchResults = addresses;
            if (!addresses.length) {
              closeResults();
              return;
            }
            populateResults(addresses);
          })
          .catch(() => {
            closeResults();
          });
      }, 250);
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      const items = list.querySelectorAll('li');
      const count = items.length;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (count === 0) return;
        activeIndex = (activeIndex + 1) % count;
        setActive(list, activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (count === 0) return;
        activeIndex = (activeIndex - 1 + count) % count;
        setActive(list, activeIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < count) {
          selectResult(activeIndex);
        }
      } else if (e.key === 'Escape') {
        closeResults();
      }
    });

    // Click delegation on results list
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-index]');
      if (!li) return;
      const index = parseInt(li.getAttribute('data-index'), 10);
      if (!isNaN(index)) {
        selectResult(index);
      }
    });

    // Click-outside handler
    document.addEventListener('click', (e) => {
      const wrapper = input.closest('.search-wrapper') || input.parentElement;
      if (wrapper && !wrapper.contains(e.target)) {
        closeResults();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Map click handler (called by MapCtrl)
  // -------------------------------------------------------------------------

  function onMapClick(lat, lon) {
    const input = document.getElementById('search-input');
    if (input) {
      input.value = '';
    }
    lookupLocation(lat, lon, null);
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  setupSearch();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    onMapClick,
    lookupLocation,
  };

}());
