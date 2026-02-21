'use strict';

const Panels = {};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function esc(str) {
    if (typeof str !== 'string') {
        str = String(str);
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setLoading(el, text) {
    el.innerHTML = `<p class="panel-loading">${esc(text || 'Henter data...')}</p>`;
}

function setError(el, text) {
    el.innerHTML = `<p class="panel-error">${esc(text || 'Kunne ikke hente data')}</p>`;
}

function setEmpty(el, text) {
    el.innerHTML = `<p class="panel-empty">${esc(text || 'Ingen data funnet')}</p>`;
}

function row(label, value) {
    return `<div class="panel-row"><span class="panel-label">${esc(label)}</span><span class="panel-value">${esc(value)}</span></div>`;
}

function formatHHMM(isoString) {
    if (!isoString) return '';
    // Extract HH:MM from ISO 8601 strings like "2024-06-15T05:23:00+02:00"
    const match = isoString.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
}

function formatThousands(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------

Panels.renderAdmin = function (el, data) {
    if (!data) {
        setEmpty(el);
        return;
    }
    var kommune = data.kommunenavn || '';
    var fylke = data.fylkesnavn || '';
    var knr = data.kommunenummer || '';
    el.innerHTML =
        `<div class="admin-summary">` +
            `<div class="admin-primary">${esc(kommune)} kommune</div>` +
            `<div class="admin-secondary">${esc(fylke)} &middot; ${esc(knr)}</div>` +
        `</div>`;
};

Panels.renderWeather = function (el, forecastData, nowcastData) {
    if (!forecastData || !forecastData.properties || !forecastData.properties.timeseries) {
        setEmpty(el, 'Ingen værdata tilgjengelig');
        return;
    }

    const timeseries = forecastData.properties.timeseries;
    if (!timeseries.length) {
        setEmpty(el, 'Ingen værdata tilgjengelig');
        return;
    }

    const current = timeseries[0];
    const details = current && current.data && current.data.instant && current.data.instant.details
        ? current.data.instant.details
        : {};

    let html = '';

    const temp = details.air_temperature !== undefined ? String(details.air_temperature) + '°C' : '–';
    const wind = details.wind_speed !== undefined ? String(details.wind_speed) + ' m/s' : '–';
    const humidity = details.relative_humidity !== undefined ? String(details.relative_humidity) + '%' : '–';

    html += row('Temperatur', temp);
    html += row('Vind', wind);
    html += row('Luftfuktighet', humidity);

    if (
        nowcastData &&
        nowcastData.properties &&
        nowcastData.properties.timeseries &&
        nowcastData.properties.timeseries.length
    ) {
        const nowcastDetails =
            nowcastData.properties.timeseries[0].data &&
            nowcastData.properties.timeseries[0].data.instant &&
            nowcastData.properties.timeseries[0].data.instant.details
                ? nowcastData.properties.timeseries[0].data.instant.details
                : {};
        const precip = nowcastDetails.precipitation_rate !== undefined
            ? String(nowcastDetails.precipitation_rate) + ' mm/t'
            : '–';
        html += row('Nedbør nå', precip);
    }

    // Forecast strip — next 6 entries (skip index 0, which is current)
    const stripEntries = timeseries.slice(1, 7);
    if (stripEntries.length) {
        html += '<div class="forecast-strip">';
        for (const entry of stripEntries) {
            const time = formatHHMM(entry.time);
            const entryDetails =
                entry.data && entry.data.instant && entry.data.instant.details
                    ? entry.data.instant.details
                    : {};
            const entryTemp = entryDetails.air_temperature !== undefined
                ? String(entryDetails.air_temperature) + '°'
                : '–';
            html += `<div class="forecast-item">` +
                `<div class="forecast-time">${esc(time)}</div>` +
                `<div class="forecast-temp">${esc(entryTemp)}</div>` +
                `</div>`;
        }
        html += '</div>';
    }

    el.innerHTML = html;
};

Panels.renderSun = function (el, data) {
    if (!data || !data.properties) {
        setEmpty(el, 'Ingen soldata tilgjengelig');
        return;
    }

    const props = data.properties;
    const rise = props.sunrise && props.sunrise.time ? formatHHMM(props.sunrise.time) : null;
    const set = props.sunset && props.sunset.time ? formatHHMM(props.sunset.time) : null;
    const noon = props.solarnoon && props.solarnoon.time ? formatHHMM(props.solarnoon.time) : null;

    if (!rise && !set) {
        const elevation = props.solarnoon && props.solarnoon.disc_centre_elevation;
        if (elevation !== undefined && elevation > 0) {
            el.innerHTML = `<div class="sun-strip"><div class="sun-item"><div class="sun-label">Midnattsol</div><div class="sun-value">Solen går ikke ned</div></div></div>`;
        } else {
            el.innerHTML = `<div class="sun-strip"><div class="sun-item"><div class="sun-label">Mørketid</div><div class="sun-value">Solen går ikke opp</div></div></div>`;
        }
        return;
    }

    // Calculate day length
    let dayLength = '';
    if (rise && set && props.sunrise.time && props.sunset.time) {
        var riseDate = new Date(props.sunrise.time);
        var setDate = new Date(props.sunset.time);
        var diffMs = setDate - riseDate;
        if (diffMs > 0) {
            var hours = Math.floor(diffMs / 3600000);
            var mins = Math.floor((diffMs % 3600000) / 60000);
            dayLength = hours + 't ' + mins + 'm';
        }
    }

    let html = '<div class="sun-strip">';
    html += `<div class="sun-item"><div class="sun-value">${esc(rise)}</div><div class="sun-label">Opp</div></div>`;
    if (noon) {
        html += `<div class="sun-item"><div class="sun-value">${esc(noon)}</div><div class="sun-label">Topp</div></div>`;
    }
    html += `<div class="sun-item"><div class="sun-value">${esc(set)}</div><div class="sun-label">Ned</div></div>`;
    if (dayLength) {
        html += `<div class="sun-item"><div class="sun-value">${esc(dayLength)}</div><div class="sun-label">Dagslys</div></div>`;
    }
    html += '</div>';

    el.innerHTML = html;
};

Panels.renderNature = function (el, data) {
    if (!data || !data.features || !data.features.length) {
        setEmpty(el, 'Ingen verneområder i nærheten');
        return;
    }

    let html = '';
    for (const feature of data.features) {
        const attrs = feature.attributes || {};
        const navn = attrs.offisieltNavn || attrs.navn || '';
        const verneform = attrs.verneform || attrs.vernefom || '';
        let vernedato = '';
        if (attrs.vernedato && typeof attrs.vernedato === 'number') {
            vernedato = new Date(attrs.vernedato).toLocaleDateString('nb-NO');
        } else if (attrs.vernedato) {
            vernedato = String(attrs.vernedato);
        }
        const detail = [verneform, vernedato].filter(Boolean).join(' — ');
        html += `<div class="nature-item">` +
            `<div class="item-name">${esc(navn)}</div>` +
            `<div class="item-detail">${esc(detail)}</div>` +
            `</div>`;
    }

    el.innerHTML = html;
};

Panels.renderPlaceNames = function (el, data) {
    if (!data || !data.navn || !data.navn.length) {
        setEmpty(el);
        return;
    }

    const entries = data.navn.slice(0, 10);
    let html = '';

    for (const entry of entries) {
        let skrivemåte = '';
        const stedsnavn = entry.stedsnavn;
        if (Array.isArray(stedsnavn) && stedsnavn.length) {
            skrivemåte = stedsnavn[0].skrivemåte || '';
        } else if (typeof entry['skrivemåte'] === 'string') {
            skrivemåte = entry['skrivemåte'];
        }
        const type = entry.navneobjekttype || '';
        html += `<div class="panel-row">` +
            `<span class="panel-label">${esc(skrivemåte)}</span>` +
            `<span class="panel-value">${esc(type)}</span>` +
            `</div>`;
    }

    el.innerHTML = html;
};

Panels.renderGeology = function (el, bedrockData, sedimentData) {
    const bedrockAvailable = bedrockData && bedrockData.available && bedrockData.fields;
    const sedimentAvailable = sedimentData && sedimentData.available && sedimentData.fields;

    if (!bedrockAvailable && !sedimentAvailable) {
        setEmpty(el);
        return;
    }

    // Show only the human-readable _tekst fields from NGU GML.
    var bedrockLabels = {
        'hovedbergart_tekst': 'Hovedbergart',
        'bergartsenhet_tekst': 'Bergartsenhet',
        'tektoniskhovedinndeling_tekst': 'Tektonisk inndeling',
        'tektoniskenhet_tekst': 'Tektonisk enhet',
        'tilleggsbergart1_tekst': 'Tilleggsbergart 1',
        'tilleggsbergart2_tekst': 'Tilleggsbergart 2',
        'tilleggsbergart3_tekst': 'Tilleggsbergart 3',
        'dekkekompleks_tekst': 'Dekkekompleks',
        'gruppe_tekst': 'Gruppe',
        'overgruppe_tekst': 'Overgruppe',
    };
    var sedimentLabels = {
        'losmassetype_navn': 'Løsmassetype',
        'losmassetype_besk': 'Beskrivelse',
        'datasett_visning_tekst': 'Datakilde',
    };

    let html = '';

    if (bedrockAvailable) {
        html += `<h3>${esc('Berggrunn')}</h3>`;
        for (const key of Object.keys(bedrockLabels)) {
            var val = bedrockData.fields[key];
            if (val) html += row(bedrockLabels[key], val);
        }
    }

    if (sedimentAvailable) {
        html += `<h3>${esc('Løsmasser')}</h3>`;
        for (const key of Object.keys(sedimentLabels)) {
            var val = sedimentData.fields[key];
            if (val) html += row(sedimentLabels[key], val);
        }
    }

    el.innerHTML = html;
};

Panels.renderHeritage = function (el, data) {
    if (!data || !data.features || !data.features.length) {
        setEmpty(el, 'Ingen kulturminner i nærheten');
        return;
    }

    let html = '';
    for (const feature of data.features) {
        const attrs = feature.attributes || {};
        const navn = attrs.Navn || attrs.KulturminneNavn || '';
        const kategori = attrs.KulturminneKategori || attrs.Kategori || '';
        const vern = attrs.Vernestatus || '';
        const detail = [kategori, vern].filter(Boolean).join(' — ');
        html += `<div class="heritage-item">` +
            `<div class="item-name">${esc(navn)}</div>` +
            `<div class="item-detail">${esc(detail)}</div>` +
            `</div>`;
    }

    el.innerHTML = html;
};

Panels.renderHydro = function (el, data) {
    if (!data || !data.data || !data.data.length) {
        setEmpty(el, 'Ingen målestasjoner i nærheten');
        return;
    }

    const stations = data.data.slice(0, 5);
    let html = '';

    for (const station of stations) {
        const name = station.stationName || '';
        const param = station.parameterName || '';
        const status = station.stationStatusName || '';
        const detail = [param, status].filter(Boolean).join(' — ');
        html += `<div class="panel-row">` +
            `<span class="panel-label">${esc(name)}</span>` +
            `<span class="panel-value">${esc(detail)}</span>` +
            `</div>`;
    }

    el.innerHTML = html;
};

Panels.renderPopulation = function (el, data) {
    if (!data || data.value === undefined || data.value === null) {
        setEmpty(el, 'Ingen befolkningsdata tilgjengelig');
        return;
    }

    const value = Array.isArray(data.value) ? data.value[0] : data.value;

    let year = '';
    try {
        const tidLabels = data.dimension && data.dimension.Tid && data.dimension.Tid.category && data.dimension.Tid.category.label
            ? data.dimension.Tid.category.label
            : null;
        if (tidLabels) {
            const firstKey = Object.keys(tidLabels)[0];
            year = tidLabels[firstKey] || firstKey || '';
        }
    } catch (_) {
        year = '';
    }

    const label = year ? `Befolkning (${year})` : 'Befolkning';
    const formatted = value !== null && value !== undefined ? formatThousands(value) : '–';

    el.innerHTML = row(label, formatted);
};

Panels.renderBusiness = function (el, data) {
    const enheter =
        data && data._embedded && data._embedded.enheter
            ? data._embedded.enheter
            : null;

    if (!enheter || !enheter.length) {
        setEmpty(el, 'Ingen registrerte virksomheter');
        return;
    }

    const entries = enheter.slice(0, 5);
    let html = '';

    for (const enhet of entries) {
        const navn = enhet.navn || '';
        const orgform = enhet.organisasjonsform && enhet.organisasjonsform.beskrivelse
            ? enhet.organisasjonsform.beskrivelse
            : '';
        const orgnr = enhet.organisasjonsnummer || '';
        const stiftelse = enhet.stiftelsesdato || '';
        html += `<div class="business-item">` +
            `<div class="business-name">${esc(navn)}</div>` +
            `<div class="business-meta">` +
                (orgform ? `<span class="business-tag">${esc(orgform)}</span>` : '') +
                (stiftelse ? `<span class="business-tag">${esc(stiftelse)}</span>` : '') +
                (orgnr ? `<span class="business-orgnr">${esc(orgnr)}</span>` : '') +
            `</div>` +
            `</div>`;
    }

    el.innerHTML = html;
};

// ---------------------------------------------------------------------------
// Expose state helpers on namespace so app.js can use them
// ---------------------------------------------------------------------------

Panels.setLoading = setLoading;
Panels.setError = setError;
Panels.setEmpty = setEmpty;
