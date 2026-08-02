
// Formats a "YYYY-MM-DD" into the locale's short date form. Parsed/rendered in UTC
// throughout so the date shown never shifts by a day depending on the viewer's
// timezone (the source dates are calendar dates, not timestamps).
function formatShortDate(isoDate, lang) {
    const d = new Date(isoDate + 'T00:00:00Z');
    if (lang === 'ko') {
        return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// "How long has this been going on" — computed at render time (not baked into the
// data) so it stays correct no matter when the page is viewed. Sub-month durations
// fall back to a day count since "0개월째"/"0mo" would read as broken.
function formatDurationSince(isoDate, lang) {
    const start = new Date(isoDate + 'T00:00:00Z');
    const now = new Date();
    let months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
    if (now.getUTCDate() < start.getUTCDate()) months--;
    if (months < 1) {
        const days = Math.max(0, Math.floor((now - start) / 86400000));
        return lang === 'ko' ? `${days}일째` : `${days}d`;
    }
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (lang === 'ko') {
        if (years > 0) return remMonths > 0 ? `${years}년 ${remMonths}개월째` : `${years}년째`;
        return `${remMonths}개월째`;
    }
    if (years > 0) return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
    return `${remMonths}mo`;
}

// Ongoing events (still-active wars, structural economic risk, etc.) show
// "start date ~ (duration so far)"; resolved multi-day events show "start ~ end";
// single-day events (most disasters/social incidents) just show the date.
function formatEventDateLabel(w, lang) {
    if (!w.date) return '';
    const startStr = formatShortDate(w.date, lang);
    if (w.ongoing) {
        const duration = formatDurationSince(w.date, lang);
        return lang === 'ko' ? `${startStr} ~ (${duration} 진행 중)` : `${startStr} ~ (ongoing, ${duration})`;
    }
    if (w.endDate) {
        return `${startStr} ~ ${formatShortDate(w.endDate, lang)}`;
    }
    return startStr;
}

// The popup is a plain DOM overlay, not something MapLibre itself tracks — so it has
// to be repositioned by hand on every 'move' (pan, zoom, and rotate all fire it) or it
// stays put in screen space while the map (and the event it's attached to) scrolls out
// from under it. popupAnchorLngLat is the map-space point the open popup is pinned to;
// positionRiskPopup() re-projects it to pixels each time the map moves. null means no
// popup is open, so the 'move' handler has nothing to do.
let popupAnchorLngLat = null;

function positionRiskPopup() {
    if (!popupAnchorLngLat || !mapInstance) return;
    const popup = document.getElementById('warzone-popup');
    const wrapper = document.getElementById('map-wrapper');
    const mapContainer = document.getElementById('world-map');
    const wrapperRect = wrapper.getBoundingClientRect();
    const mapRect = mapContainer.getBoundingClientRect();
    const pt = mapInstance.project(popupAnchorLngLat);
    const x = (mapRect.left - wrapperRect.left) + pt.x;
    const y = (mapRect.top - wrapperRect.top) + pt.y;
    const popupWidth = 270;
    const left = Math.min(Math.max(x + 12, 8), Math.max(wrapper.clientWidth - popupWidth, 8));
    const top = Math.min(Math.max(y - 10, 8), Math.max(wrapper.clientHeight - 90, 8));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

// Shared popup for both war/disaster circles (GL layer click, anchored at the clicked
// lngLat) and economy/social dots (DOM marker click, anchored at the marker's own
// coords) — lngLat is the map-space point to pin the popup to, w is a { ko, en,
// reasonKo, reasonEn, date, ongoing, endDate } item.
function showRiskPopup(lngLat, w) {
    popupAnchorLngLat = lngLat;
    const popup = document.getElementById('warzone-popup');
    document.getElementById('warzone-popup-title').innerText = currentLang === 'ko' ? w.ko : w.en;
    document.getElementById('warzone-popup-date').innerText = formatEventDateLabel(w, currentLang);
    document.getElementById('warzone-popup-reason').innerText = currentLang === 'ko' ? w.reasonKo : w.reasonEn;
    popup.style.display = 'block';
    positionRiskPopup();
}

function hideRiskPopup() {
    popupAnchorLngLat = null;
    const popup = document.getElementById('warzone-popup');
    if (popup) popup.style.display = 'none';
}
// Any click outside a risk marker (the marker's own handler calls stopPropagation,
// so this only fires for clicks elsewhere) closes the popup.
document.addEventListener('click', hideRiskPopup);

// Esri's free "World_Boundaries_and_Places" raster reference layer (previously used to
// label the Satellite view) is a fixed 256px/96dpi tile cache with no retina variant —
// MapLibre has no choice but to upscale it on any hidpi screen, which is what made its
// text look blurry. Instead, Satellite reuses the SAME vector place-label layers as the
// "Map" style (crisp at any zoom/DPI since text is drawn from real glyphs, not a
// pre-rendered image) laid on top of the Esri imagery, restyled with a white-on-black
// halo so they stay legible over any terrain color. This is fetched once, lazily —
// styleFor('satellite', ...) just falls back to bare imagery (no labels) if it hasn't
// resolved yet, which in practice never happens since the user has to click the
// SATELLITE button first.
let cartoLabelLayers = null; // { source, glyphs, layers } once loaded
// retryOnFail: a transient network hiccup on the very first page load shouldn't
// permanently disable Satellite's place labels for the rest of the session — without
// this, a single failed fetch here left cartoLabelLayers null forever (styleFor()
// checks it once per style() call, but nothing ever re-attempted the fetch itself).
async function loadCartoLabelLayers(retryOnFail = true) {
    try {
        const res = await fetch('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json');
        if (!res.ok) throw new Error('http ' + res.status);
        const style = await res.json();
        cartoLabelLayers = {
            source: style.sources.carto,
            glyphs: style.glyphs,
            layers: style.layers.filter(l => l.id.startsWith('place_'))
        };
        // If Satellite was already active when this (re)landed, rebuild it now so the
        // labels actually appear instead of waiting for the next manual style switch.
        if (mapInstance && currentMapStyle === 'satellite') {
            mapInstance.setStyle(styleFor('satellite', currentTheme));
            mapInstance.once('idle', onMapStyleReady);
        }
    } catch (e) {
        cartoLabelLayers = null;
        if (retryOnFail) setTimeout(() => loadCartoLabelLayers(false), 5000);
    }
}
loadCartoLabelLayers();

function satelliteLabelLayer(l) {
    const layout = { ...l.layout };
    delete layout['icon-image']; // no sprite sheet in this minimal style, so drop the dot icon
    delete layout['icon-size'];
    return {
        id: l.id, type: l.type, source: 'carto', 'source-layer': l['source-layer'],
        minzoom: l.minzoom, maxzoom: l.maxzoom, filter: l.filter, layout,
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.3, 'text-halo-blur': 0.3 }
    };
}

// "Map" style mirrors sbhnews.com's look: CARTO's free vector basemap (no API key),
// flipping between its light/dark GL styles to match the theme toggle. "Satellite" is
// real, zoomable Esri World Imagery with the CARTO place labels (see above) overlaid.
function styleFor(style, theme) {
    if (style === 'satellite') {
        const sources = {
            esri: {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
            }
        };
        const layers = [{ id: 'esri-satellite', type: 'raster', source: 'esri' }];
        if (cartoLabelLayers) {
            sources.carto = cartoLabelLayers.source;
            layers.push(...cartoLabelLayers.layers.map(satelliteLabelLayer));
        }
        return { version: 8, glyphs: cartoLabelLayers ? cartoLabelLayers.glyphs : undefined, sources, layers };
    }
    return theme === 'light'
        ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
}

// The CARTO place-label layers ship their own continent-name layer (place_continent,
// visible roughly zoom 0-2) — since it's part of the vector style/source itself, it has
// to be explicitly hidden rather than filtered from our own data. Applies to both "Map"
// and "Satellite" now that Satellite reuses the same layers.
function hideContinentLabels() {
    if (mapInstance && mapInstance.getLayer('place_continent')) {
        mapInstance.setLayoutProperty('place_continent', 'visibility', 'none');
    }
}

// CARTO's place layers hard-code English ({name_en}) for country/state/continent and
// switch to the OSM-local name only deep into city zoom — neither gives Korean text.
// The underlying vector tiles do carry a `name:ko` field though (OpenMapTiles' per-
// language name set), so in Korean mode every place-label layer's text-field is
// overridden to prefer it, falling back to English/local name where no Korean
// translation exists. Applies to both Map and Satellite (same layer ids/source).
const PLACE_LABEL_LAYERS = [
    'place_continent', 'place_state', 'place_country_1', 'place_country_2',
    'place_city_r6', 'place_city_r5', 'place_city_dot_r7', 'place_city_dot_r4',
    'place_city_dot_r2', 'place_city_dot_z7', 'place_capital_dot_z7',
    'place_town', 'place_villages', 'place_suburbs', 'place_hamlet'
];
function localizeMapLabels(lang) {
    if (!mapInstance) return;
    const expr = lang === 'ko'
        ? ['coalesce', ['get', 'name:ko'], ['get', 'name_en'], ['get', 'name']]
        : ['coalesce', ['get', 'name_en'], ['get', 'name']];
    PLACE_LABEL_LAYERS.forEach(id => {
        if (mapInstance.getLayer(id)) mapInstance.setLayoutProperty(id, 'text-field', expr);
    });
}

// Switching MapLibre's style wipes any sources/layers we added (markers survive,
// since they're plain DOM elements positioned independently of the style) — so every
// circle layer has to be rebuilt every time setStyle() runs, once the new style
// finishes loading (see onMapStyleReady). War/disaster ONLY — economy/social always
// render as plain point markers instead (see addEconomyMarkers/addSocialMarkers below),
// regardless of scale, per an explicit call to keep those two categories dot-only.
function addCircleLayer(id, events, fillColor, lineColor, visible) {
    if (!mapInstance || mapInstance.getSource(id + '-events')) return;
    mapInstance.addSource(id + '-events', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: events.map(e => ({
                type: 'Feature',
                properties: { ko: e.ko, en: e.en, reasonKo: e.reasonKo, reasonEn: e.reasonEn, date: e.date, ongoing: e.ongoing, endDate: e.endDate || null },
                geometry: { type: 'Polygon', coordinates: [circlePolygon(e.coords, e.radius)] }
            }))
        }
    });
    const vis = visible ? 'visible' : 'none';
    mapInstance.addLayer({
        id: `${id}-fill`, type: 'fill', source: `${id}-events`,
        layout: { visibility: vis },
        paint: { 'fill-color': fillColor }
    });
    mapInstance.addLayer({
        id: `${id}-line`, type: 'line', source: `${id}-events`,
        layout: { visibility: vis },
        paint: { 'line-color': lineColor, 'line-width': 2 }
    });
    mapInstance.on('click', `${id}-fill`, (e) => {
        e.originalEvent.stopPropagation();
        showRiskPopup(e.lngLat, e.features[0].properties);
    });
    mapInstance.on('mouseenter', `${id}-fill`, () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
    mapInstance.on('mouseleave', `${id}-fill`, () => { mapInstance.getCanvas().style.cursor = ''; });
}

function addWarLayer() { addCircleLayer('war', WAR_EVENTS, 'rgba(255, 70, 70, 0.32)', '#dc2626', warVisible); }
function addDisasterLayer() { addCircleLayer('disaster', DISASTER_EVENTS, 'rgba(250, 204, 21, 0.28)', '#eab308', disasterVisible); }

// Economy/social dots are plain DOM markers (points, not affected-area circles) —
// unlike the war/disaster layer they only need to be created once, since Markers live
// outside the GL style and survive setStyle() calls on their own.
let economyMarkerEls = [];
function addEconomyMarkers() {
    economyMarkerEls = ECONOMY_EVENTS.map(ev => {
        const wrapper = document.createElement('div');
        wrapper.className = 'econ-marker';
        wrapper.innerHTML = '<span class="econ-dot"></span>';
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            showRiskPopup(ev.coords, ev);
        });
        new maplibregl.Marker({ element: wrapper, anchor: 'center' }).setLngLat(ev.coords).addTo(mapInstance);
        return wrapper;
    });
    updateEconomyVisibility();
}

function updateEconomyVisibility() {
    document.body.classList.toggle('hide-economy-risk', !econVisible);
}

// Social-impact dots (crime/terrorism/mass-migration) — same plain-DOM-marker
// approach as addEconomyMarkers(), just a separate array/class/body-class so it can
// be toggled independently.
let socialMarkerEls = [];
function addSocialMarkers() {
    socialMarkerEls = SOCIAL_EVENTS.map(ev => {
        const wrapper = document.createElement('div');
        wrapper.className = 'social-marker';
        wrapper.innerHTML = '<span class="social-dot"></span>';
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            showRiskPopup(ev.coords, ev);
        });
        new maplibregl.Marker({ element: wrapper, anchor: 'center' }).setLngLat(ev.coords).addTo(mapInstance);
        return wrapper;
    });
    updateSocialVisibility();
}

function updateSocialVisibility() {
    document.body.classList.toggle('hide-social-risk', !socialVisible);
}


// Called once a style (Map or Satellite) has fully finished loading — hides the
// basemap's own continent labels, re-applies the current language's label text, and
// (re)builds the war/disaster circle layers, both of which setStyle() would otherwise
// have wiped. Economy/social markers are untouched here since Markers survive on their own.
function onMapStyleReady() {
    hideContinentLabels();
    localizeMapLabels(currentLang);
    addWarLayer();
    addDisasterLayer();
}

// Approximate circle-as-polygon (equirectangular degrees) — good enough for an
// illustrative conflict-zone marker, not meant to be geodesically precise.
function circlePolygon([lon, lat], radiusKm, steps = 64) {
    const dLon = radiusKm / (111.320 * Math.cos(lat * Math.PI / 180));
    const dLat = radiusKm / 110.574;
    const coords = [];
    for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * 2 * Math.PI;
        coords.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
    }
    return coords;
}

// Circle layers (war/disaster always, economy/social for the radius-bearing subset)
// are shown/hidden via the GL layer's own visibility, which survives until the next
// style swap — at that point onMapStyleReady()'s addWarLayer()/addDisasterLayer() calls
// re-apply the current flag (see addCircleLayer's `visible` param). Economy/social are
// shown/hidden via a body class instead, since those are plain DOM markers.
let warVisible = true;
let disasterVisible = true;
let econVisible = true;
let socialVisible = true;
function toggleRiskCategory(type) {
    if (type === 'war') {
        warVisible = document.getElementById('chk-war').checked;
        if (mapInstance && mapInstance.getLayer('war-fill')) {
            const v = warVisible ? 'visible' : 'none';
            mapInstance.setLayoutProperty('war-fill', 'visibility', v);
            mapInstance.setLayoutProperty('war-line', 'visibility', v);
        }
    } else if (type === 'disaster') {
        disasterVisible = document.getElementById('chk-disaster').checked;
        if (mapInstance && mapInstance.getLayer('disaster-fill')) {
            const v = disasterVisible ? 'visible' : 'none';
            mapInstance.setLayoutProperty('disaster-fill', 'visibility', v);
            mapInstance.setLayoutProperty('disaster-line', 'visibility', v);
        }
    } else if (type === 'economy') {
        econVisible = document.getElementById('chk-economy').checked;
        updateEconomyVisibility();
    } else if (type === 'social') {
        socialVisible = document.getElementById('chk-social').checked;
        updateSocialVisibility();
    }
}

// Switches the visible base style (Map / Satellite). setStyle() tears down every
// source/layer we added, so the war layer is rebuilt (and continent labels re-hidden)
// once the new style loads; markers aren't affected since they live outside the style.
function switchMapStyle(style) {
    if (!mapInstance || style === currentMapStyle) return;
    currentMapStyle = style;
    mapInstance.setStyle(styleFor(style, currentTheme));
    mapInstance.once('idle', onMapStyleReady);

    document.querySelectorAll('.map-style-btn').forEach(btn => btn.classList.remove('map-style-active'));
    const activeBtn = document.getElementById(`btn-style-${style}`);
    if (activeBtn) activeBtn.classList.add('map-style-active');
}

// Marker/background colors that follow the theme — separate from the GL style swap
// below so the initial page load doesn't trigger a redundant setStyle() that would
// wipe out the war layer moments after onMapStyleReady() just added it.
function applyThemeColors() {
    const isLight = currentTheme === 'light';
    document.getElementById('map-wrapper').style.backgroundColor = isLight ? "#bfdbfe" : "#000000";
}

// Only the "Map" style has a light/dark GL variant — Satellite imagery doesn't
// change with the theme toggle, so it's left alone.
function applyThemeStyle() {
    if (currentMapStyle !== 'map') return;
    mapInstance.setStyle(styleFor('map', currentTheme));
    mapInstance.once('idle', onMapStyleReady);
}

// The inhabited world (skips the deep-Antarctica sliver, which would otherwise force a
// much tighter zoom than any real continent needs) — this is what "start zoomed out
// enough to see every continent" fits against.
const WORLD_VIEW_BOUNDS = [[-180, -58], [180, 78]];

// Infinite left/right pan-and-wrap needs MapLibre's default renderWorldCopies:true —
// but below a certain zoom, a world map narrower than the viewport renders more than
// one copy of the same landmass side by side in the SAME view, which reads as a bug
// rather than "wrapping". So minZoom is pinned to whatever zoom fits WORLD_VIEW_BOUNDS
// into the container (cameraForBounds accounts for both width AND height, unlike a
// width-only calculation, so it also satisfies "show every continent on load") —
// wrapping still happens once you drag past the edge, it just never shows two copies of
// the same landmass at once. Recomputed on resize since it depends on container size.
// `isInitial` additionally snaps the camera itself to that fitted view (used once on
// load); on resize we only drag the camera along if it was already sitting at (or below)
// the previous minZoom, so a manually zoomed-in user doesn't get yanked back out.
function applyWorldFitMinZoom(isInitial) {
    if (!mapInstance) return;
    const cam = mapInstance.cameraForBounds(WORLD_VIEW_BOUNDS, { padding: 0 });
    if (!cam) return;
    const wasAtMin = isInitial || mapInstance.getZoom() <= mapInstance.getMinZoom() + 0.05;
    mapInstance.setMinZoom(cam.zoom);
    if (isInitial) {
        mapInstance.jumpTo({ center: cam.center, zoom: cam.zoom });
    } else {
        if (wasAtMin || mapInstance.getZoom() < cam.zoom) mapInstance.setZoom(cam.zoom);
        mapInstance.resize();
    }
}

// Watches for the one forced maplibregl-compact-show MapLibre's AttributionControl
// adds the first time it has attribution content to display, and immediately un-shows
// it — a one-shot observer, so it never fights a later manual click on the icon (which
// toggles that same class via the control's own click handler).
function collapseAttributionOnFirstShow(container) {
    const observer = new MutationObserver(() => {
        const el = container.querySelector('.maplibregl-compact-show');
        if (el) {
            el.classList.remove('maplibregl-compact-show');
            observer.disconnect();
        }
    });
    observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

function initMap() {
    const container = document.getElementById('world-map');

    mapInstance = new maplibregl.Map({
        container,
        style: styleFor('map', currentTheme),
        center: [5, 15],
        zoom: 1,
        minZoom: 1,
        maxZoom: 18,
        // Default AttributionControl only auto-collapses to the small "i" icon on
        // narrow containers; ours is wide enough that it'd otherwise always show the
        // full attribution text inline. compact:true switches it to icon+expandable
        // instead, but MapLibre's own _updateCompact() unconditionally pops it open
        // (adds maplibregl-compact-show) the first time attribution content is set —
        // collapseAttributionOnFirstShow() below undoes exactly that one forced-open,
        // leaving later manual clicks on the icon (which use the same class) alone.
        attributionControl: false
    });
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }));
    collapseAttributionOnFirstShow(container);
    mapInstance.dragRotate.disable();
    mapInstance.touchZoomRotate.disableRotation();
    applyWorldFitMinZoom(true);
    // Keeps an open risk popup pinned to its map-space anchor through pan/zoom instead
    // of sitting fixed in screen space while the event underneath it scrolls away.
    // No-op (see positionRiskPopup) when no popup is open.
    mapInstance.on('move', positionRiskPopup);

    mapInstance.on('load', () => {
        onMapStyleReady();
        addEconomyMarkers();
        addSocialMarkers();
        applyThemeColors();
    });

    // Tile/glyph/sprite requests that fail (a network hiccup, the free CARTO/Esri CDN
    // briefly rate-limiting, a dropped request while panning fast) are NOT retried by
    // MapLibre on its own — that tile is just left blank, and text labels in particular
    // silently disappear if only the glyph (font) fetch failed even though the polygon/
    // line data next to it loaded fine. That's what showed up as "지도가 나오다가 만
    //곳들" (patches that started rendering then stalled, worst right at island/mainland
    // coastline seams where many small tiles meet) and place names not appearing when
    // zooming in. Reusing the exact reload path switchMapStyle()/applyThemeStyle()
    // already use (setStyle + onMapStyleReady) forces every currently-visible tile and
    // the label font/glyphs to be re-requested, which recovers from exactly this kind of
    // one-off failure. Debounced so a burst of several error events (they tend to arrive
    // together) triggers at most one reload every few seconds, not a reload storm.
    let lastTileErrorRecoveryAt = 0;
    mapInstance.on('error', () => {
        const now = Date.now();
        if (now - lastTileErrorRecoveryAt < 4000) return;
        lastTileErrorRecoveryAt = now;
        setTimeout(() => {
            if (!mapInstance) return;
            mapInstance.setStyle(styleFor(currentMapStyle, currentTheme));
            mapInstance.once('idle', onMapStyleReady);
        }, 800);
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => applyWorldFitMinZoom(false)).observe(container);
    }
}

