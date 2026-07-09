// History Mode — Telemetry Compare page.
// Charts are hand-crafted inline SVG (no charting library, matching the existing Gap Ring /
// pedal-chart pattern). The whole stack shares a single X domain = lapDistance in metres so
// a vertical crosshair lines up across every metric and the track-map marker without any
// transform math.

(function () {
    'use strict';

    // Per-page state. Three logical groups (kept in one object for closure simplicity):
    //   1) Persisted — restored from localStorage on load, saved by persistState() on
    //      every user-driven change. These survive page reload.
    //   2) Ephemeral UI — chart/map state that only makes sense in the current session
    //      (zoom window, brush, etc). Reset by Esc/R.
    //   3) Runtime — caches and cross-module function pointers that other code reaches
    //      into. Prefixed __ by convention so they don't get persisted by accident.
    var compareState = {
        // --- Persisted ---
        hiddenMetrics: new Set(),
        heightScale: 1.9,           // 1.3 | 1.9 | 2.8 (Compact / Normal / Tall presets)
        miniPerSector: 3,
        insightsEnabled: true,
        cornersEnabled: true,       // corner ruler + per-chart corner lines + hover tag
        sideTab: 'controls',        // 'controls' | 'insights' — active left-column tab
        chipMode: 'pair',           // 'pair' | 'diff'
        mapLayers: { line: true, deltaHeat: true, events: true, dominance: false, loss: true },
        // Default zoom is fairly close (3×) so the map opens as a trajectory-analysis surface.
        // Users can zoom out to 0.5× for a full-track overview, or reset to Z=1.
        mapZoom: 2.2,               // 1 = full track in viewport, max 20×, min 0.5×
        mapPanX: null,              // null = "auto-center on first draw"; numbers are pixel offsets
        mapPanY: null,
        mapFollow: true,            // auto-recenter on hovered point when zoomed in

        // --- Ephemeral UI ---
        zoomStart: null,            // metres; null = full lap
        zoomEnd: null,
        deltaMode: 'cumulative',    // 'cumulative' | 'sector'
        brush: null,                // pixels during click-drag zoom-select

        // --- Runtime caches & cross-module pointers (never persisted) ---
        deltaSeriesCache: new Map(),
        // __camState, __chartCam, __mapFollow, __mapProject, __applyMapTransform,
        // __updateChartStackView, __lastBridgeD — populated lazily by drawTrackMap /
        // drawChartStack and consumed by hover bridge.
    };
    var MAX_MAP_ZOOM = 20;
    var MIN_MAP_ZOOM = 0.5;
    var shortcutsBound = false;
    /** Updated on every redraw so the global R shortcut does not keep stale lap data. */
    var latestCompareLapData = null;

    var PERSIST_KEY = 'tcCompareUi';

    function loadPersistedState() {
        try {
            var raw = localStorage.getItem(PERSIST_KEY);
            if (!raw) return;
            var p = JSON.parse(raw);
            if (Array.isArray(p.hiddenMetrics)) compareState.hiddenMetrics = new Set(p.hiddenMetrics);
            if (typeof p.heightScale === 'number') compareState.heightScale = p.heightScale;
            if ([1, 3, 4].indexOf(Number(p.miniPerSector)) >= 0) compareState.miniPerSector = Number(p.miniPerSector);
            compareState.insightsEnabled = p.insightsEnabled !== false;
            compareState.cornersEnabled = p.cornersEnabled !== false;
            if (p.sideTab === 'insights' || p.sideTab === 'controls') compareState.sideTab = p.sideTab;
            if (p.chipMode === 'diff' || p.chipMode === 'pair') compareState.chipMode = p.chipMode;
            if (p.mapLayers && typeof p.mapLayers === 'object') {
                compareState.mapLayers = {
                    line: p.mapLayers.line !== false,
                    deltaHeat: p.mapLayers.deltaHeat !== false,
                    events: p.mapLayers.events !== false,
                    dominance: p.mapLayers.dominance === true,
                    loss: p.mapLayers.loss !== false,
                };
            }
            if (typeof p.mapZoom === 'number' && isFinite(p.mapZoom)) {
                compareState.mapZoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, p.mapZoom));
            }
            // null pan = "use default centered pan for current zoom". Only honour
            // persisted values that are actual finite numbers; anything else leaves
            // the defaults intact so drawTrackMap centers automatically.
            if (typeof p.mapPanX === 'number' && isFinite(p.mapPanX)) compareState.mapPanX = p.mapPanX;
            if (typeof p.mapPanY === 'number' && isFinite(p.mapPanY)) compareState.mapPanY = p.mapPanY;
            if (typeof p.mapFollow === 'boolean') compareState.mapFollow = p.mapFollow;
        } catch (e) { /* ignore corrupt storage */ }
    }

    function persistState() {
        try {
            localStorage.setItem(PERSIST_KEY, JSON.stringify({
                hiddenMetrics: Array.from(compareState.hiddenMetrics),
                heightScale: compareState.heightScale,
                miniPerSector: compareState.miniPerSector,
                insightsEnabled: compareState.insightsEnabled,
                cornersEnabled: compareState.cornersEnabled,
                sideTab: compareState.sideTab,
                chipMode: compareState.chipMode,
                mapLayers: compareState.mapLayers,
                mapZoom: compareState.mapZoom,
                mapPanX: compareState.mapPanX,
                mapPanY: compareState.mapPanY,
                mapFollow: compareState.mapFollow,
            }));
        } catch (e) { /* storage may be disabled */ }
    }

    loadPersistedState();

    function deltaCacheKey(carIdx, refCarIdx, xMin, xMax, mode, miniPerSector) {
        return [carIdx, refCarIdx, xMin.toFixed(3), xMax.toFixed(3), mode, miniPerSector].join('|');
    }

    function clearDeltaSeriesCache() {
        compareState.deltaSeriesCache.clear();
    }

    function createInterpContext() {
        return { interpCount: 0 };
    }

    var METRICS = [
        { key: 'delta', label: 'Δ', plotTitle: 'DELTA', height: 70, getValue: null /* computed */, min: -1, max: 1 },
        { key: 'spd',   label: 'Speed', plotTitle: 'SPEED', height: 70, min: 0, max: 370 },
        { key: 'thr',   label: 'Throttle', plotTitle: 'THROTTLE', height: 50, min: 0, max: 100 },
        { key: 'brk',   label: 'Brake', plotTitle: 'BRAKE', height: 50, min: 0, max: 100 },
        { key: 'str',   label: 'Steering', plotTitle: 'STEERING', height: 50, min: -100, max: 100 },
        { key: 'gr',    label: 'Gear', plotTitle: 'GEAR', height: 50, min: -1, max: 8 },
        { key: 'rpm',   label: 'RPM', plotTitle: 'RPM', height: 60, min: 0, max: 14000 },
        { key: 'ers',   label: 'ERS', plotTitle: 'ERS', height: 60, min: 0, max: 100 },
        // Cumulative ERS deployment over the lap (Joules → MJ via scale). Hidden when
        // every visible lap is flat-zero (e.g. F2). Range is computed dynamically —
        // 2025 laps top out near 4 MJ, 2026 near the 6 MJ harvest cap.
        { key: 'dep',   label: 'Deploy', plotTitle: 'ERS DEPLOY', height: 60, min: 0, max: 4, field: 'ersDepLapJ', scale: 1 / 1e6, hideWhenFlat: true },
        { key: 'drs',   label: 'DRS', plotTitle: 'DRS', height: 22, min: 0, max: 1, style: 'band' },
        // 2026-regulation rows (Season Pack, CarTelemetry26): Active Aero Straight Mode is
        // the DRS analogue, Overtake (Boost) is the gap-based attack tool. Band rows are
        // auto-hidden when no visible lap carries the signal (see metricsFor), so 2025
        // sessions never show them and 2026 sessions show them instead of an empty DRS row.
        { key: 'aero',  label: 'Aero', plotTitle: 'ACTIVE AERO', height: 22, min: 0, max: 1, style: 'band' },
        { key: 'ovt',   label: 'Boost', plotTitle: 'BOOST', height: 22, min: 0, max: 1, style: 'band' },
    ];

    /** Sample value for a metric: reads metric.field (falls back to key), applies metric.scale. */
    function metricValue(metric, s) {
        var v = s[metric.field || metric.key] || 0;
        return metric.scale ? v * metric.scale : v;
    }

    var ERS_MODE_TAGS = ['', 'MED', 'HOT', 'OT'];

    // Mode 3 was renamed Overtake → Boost under the 2026 regulations (spec v1.1).
    function ersModeTag(md, carIdx) {
        if (md === 3 && lapIsReg26(carIdx)) return 'BST';
        return ERS_MODE_TAGS[md] || '';
    }

    // Per-lap regulation detection. Session format is the base signal; ghost laps imported
    // from another session may differ, so any lap whose samples carry Active Aero / Boost
    // data is treated as 2026 regardless of the host session's format.
    function lapIsReg26(carIdx) {
        return !!(compareState.__reg26 && compareState.__reg26.has(carIdx));
    }
    function computeReg26Set(lapData) {
        var out = new Set();
        if (!lapData) return out;
        var sess = window.HistoryDetail && window.HistoryDetail.state ? window.HistoryDetail.state.session : null;
        var sessionIs26 = !!(sess && sess.meta && Number(sess.meta.packetFormat) >= 2026);
        lapData.forEach(function (d, carIdx) {
            if (sessionIs26) { out.add(carIdx); return; }
            var samples = d && d.samples;
            if (!samples) return;
            for (var i = 0; i < samples.length; i++) {
                if ((samples[i].aero || 0) === 1 || (samples[i].ovt || 0) === 1) { out.add(carIdx); return; }
            }
        });
        return out;
    }

    // True when at least one visible lap has the band signal active somewhere. Decides
    // which of the DRS / Active Aero / Boost rows exist for the current comparison —
    // works for pure 2025, pure 2026 and mixed (ghost) selections without a format flag.
    function bandHasSignal(lapData, key) {
        if (!lapData) return false;
        var found = false;
        lapData.forEach(function (d) {
            if (found || !d || !d.samples) return;
            var samples = d.samples;
            for (var i = 0; i < samples.length; i++) {
                if ((samples[i][key] || 0) === 1) { found = true; return; }
            }
        });
        return found;
    }
    // True when at least one visible lap has a non-zero value in `field` — decides
    // whether hideWhenFlat rows (ERS Deploy) exist for the current comparison.
    function seriesHasSignal(lapData, field) {
        if (!lapData) return false;
        var found = false;
        lapData.forEach(function (d) {
            if (found || !d || !d.samples) return;
            var samples = d.samples;
            for (var i = 0; i < samples.length; i++) {
                if ((samples[i][field] || 0) > 0) { found = true; return; }
            }
        });
        return found;
    }
    function metricsFor(lapData) {
        return METRICS.filter(function (m) {
            if (m.style === 'band') return bandHasSignal(lapData, m.key);
            if (m.hideWhenFlat) return seriesHasSignal(lapData, m.field || m.key);
            return true;
        });
    }

    // Compact chip-value formatter per metric. Returns string for a sample+metric pair.
    // carIdx is only needed for regulation-sensitive labels (ERS mode 3: OT vs BST).
    function formatChipValue(metricKey, sample, deltaAt, carIdx) {
        if (!sample && metricKey !== 'delta') return '—';
        switch (metricKey) {
            case 'delta': return deltaAt == null ? '—'
                : (deltaAt >= 0 ? '+' : '') + deltaAt.toFixed(3) + ' s';
            case 'spd':   return Math.round(sample.spd) + ' km/h';
            case 'thr':   return Math.round(sample.thr) + '%';
            case 'brk':   return Math.round(sample.brk) + '%';
            case 'str':   return Math.round(sample.str) + '°';
            case 'gr':    return sample.gr > 0 ? 'G' + sample.gr : (sample.gr === 0 ? 'N' : 'R');
            case 'rpm':   return Math.round(sample.rpm).toLocaleString();
            case 'ers':   return Math.round(sample.ers || 0) + '% '
                + ersModeTag(sample.ersMd || 0, carIdx);
            case 'dep':   return ((sample.ersDepLapJ || 0) / 1e6).toFixed(2) + ' MJ';
            case 'drs':   return sample.drs ? 'ON' : 'OFF';
            case 'aero':  return sample.aero ? 'STRAIGHT' : 'CORNER';
            case 'ovt':   return sample.ovt ? 'ON' : 'OFF';
            default:      return '';
        }
    }

    // ---------- lap playback ----------
    // Sweeps lap distance over time and feeds it through the existing hover bridge, so the
    // chart crosshair, value chips, focus cards, top delta and the 3D-map marker all animate
    // in lock-step. The scrubber lets you drag to any point; speed scales the sweep rate.
    var PLAY_SECONDS = 6; // real seconds for a full lap at 1×.
    var playback = { playing: false, d: 0, raf: 0, last: 0, speed: 1 };

    function playbackTrackLen() {
        var s = window.HistoryDetail.state.session;
        return Math.round((s && s.meta && s.meta.trackLengthM) || 5000);
    }
    function getMapSyncMode() {
        try { return localStorage.getItem('tcMapSync') === 'time' ? 'time' : 'dist'; } catch (e) { return 'dist'; }
    }
    function driveBridge(d, source) {
        if (compareState.__hoverBridge) compareState.__hoverBridge.setDistance(d, source);
    }
    function updateScrubberUI(d) {
        var scrub = document.getElementById('tcScrub');
        var label = document.getElementById('tcScrubLabel');
        if (scrub && document.activeElement !== scrub) scrub.value = String(Math.round(d));
        if (label) label.textContent = Math.round(d) + ' m';
    }
    function updatePlayBtn() {
        var b = document.getElementById('tcPlay');
        if (b) { b.textContent = playback.playing ? '⏸' : '▶'; b.classList.toggle('is-playing', playback.playing); }
    }
    function playbackTick(ts) {
        if (!playback.playing) return;
        var dt = playback.last ? Math.min(0.1, (ts - playback.last) / 1000) : 0;
        playback.last = ts;
        var len = playbackTrackLen();
        playback.d += (len / PLAY_SECONDS) * playback.speed * dt;
        if (playback.d >= len) playback.d -= len; // loop the lap
        driveBridge(playback.d, 'playback');
        updateScrubberUI(playback.d);
        playback.raf = requestAnimationFrame(playbackTick);
    }
    function playbackPlay() {
        if (playback.playing) return;
        playback.playing = true; playback.last = 0;
        playback.raf = requestAnimationFrame(playbackTick);
        updatePlayBtn();
    }
    function playbackPause() {
        playback.playing = false;
        if (playback.raf) cancelAnimationFrame(playback.raf);
        playback.raf = 0;
        updatePlayBtn();
    }
    function playbackSeek(d) {
        playback.d = Math.max(0, d);
        driveBridge(playback.d, 'scrub');
        updateScrubberUI(playback.d);
    }
    function wireTransport(root) {
        playbackPause(); playback.d = 0;
        var play = root.querySelector('#tcPlay');
        var restart = root.querySelector('#tcRestart');
        var scrub = root.querySelector('#tcScrub');
        var speed = root.querySelector('#tcSpeed');
        if (play) play.addEventListener('click', function () { if (playback.playing) playbackPause(); else playbackPlay(); });
        if (restart) restart.addEventListener('click', function () { playbackSeek(0); });
        if (scrub) scrub.addEventListener('input', function () { playbackPause(); playbackSeek(Number(scrub.value)); });
        if (speed) speed.addEventListener('change', function () { playback.speed = Number(speed.value) || 1; });
        var sync = root.querySelector('#tcSync');
        function syncBtns() {
            var m = getMapSyncMode();
            if (sync) sync.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.sync === m); });
        }
        if (sync) sync.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
                try { localStorage.setItem('tcMapSync', b.dataset.sync); } catch (e) { /* ignore */ }
                syncBtns();
                if (window.TrackMap3D) {
                    window.TrackMap3D.setSyncMode(b.dataset.sync);
                    window.TrackMap3D.setMarkerDistance(playback.d);
                }
            });
        });
        syncBtns();
        updatePlayBtn();
    }

    function render(body) {
        var sess = window.HistoryDetail.state.session;
        var trackLen = Math.round((sess && sess.meta && sess.meta.trackLengthM) || 5000);
        body.innerHTML = ''
            + '<div class="tc-root">'
            + '<div class="tc-layout ' + tcLayoutModeClass() + '" id="tcLayout">'
            +   '<div class="tc-side" id="tcSide" data-priority="secondary">'
            +     '<div class="tc-side-tabs" role="tablist" aria-label="Left panel tabs">'
            +       '<button type="button" class="tc-side-tab" data-side-tab="controls" role="tab">Controls</button>'
            +       '<button type="button" class="tc-side-tab" data-side-tab="insights" role="tab">'
            +         '<span>Insights</span>'
            +         '<span class="tc-side-tab-badge" id="tcInsightsBadge" hidden>0</span>'
            +       '</button>'
            +     '</div>'
            +     '<div class="tc-side-panel" id="tcPanelControls" data-side-panel="controls">'
            +       '<div class="tc-side-picker-host" id="tcSidePickerHost"></div>'
            +       '<div class="tc-side-toolbar tc-sector-badges" id="tcBadges"></div>'
            +     '</div>'
            +     '<div class="tc-side-panel" id="tcPanelInsights" data-side-panel="insights">'
            +       '<div class="tc-side-insights-host" id="tcInsights"></div>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-main">'
            +     '<div class="tc-layer tc-layer-b" data-priority="primary">'
            +       '<div class="tc-charts" id="tcCharts"></div>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-rail" data-priority="secondary">'
            +     '<div class="tc-map tc-layer tc-layer-c" id="tcMap"></div>'
            +     '<aside class="tc-focus" id="tcFocusPanel"></aside>'
            +   '</div>'
            + '</div>'
            + '<div class="tc-transport" id="tcTransport">'
            +   '<button type="button" class="tc-tp-btn" id="tcPlay" title="Play / pause lap" aria-label="Play lap">▶</button>'
            +   '<button type="button" class="tc-tp-btn" id="tcRestart" title="Restart from start" aria-label="Restart">⏮</button>'
            +   '<input type="range" class="tc-tp-scrub" id="tcScrub" min="0" max="' + trackLen + '" value="0" step="1" aria-label="Lap position">'
            +   '<span class="tc-tp-pos" id="tcScrubLabel">0 m</span>'
            +   '<select class="tc-tp-speed" id="tcSpeed" aria-label="Playback speed">'
            +     '<option value="0.1">0.1×</option>'
            +     '<option value="0.25">0.25×</option>'
            +     '<option value="0.5">0.5×</option>'
            +     '<option value="1" selected>1×</option>'
            +     '<option value="2">2×</option>'
            +     '<option value="4">4×</option>'
            +   '</select>'
            +   '<span class="tc-tp-sync" id="tcSync" role="group" aria-label="Marker sync mode">'
            +     '<button type="button" data-sync="dist" title="Markers at the same track position">Pos</button>'
            +     '<button type="button" data-sync="time" title="Markers at their real position for the same elapsed time — shows the live gap">Gap</button>'
            +   '</span>'
            + '</div>'
            + '</div>';

        var side = body.querySelector('#tcSidePickerHost');
        var picker = window.HistoryDetail.DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: true,
            compareCardMode: true,
            onChange: function () { reloadLapSamples().then(redraw); },
        });
        side.appendChild(picker);
        wireModeToggle(body);
        wireTransport(body);
        wireSideTabs(body);

        reloadLapSamples().then(redraw);
    }

    // Left-column tabs: Controls (lap picker + chart controls) | Insights (Top Loss Zones).
    function applySideTab(root) {
        var tab = compareState.sideTab === 'insights' ? 'insights' : 'controls';
        root.querySelectorAll('.tc-side-tab').forEach(function (b) {
            var on = b.dataset.sideTab === tab;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        root.querySelectorAll('.tc-side-panel').forEach(function (p) {
            p.hidden = p.dataset.sidePanel !== tab;
        });
    }
    function wireSideTabs(root) {
        root.querySelectorAll('.tc-side-tab').forEach(function (b) {
            b.addEventListener('click', function () {
                compareState.sideTab = b.dataset.sideTab === 'insights' ? 'insights' : 'controls';
                persistState();
                applySideTab(root);
            });
        });
        applySideTab(root);
    }

    function updateInsightsBadge(n) {
        var b = document.getElementById('tcInsightsBadge');
        if (!b) return;
        if (n > 0) { b.textContent = String(n); b.hidden = false; }
        else { b.hidden = true; }
    }

    // Two-mode layout: 'charts' (chart stack is the hero) and 'map' (the 3D track map
    // rail becomes the hero, charts shrink to a secondary column). The toggle only swaps a
    // CSS-grid class — no DOM moves — so the hover bridge and all rendering stay intact.
    var MODE_KEY = 'tcCompareMode';
    function getCompareMode() {
        try { return localStorage.getItem(MODE_KEY) === 'map' ? 'map' : 'charts'; } catch (e) { return 'charts'; }
    }
    function tcLayoutModeClass() { return 'tc-layout--' + getCompareMode(); }
    // The toggle renders into the breadcrumb header slot (next to Export Driver / Ghosts),
    // not into the tab body — historyDetail clears the slot when another sub-tab opens.
    function wireModeToggle(root) {
        var layout = root.querySelector('#tcLayout');
        var slot = document.getElementById('historyHeaderModeSlot');
        if (slot) {
            slot.innerHTML = ''
                + '<div class="tc-mode-toggle" role="group" aria-label="Compare layout mode">'
                +   '<button type="button" data-mode="charts">Charts</button>'
                +   '<button type="button" data-mode="map">Map</button>'
                + '</div>';
        }
        var btns = slot ? slot.querySelectorAll('.tc-mode-toggle button') : [];
        function sync() {
            var m = getCompareMode();
            if (layout) {
                layout.classList.remove('tc-layout--charts', 'tc-layout--map');
                layout.classList.add('tc-layout--' + m);
            }
            btns.forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
            syncMapDeltaVisibility();
        }
        btns.forEach(function (b) {
            b.addEventListener('click', function () {
                try { localStorage.setItem(MODE_KEY, b.dataset.mode); } catch (e) { /* ignore */ }
                sync();
                // Re-render at the new column widths (3D map resizes itself via ResizeObserver).
                if (latestCompareLapData) redraw(latestCompareLapData);
            });
        });
        sync();
    }

    // Generation token: incremented on every reload so stale fetch results from a
    // previous selection cannot overwrite the chart with outdated data when the user
    // flips drivers/laps faster than the network responds.
    var reloadGeneration = 0;

    // Fetches samples for every selected driver/lap. Returns a Promise<Map<carIdx, {samples, motion}>>
    // or null if a newer reload has started while this one was in flight.
    function reloadLapSamples() {
        var hd = window.HistoryDetail;
        var myGen = ++reloadGeneration;
        var selections = Array.from(hd.state.driverSelection.entries()).filter(function (kv) {
            return kv[1] && kv[1].lap != null && !kv[1].hidden;
        });
        var promises = selections.map(function (kv) {
            var selectionKey = kv[0], sel = kv[1], lap = sel.lap;
            var sourceCarIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : selectionKey);
            return hd.fetchLapSamples(sourceCarIdx, lap).then(function (data) {
                return [selectionKey, data];
            });
        });
        return Promise.all(promises).then(function (entries) {
            if (myGen !== reloadGeneration) return null;
            var out = new Map();
            entries.forEach(function (e) { out.set(e[0], e[1]); });
            return out;
        });
    }

    function redraw(lapData) {
        // null = a newer reloadLapSamples started while this one was in flight — drop it.
        if (lapData == null) return;
        latestCompareLapData = lapData;
        clearDeltaSeriesCache();
        stopChartCamLoop();
        // Refresh per-redraw caches: regulation set (OT/BST labels, attack-aid chips) and
        // the metric list with band rows resolved against the actual data (DRS vs SM/Boost).
        compareState.__reg26 = computeReg26Set(lapData);
        compareState.__metrics = metricsFor(lapData);
        compareState.__laneColors = null; // lap/driver selection may have changed

        ensureReferenceSelection(lapData);
        ensureCornerData(window.HistoryDetail.state.session);
        drawBadges(lapData);
        drawChartStack(lapData);
        drawTrackMap(lapData);
        drawInsights(lapData);
    }

    function notifyCompare(msg) {
        if (window.HistoryDetail && typeof window.HistoryDetail.showToast === 'function') {
            window.HistoryDetail.showToast(msg);
            return;
        }
        window.setTimeout(function () { window.alert(msg); }, 0);
    }

    function ensureReferenceSelection(lapData) {
        var hd = window.HistoryDetail;
        var st = hd && hd.state ? hd.state : null;
        if (!st || !st.driverSelection) return null;
        var refIdx = st.compareState ? st.compareState.referenceCarIdx : null;
        var refLap = st.compareState ? st.compareState.referenceLap : null;
        var stillValid = refIdx != null && refLap != null && st.driverSelection.has(refIdx)
            && (st.driverSelection.get(refIdx) || {}).lap === refLap
            && lapData && lapData.has(refIdx);
        if (stillValid) return { carIdx: refIdx, lap: refLap };

        var first = null;
        st.driverSelection.forEach(function (sel, carIdx) {
            if (first || !sel || sel.lap == null || sel.hidden) return;
            if (lapData && !lapData.has(carIdx)) return;
            first = { carIdx: Number(carIdx), lap: Number(sel.lap) };
        });
        if (st.compareState) {
            st.compareState.referenceCarIdx = first ? first.carIdx : null;
            st.compareState.referenceLap = first ? first.lap : null;
        }
        if (first && (refIdx != null || refLap != null)) {
            notifyCompare('Reference was cleared. Assigned the first available driver/lap as REF.');
        }
        return first;
    }

    function buildSegmentBoundaries(meta, miniPerSector) {
        var trackLen = (meta && meta.trackLengthM) || 0;
        var s2 = (meta && meta.sector2StartM) || 0;
        var s3 = (meta && meta.sector3StartM) || 0;
        var perSector = Number(miniPerSector);
        var useMini = perSector > 1;

        var baseSectors = [
            { sector: 1, start: 0, end: s2 },
            { sector: 2, start: s2, end: s3 },
            { sector: 3, start: s3, end: trackLen },
        ];
        var segments = [];
        baseSectors.forEach(function (base) {
            if (base.end <= base.start) return;
            var count = useMini ? perSector : 1;
            var size = (base.end - base.start) / count;
            for (var i = 0; i < count; i++) {
                var segStart = base.start + size * i;
                var segEnd = (i === count - 1) ? base.end : (base.start + size * (i + 1));
                segments.push({
                    sector: base.sector,
                    part: i + 1,
                    parts: count,
                    start: segStart,
                    end: segEnd,
                    label: useMini ? ('S' + base.sector + '.' + (i + 1)) : ('S' + base.sector),
                });
            }
        });
        return segments;
    }

    // ---------- corner markers ----------
    // Corner positions come from the authored track geometry (/data/track-geometry/{id}.json):
    // corners = [{n, at}] where `at` is a fraction of the lap. Scaled by the session's
    // trackLengthM so corner distances live in the same X domain as the telemetry samples.

    var cornerFetch = { trackId: null };

    /** Returns the loaded corner array for the current track, or null while the geometry
     *  fetch is in flight (the resolve handler re-renders the stack + insights once). */
    function ensureCornerData(sess) {
        if (!sess || !sess.meta || sess.meta.trackId == null) return null;
        var tid = sess.meta.trackId;
        if (compareState.__cornersTrackId === tid) return compareState.__corners;
        if (cornerFetch.trackId !== tid) {
            cornerFetch.trackId = tid;
            fetch('/data/track-geometry/' + tid + '.json')
                .then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; })
                .then(function (geom) {
                    if (cornerFetch.trackId !== tid) return; // track changed mid-flight
                    var trackLen = sess.meta.trackLengthM || (geom && geom.lengthM) || 0;
                    compareState.__corners = ((geom && geom.corners) || []).map(function (c) {
                        return { n: c.n, d: c.at * trackLen };
                    }).sort(function (a, b) { return a.d - b.d; });
                    // DRS zones ship as [fromFrac, toFrac] pairs in the same geometry file.
                    compareState.__drsZones = ((geom && geom.drsZones) || []).map(function (z) {
                        return { from: z[0] * trackLen, to: z[1] * trackLen };
                    });
                    compareState.__cornersTrackId = tid;
                    if (latestCompareLapData) {
                        drawChartStack(latestCompareLapData);
                        drawInsights(latestCompareLapData);
                    }
                });
        }
        return null;
    }

    /** "T7" when the distance sits within the corner's influence window, else null. */
    function nearestCornerLabel(d) {
        var cs = compareState.__corners;
        if (!cs || !cs.length) return null;
        var best = null, bestDist = Infinity;
        for (var i = 0; i < cs.length; i++) {
            var dd = Math.abs(cs[i].d - d);
            if (dd < bestDist) { bestDist = dd; best = cs[i]; }
        }
        return best && bestDist <= 80 ? ('T' + best.n) : null;
    }

    /** "T5" / "T5–T8" for corners inside [start,end] (±50 m slack), '' when none. */
    function cornerRangeLabel(start, end) {
        var cs = compareState.__corners;
        if (!cs || !cs.length) return '';
        var inZone = cs.filter(function (c) { return c.d >= start - 50 && c.d <= end + 50; });
        if (!inZone.length) return '';
        return inZone.length === 1
            ? 'T' + inZone[0].n
            : 'T' + inZone[0].n + '–T' + inZone[inZone.length - 1].n;
    }

    /** Rebuilds the sticky corner ruler for the visible range. Ticks always render;
     *  numbers are decluttered greedily (skip label closer than 2.2% to the last shown). */
    function updateCornerRuler(host, xMin, xMax) {
        var ruler = host.querySelector('#tcCornerRuler');
        if (!ruler) return;
        var corners = compareState.cornersEnabled ? compareState.__corners : null;
        if (!corners || !corners.length) { ruler.hidden = true; return; }
        var span = Math.max(1, xMax - xMin);
        var html = '';
        // DRS-zone spans behind the ticks (activation stretch, from track geometry).
        (compareState.__drsZones || []).forEach(function (z) {
            var from = Math.max(z.from, xMin), to = Math.min(z.to, xMax);
            if (to <= from) return;
            var l = (from - xMin) / span * 100;
            var w = (to - from) / span * 100;
            html += '<span class="tc-ruler-drs" style="left:' + l.toFixed(3) + '%;width:' + w.toFixed(3) + '%"></span>';
        });
        var lastLabelPct = -10;
        corners.forEach(function (c) {
            if (c.d < xMin || c.d > xMax) return;
            var pct = (c.d - xMin) / span * 100;
            html += '<span class="tc-corner-tick" style="left:' + pct.toFixed(3) + '%"></span>';
            if (pct - lastLabelPct >= 2.2) {
                html += '<span class="tc-corner-num" style="left:' + pct.toFixed(3) + '%">' + c.n + '</span>';
                lastLabelPct = pct;
            }
        });
        if (!html) { ruler.hidden = true; return; }
        ruler.innerHTML = html;
        ruler.hidden = false;
    }

    /** Nice-number distance ticks for the visible range (~8 ticks target). */
    function xAxisTicks(xMin, xMax) {
        var span = Math.max(1, xMax - xMin);
        var target = span / 8;
        var steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
        var step = steps[steps.length - 1];
        for (var i = 0; i < steps.length; i++) {
            if (steps[i] >= target) { step = steps[i]; break; }
        }
        var out = [];
        for (var d = Math.ceil(xMin / step) * step; d <= xMax + 1e-6; d += step) out.push(d);
        return out;
    }

    /** Rebuilds the distance axis under the chart stack for the visible range. */
    function updateXAxis(host, xMin, xMax) {
        var axis = host.querySelector('#tcXAxis');
        if (!axis) return;
        var span = Math.max(1, xMax - xMin);
        var ticks = xAxisTicks(xMin, xMax);
        var html = '';
        ticks.forEach(function (d, i) {
            var pct = (d - xMin) / span * 100;
            if (pct < 0.5 || pct > 99.5) return;
            var label = Math.round(d) + (i === ticks.length - 1 ? ' m' : '');
            html += '<span class="tc-xaxis-tick" style="left:' + pct.toFixed(3) + '%"></span>'
                + '<span class="tc-xaxis-label" style="left:' + pct.toFixed(3) + '%">' + label + '</span>';
        });
        axis.innerHTML = html;
    }

    /** Shows/positions the "T7" tag that rides the crosshair in the hover layer. */
    function positionCornerTag(host, d, pct01) {
        var tag = host.querySelector('#tcCornerTag');
        if (!tag) return;
        var label = compareState.cornersEnabled ? nearestCornerLabel(d) : null;
        if (!label) { tag.hidden = true; return; }
        tag.textContent = label;
        tag.style.left = (pct01 * 100) + '%';
        tag.hidden = false;
    }

    // ---------- channel presets ----------
    // keys: null = show everything. Lists may name channels absent from the current
    // session (drs vs aero/ovt, dep on F2) — they're intersected with the live metric
    // set, so each preset degrades gracefully across regulations.
    var CHANNEL_PRESETS = [
        { id: 'all', label: 'All', title: 'Show every channel', keys: null },
        { id: 'inputs', label: 'Inputs', title: 'Driver inputs: delta, speed, throttle, brake, steering, gear',
          keys: ['delta', 'spd', 'thr', 'brk', 'str', 'gr'] },
        { id: 'energy', label: 'Energy', title: 'Energy management: delta, speed, ERS, deploy, attack tools',
          keys: ['delta', 'spd', 'ers', 'dep', 'drs', 'aero', 'ovt'] },
    ];

    function applyChannelPreset(presetId) {
        var preset = CHANNEL_PRESETS.find(function (p) { return p.id === presetId; });
        if (!preset) return;
        compareState.hiddenMetrics.clear();
        if (preset.keys) {
            METRICS.forEach(function (m) {
                if (preset.keys.indexOf(m.key) < 0) compareState.hiddenMetrics.add(m.key);
            });
        }
    }

    /** Preset id whose visible-channel set exactly matches the current state, or null. */
    function activePresetId(metrics) {
        var visible = metrics.filter(function (m) { return !compareState.hiddenMetrics.has(m.key); })
            .map(function (m) { return m.key; }).sort().join(',');
        var match = null;
        CHANNEL_PRESETS.forEach(function (p) {
            var expected = metrics.filter(function (m) { return !p.keys || p.keys.indexOf(m.key) >= 0; })
                .map(function (m) { return m.key; }).sort().join(',');
            if (expected === visible && match == null) match = p.id;
        });
        return match;
    }

    // ---------- sector badges ----------

    function drawBadges(lapData) {
        var host = document.getElementById('tcBadges');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var trackLen = sess.meta.trackLengthM || 0;
        var segments = buildSegmentBoundaries(sess.meta, compareState.miniPerSector);

        var resolvedRef = ensureReferenceSelection(lapData);
        var refIdx = resolvedRef ? resolvedRef.carIdx : null;
        var refDriverLap = refIdx != null ? sess.drivers[refIdx] : null;
        var refLap = null;
        if (refDriverLap) {
            var sel = window.HistoryDetail.state.driverSelection.get(refIdx);
            refLap = (refDriverLap.laps || []).find(function (l) { return l.lapNum === sel.lap; });
        }

        // ---------- Chart controls (sub-card layout) ----------
        // Each setting is a labelled row; Sectors + Channels are full-width sections.
        // All data-* attributes are unchanged so the delegated click handler below still
        // dispatches correctly — only the markup/labels were restyled.
        var metrics = compareState.__metrics || METRICS;
        var visibleCount = metrics.filter(function (m) { return !compareState.hiddenMetrics.has(m.key); }).length;

        var html = '<div class="tc-stb tc-ctrl">'
            + '<div class="tc-ctrl-head">Chart controls</div>'

            // Delta mode
            + '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Delta</span>'
            +   '<div class="tc-segmented tc-segmented--full">'
            +     '<button class="tc-seg-btn ' + (compareState.deltaMode === 'cumulative' ? 'active' : '') + '" data-mode="cumulative" title="Cumulative delta">Cumulative</button>'
            +     '<button class="tc-seg-btn ' + (compareState.deltaMode === 'sector' ? 'active' : '') + '" data-mode="sector" title="Per-sector delta">Per sec</button>'
            +   '</div>'
            + '</div>'

            // Split
            + '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Split</span>'
            +   '<div class="tc-segmented tc-segmented--full">'
            +     '<button class="tc-seg-btn ' + (compareState.miniPerSector === 1 ? 'active' : '') + '" data-mini="1">3</button>'
            +     '<button class="tc-seg-btn ' + (compareState.miniPerSector === 3 ? 'active' : '') + '" data-mini="3">9</button>'
            +     '<button class="tc-seg-btn ' + (compareState.miniPerSector === 4 ? 'active' : '') + '" data-mini="4">12</button>'
            +   '</div>'
            + '</div>'

            // Zoom
            + '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Zoom</span>'
            +   '<div class="tc-zoom-actions tc-zoom-actions--grow">'
            +     '<button class="tc-zoom-btn" data-action="reset-zoom" title="Reset to full lap">Reset</button>'
            +     '<button class="tc-zoom-btn" data-action="zoom-in-2x" title="Zoom in 2×" aria-label="Zoom in 2×">+2×</button>'
            +     '<button class="tc-zoom-btn" data-action="zoom-out-2x" title="Zoom out 2×" aria-label="Zoom out 2×">−2×</button>'
            +   '</div>'
            + '</div>';

        // Sectors — clickable mini sub-cards (label over reference time). Wraps to a grid.
        html += '<div class="tc-ctrl-section">'
            +   '<div class="tc-ctrl-label">Sectors</div>'
            +   '<div class="tc-sector-grid">';
        segments.forEach(function (seg) {
            var sectorKey = 's' + seg.sector + 'Ms';
            var refMs = refLap ? refLap[sectorKey] : 0;
            var segmentMs = seg.parts > 1 ? (refMs / seg.parts) : refMs;
            var fullLabel = 'S' + seg.sector + (seg.parts > 1 ? ('.' + seg.part) : '');
            var isActive = compareState.zoomStart === seg.start && compareState.zoomEnd === seg.end;
            html += '<button class="tc-sector-card ' + (isActive ? 'is-active' : '') + '" data-start="' + seg.start + '" data-end="' + seg.end + '" title="Zoom charts to ' + fullLabel + '">'
                + '<span class="tc-sector-card-label">' + fullLabel + '</span>'
                + '<span class="tc-sector-card-time">' + window.HistoryDetail.formatSectorTime(segmentMs) + '</span>'
                + '</button>';
        });
        html += '</div></div>';

        // Channel presets — one-click channel sets instead of 11 individual toggles.
        var activePreset = activePresetId(metrics);
        html += '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">View</span>'
            +   '<div class="tc-segmented tc-segmented--full">';
        CHANNEL_PRESETS.forEach(function (p) {
            html += '<button class="tc-seg-btn ' + (activePreset === p.id ? 'active' : '') + '"'
                + ' data-preset="' + p.id + '" title="' + p.title + '">' + p.label + '</button>';
        });
        html += '</div></div>';

        // Channels — visible-metric chips with a "used / total" count.
        html += '<div class="tc-ctrl-section">'
            +   '<div class="tc-ctrl-section-head">'
            +     '<span class="tc-ctrl-label">Channels</span>'
            +     '<span class="tc-ctrl-count">' + visibleCount + '/' + metrics.length + '</span>'
            +   '</div>'
            +   '<div class="tc-channel-list">';
        metrics.forEach(function (m) {
            var pressed = !compareState.hiddenMetrics.has(m.key);
            html += '<button class="tc-channel ' + (pressed ? 'active' : '') + '" data-key="' + m.key + '"'
                + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">'
                + escapeHtml(m.label) + '</button>';
        });
        html += '</div></div>';

        // Read mode (value chips: absolute values vs delta).
        html += '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Read</span>'
            +   '<div class="tc-segmented tc-segmented--full">'
            +     '<button class="tc-seg-btn tc-chip-mode ' + (compareState.chipMode === 'pair' ? 'active' : '') + '" data-chip-mode="pair">Values</button>'
            +     '<button class="tc-seg-btn tc-chip-mode ' + (compareState.chipMode === 'diff' ? 'active' : '') + '" data-chip-mode="diff">Delta</button>'
            +   '</div>'
            + '</div>';

        // Corner markers (ruler strip + per-chart vertical lines + hover tag).
        html += '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Corners</span>'
            +   '<div class="tc-segmented tc-segmented--full">'
            +     '<button class="tc-seg-btn ' + (compareState.cornersEnabled ? 'active' : '') + '" data-corners="1" title="Show corner markers">On</button>'
            +     '<button class="tc-seg-btn ' + (!compareState.cornersEnabled ? 'active' : '') + '" data-corners="0" title="Hide corner markers">Off</button>'
            +   '</div>'
            + '</div>';

        // Row-height preset (S / M / L → heightScale 1.3 / 1.9 / 2.8).
        html += '<div class="tc-ctrl-row">'
            +   '<span class="tc-ctrl-label">Size</span>'
            +   '<div class="tc-segmented tc-segmented--full">';
        [
            { scale: 1.3, label: 'S', title: 'Compact rows' },
            { scale: 1.9, label: 'M', title: 'Normal rows' },
            { scale: 2.8, label: 'L', title: 'Tall rows' },
        ].forEach(function (pair) {
            var active = Math.abs(compareState.heightScale - pair.scale) < 0.01;
            html += '<button class="tc-seg-btn ' + (active ? 'active' : '') + '"'
                + ' data-scale="' + pair.scale + '" title="' + pair.title + '" aria-label="' + pair.title + '">'
                + pair.label + '</button>';
        });
        html += '</div></div>';

        html += '</div>';
        host.innerHTML = html;

        // Single delegated click handler — attached ONCE on first drawBadges call.
        // Critical: the host element (#tcBadges) survives across redraws, only its
        // innerHTML is replaced. If we attached a new listener every call, listeners
        // would accumulate. Worse: each listener triggers a redraw, which would add
        // another listener — 1 → 2 → 4 → 8 → exponential after a handful of clicks,
        // freezing the page. The flag below makes the wiring idempotent. Handler
        // reads `latestCompareLapData` (refreshed by redraw) so the data is always
        // current despite the closure capturing nothing.
        if (!host.__tcBadgesWired) {
            host.__tcBadgesWired = true;
            host.addEventListener('click', function (e) {
                var t = e.target;
                if (!t || !t.closest) return;
                var btn = t.closest('button');
                if (!btn) return;
                var ds = btn.dataset || {};
                var data = latestCompareLapData;
                if (!data) return;

                // Distance-range buttons (sector badges, loss-zone jumps, sector mini-splits).
                if (ds.start != null && ds.end != null) {
                    var start = Number(ds.start), end = Number(ds.end);
                    if (compareState.zoomStart === start && compareState.zoomEnd === end) {
                        compareState.zoomStart = null;
                        compareState.zoomEnd = null;
                    } else {
                        compareState.zoomStart = start;
                        compareState.zoomEnd = end;
                    }
                    redraw(data);
                    return;
                }
                // Zoom toolbar actions.
                if (ds.action === 'reset-zoom') {
                    compareState.zoomStart = null;
                    compareState.zoomEnd = null;
                    redraw(data);
                    return;
                }
                if (ds.action === 'zoom-in-2x') { zoomIn2x(); redraw(data); return; }
                if (ds.action === 'zoom-out-2x') { zoomOut2x(); redraw(data); return; }
                // Mini-segment split (3/9/12).
                if (ds.mini != null) {
                    var next = Number(ds.mini);
                    if (next === compareState.miniPerSector) return;
                    compareState.miniPerSector = next;
                    compareState.zoomStart = null;
                    compareState.zoomEnd = null;
                    enforceMetricLimit();
                    persistState();
                    redraw(data);
                    return;
                }
                // Delta mode (cumulative / sector).
                if (ds.mode != null) {
                    compareState.deltaMode = ds.mode;
                    redraw(data);
                    return;
                }
                // Channel preset.
                if (ds.preset != null) {
                    applyChannelPreset(ds.preset);
                    enforceMetricLimit();
                    persistState();
                    drawBadges(data);
                    drawChartStack(data);
                    return;
                }
                // Channel visibility toggle.
                if (ds.key != null) {
                    var key = ds.key;
                    if (compareState.hiddenMetrics.has(key)) compareState.hiddenMetrics.delete(key);
                    else compareState.hiddenMetrics.add(key);
                    enforceMetricLimit();
                    persistState();
                    drawBadges(data);
                    drawChartStack(data);
                    return;
                }
                // Corner-marker visibility.
                if (ds.corners != null) {
                    var cornersOn = ds.corners === '1';
                    if (cornersOn === compareState.cornersEnabled) return;
                    compareState.cornersEnabled = cornersOn;
                    persistState();
                    drawBadges(data);
                    drawChartStack(data);
                    drawInsights(data);
                    return;
                }
                // Chip display mode (values vs delta).
                if (ds.chipMode != null) {
                    compareState.chipMode = ds.chipMode === 'diff' ? 'diff' : 'pair';
                    persistState();
                    drawBadges(data);
                    return;
                }
                // Row-height preset.
                if (ds.scale != null) {
                    compareState.heightScale = Number(ds.scale);
                    persistState();
                    drawBadges(data);
                    drawChartStack(data);
                    return;
                }
            });
        }
    }

    // Renders the Insights panel (tool usage, attack-tool events, Top Loss Zones) into its
    // own host and refreshes the tab badge count. Detection runs every redraw regardless of
    // which tab is active so the badge stays current even while the user is on Controls.
    function drawInsights(lapData) {
        var host = document.getElementById('tcInsights');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var zones = detectTopLossZones(lapData, sess, 3);
        updateInsightsBadge(zones.length);
        host.innerHTML = renderToolUsageHtml(toolUsageStats(lapData, sess), sess)
            + renderAttackEventsHtml(detectAttackEvents(lapData, sess, 5))
            + renderTopLossZonesHtml(zones);
        wireInsightsHost(host);
    }

    // ---------- tool usage (full-lap DRS / SM / Boost / ERS aggregates per driver) ----------

    /** Per visible lap: metres+activations for each binary tool, deploy/harvest MJ peaks. */
    function toolUsageStats(lapData, sess) {
        var refSel = ensureReferenceSelection(lapData);
        var rows = [];
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (!sel || sel.hidden || sel.lap == null || !lapData || !lapData.has(carIdx)) return;
            var d = lapData.get(carIdx);
            if (!d || !d.samples || !d.samples.length) return;
            var driver = resolveCompareDriver(sess, carIdx, sel);
            var nameRaw = (driver && (driver.shortName || driver.code || driver.name)) || ('Car ' + carIdx);
            function meters(field) {
                var m = 0, n = 0;
                runLengthRuns(d.samples, field, 0, Number.MAX_SAFE_INTEGER).forEach(function (r) {
                    if (r.v !== 1) return;
                    m += (r.to - r.from);
                    n++;
                });
                return { m: m, n: n };
            }
            var depMax = 0, harvMax = 0;
            for (var i = 0; i < d.samples.length; i++) {
                var s = d.samples[i];
                if ((s.ersDepLapJ || 0) > depMax) depMax = s.ersDepLapJ;
                if ((s.harvJ || 0) > harvMax) harvMax = s.harvJ;
            }
            rows.push({
                carIdx: carIdx,
                name: String(nameRaw).toUpperCase().substring(0, 3),
                lap: Number(sel.lap),
                color: laneColorFor(carIdx),
                isRef: refSel != null && carIdx === refSel.carIdx,
                drs: meters('drs'),
                sm: meters('aero'),
                bst: meters('ovt'),
                depMJ: depMax / 1e6,
                harvMJ: harvMax / 1e6,
            });
        });
        rows.sort(function (a, b) { return (b.isRef ? 1 : 0) - (a.isRef ? 1 : 0); });
        return rows;
    }

    function renderToolUsageHtml(rows, sess) {
        if (rows.length < 1) return '';
        var trackLen = (sess && sess.meta && sess.meta.trackLengthM) || 0;
        // Column exists only when some lap carries the signal — a 2025 session shows
        // DRS but no SM/BST column, a 2026 one the reverse, F2 only DEP-less columns.
        var cols = [
            { key: 'drs', head: 'DRS', has: rows.some(function (r) { return r.drs.m > 0; }),
              fmt: function (r) { return r.drs.n + '× ' + Math.round(r.drs.m) + 'm'; } },
            { key: 'sm', head: 'SM', has: rows.some(function (r) { return r.sm.m > 0; }),
              fmt: function (r) { return trackLen > 0 ? Math.round(r.sm.m / trackLen * 100) + '%' : Math.round(r.sm.m) + 'm'; } },
            { key: 'bst', head: 'BST', has: rows.some(function (r) { return r.bst.m > 0; }),
              fmt: function (r) { return r.bst.n + '× ' + Math.round(r.bst.m) + 'm'; } },
            { key: 'dep', head: 'DEP', has: rows.some(function (r) { return r.depMJ > 0; }),
              fmt: function (r) { return r.depMJ.toFixed(2); } },
            { key: 'harv', head: 'HRV', has: rows.some(function (r) { return r.harvMJ > 0; }),
              fmt: function (r) { return r.harvMJ.toFixed(2); } },
        ].filter(function (c) { return c.has; });
        if (!cols.length) return '';

        var html = '<div class="tc-insights tc-tools">'
            + '<div class="tc-insights-title">Tool usage <span class="tc-insights-title-note">full lap · MJ</span></div>'
            + '<table class="tc-tools-table"><thead><tr><th></th>'
            + cols.map(function (c) { return '<th>' + c.head + '</th>'; }).join('')
            + '</tr></thead><tbody>';
        rows.forEach(function (r) {
            html += '<tr>'
                + '<td class="tc-tools-driver">'
                +   '<span class="tc-chip-dot" style="background:' + r.color + '"></span>'
                +   '<span>' + escapeHtml(r.name) + ' L' + r.lap + '</span>'
                +   (r.isRef ? '<span class="tc-tools-ref">REF</span>' : '')
                + '</td>'
                + cols.map(function (c) { return '<td>' + escapeHtml(c.fmt(r)) + '</td>'; }).join('')
                + '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    // ---------- attack-tool events (Boost / DRS runs of the compare lap vs REF) ----------

    /** Each Boost/DRS activation of the first compare lap with the time gained or lost
     *  vs the reference across the run. Sorted by |effect|, top N. */
    function detectAttackEvents(lapData, sess, topN) {
        var refSel = ensureReferenceSelection(lapData);
        if (!refSel) return [];
        var cmpEntry = null;
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (cmpEntry || !sel || sel.hidden || sel.lap == null) return;
            if (carIdx === refSel.carIdx || !lapData.has(carIdx)) return;
            cmpEntry = [carIdx, sel];
        });
        if (!cmpEntry) return [];
        var cmpData = lapData.get(cmpEntry[0]);
        var refData = lapData.get(refSel.carIdx);
        if (!cmpData || !cmpData.samples || !refData || !refData.samples) return [];

        // Gains need the cumulative series even when the user is viewing per-sector
        // delta — a sector reset inside a run would corrupt the subtraction.
        var prevMode = compareState.deltaMode;
        compareState.deltaMode = 'cumulative';
        var series = getDeltaSeriesForRange(cmpEntry[0], refSel.carIdx, cmpData.samples, refData.samples, 0, Number.MAX_SAFE_INTEGER, sess);
        compareState.deltaMode = prevMode;
        if (series.length < 4) return [];

        function deltaAt(dist) {
            var lo = 0, hi = series.length - 1;
            while (lo < hi) {
                var mid = (lo + hi) >> 1;
                if (series[mid].d < dist) lo = mid + 1;
                else hi = mid;
            }
            return series[lo].v;
        }

        var events = [];
        // Runs longer than 40% of the lap are a latched/stuck signal (seen in F1 26 logs
        // where OvertakeActive stays 1 the whole lap) — an "activation" that long carries
        // no per-event insight, so it's dropped rather than reported as a full-lap gain.
        var maxLenM = ((sess && sess.meta && sess.meta.trackLengthM) || 5000) * 0.4;
        [{ field: 'ovt', tool: 'BST' }, { field: 'drs', tool: 'DRS' }].forEach(function (def) {
            runLengthRuns(cmpData.samples, def.field, 0, Number.MAX_SAFE_INTEGER).forEach(function (r) {
                if (r.v !== 1) return;
                var lenM = r.to - r.from;
                if (lenM < 15 || lenM > maxLenM) return; // ignore one-tick blips and stuck signals
                events.push({
                    tool: def.tool,
                    from: r.from,
                    to: r.to,
                    lenM: lenM,
                    gain: deltaAt(r.to) - deltaAt(r.from), // negative = time gained vs REF
                });
            });
        });
        events.sort(function (a, b) { return Math.abs(b.gain) - Math.abs(a.gain); });
        return events.slice(0, topN);
    }

    function renderAttackEventsHtml(events) {
        if (!events.length) return '';
        var html = '<div class="tc-insights tc-attack">'
            + '<div class="tc-insights-title">Attack tools vs REF</div>';
        events.forEach(function (ev) {
            var cornerLbl = compareState.cornersEnabled ? cornerRangeLabel(ev.from, ev.to) : '';
            var where = cornerLbl || (Math.round(ev.from) + '–' + Math.round(ev.to) + ' m');
            var tone = ev.gain < -0.01 ? 'gain' : (ev.gain > 0.01 ? 'loss' : 'neutral');
            var z0 = Math.max(0, ev.from - 60);
            var z1 = ev.to + 60;
            html += '<button class="tc-attack-row" data-start="' + z0 + '" data-end="' + z1
                + '" title="Zoom charts to this activation">'
                + '<span class="tc-attack-tool tc-attack-tool--' + ev.tool.toLowerCase() + '">' + ev.tool + '</span>'
                + '<span class="tc-attack-where">' + escapeHtml(where) + '</span>'
                + '<span class="tc-attack-len">' + Math.round(ev.lenM) + ' m</span>'
                + '<span class="tc-attack-gain tc-attack-gain--' + tone + '">'
                +   escapeHtml((ev.gain >= 0 ? '+' : '−') + Math.abs(ev.gain).toFixed(3) + ' s')
                + '</span>'
                + '</button>';
        });
        html += '</div>';
        return html;
    }

    // Idempotent delegated wiring for the Insights host: hover bridges a loss-zone card to
    // its highlight on the 3D map, and clicking a card's jump button zooms the chart stack
    // (and toggles off if the same range is already active). Mirrors the badge click logic.
    function wireInsightsHost(host) {
        if (host.__tcInsightsWired) return;
        host.__tcInsightsWired = true;
        host.addEventListener('mouseover', function (e) {
            var z = e.target && e.target.closest && e.target.closest('.tc-loss-zone');
            if (!z) return;
            var id = z.dataset.zoneId;
            if (!id) return;
            document.querySelectorAll('.tc-map-loss').forEach(function (g) {
                g.classList.toggle('is-hover', g.dataset.zoneId === id);
            });
        });
        host.addEventListener('mouseout', function (e) {
            var z = e.target && e.target.closest && e.target.closest('.tc-loss-zone');
            if (!z) return;
            if (z.contains(e.relatedTarget)) return;
            document.querySelectorAll('.tc-map-loss.is-hover').forEach(function (g) {
                g.classList.remove('is-hover');
            });
        });
        host.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest && e.target.closest('button[data-start]');
            if (!btn) return;
            var data = latestCompareLapData;
            if (!data) return;
            var start = Number(btn.dataset.start), end = Number(btn.dataset.end);
            if (compareState.zoomStart === start && compareState.zoomEnd === end) {
                compareState.zoomStart = null;
                compareState.zoomEnd = null;
            } else {
                compareState.zoomStart = start;
                compareState.zoomEnd = end;
            }
            redraw(data);
        });
    }

    function renderTopLossZonesHtml(zones) {
        if (!zones.length) return '<div class="tc-insights-empty">Top Loss Zones: not enough comparable data.</div>';
        // Largest loss in the set drives the bar normalisation (zone#1 always full).
        var maxLoss = zones.reduce(function (acc, z) { return Math.max(acc, z.loss); }, 0);
        var html = '<div class="tc-insights"><div class="tc-insights-title">Top Loss Zones</div>';
        zones.forEach(function (z, i) {
            var barPct = maxLoss > 0 ? Math.max(8, Math.round((z.loss / maxLoss) * 100)) : 100;
            var factsHtml = (z.facts || []).map(function (f) {
                var tone = f.tone === 'loss' ? 'loss' : (f.tone === 'gain' ? 'gain' : 'neutral');
                return '<span class="tc-loss-fact tc-loss-fact--' + tone + '">'
                    + '<span class="tc-loss-fact-label">' + escapeHtml(f.label) + '</span>'
                    + '<span class="tc-loss-fact-value">' + escapeHtml(f.value) + '</span>'
                    + '</span>';
            }).join('');
            var recsHtml = (z.recommendations || []).map(function (r) {
                return '<li>' + escapeHtml(r) + '</li>';
            }).join('');
            var cornerLbl = compareState.cornersEnabled ? cornerRangeLabel(z.start, z.end) : '';
            html += '<div class="tc-loss-zone" data-zone-id="z' + i + '">'
                +   '<div class="tc-loss-zone-head">'
                +     '<button class="tc-loss-jump" data-start="' + z.start + '" data-end="' + z.end + '" data-zone-id="z' + i + '" title="Zoom charts to this segment + highlight on map">'
                +       '<span class="tc-loss-num">#' + (i + 1) + '</span>'
                +       (cornerLbl ? '<span class="tc-loss-corner">' + cornerLbl + '</span>' : '')
                +       '<span class="tc-loss-range">' + Math.round(z.start) + '–' + Math.round(z.end) + ' m</span>'
                +     '</button>'
                +     '<span class="tc-loss-amount">+' + z.loss.toFixed(3) + ' s</span>'
                +   '</div>'
                +   '<div class="tc-loss-bar"><div class="tc-loss-bar-fill" style="width:' + barPct + '%"></div></div>'
                +   '<div class="tc-loss-cause tc-loss-cause--' + escapeHtml(z.primary) + '">' + escapeHtml(z.primaryLabel) + '</div>'
                + (factsHtml ? '<div class="tc-loss-facts">' + factsHtml + '</div>' : '')
                + (recsHtml ? '<ul class="tc-loss-recs">' + recsHtml + '</ul>' : '')
                + '</div>';
        });
        html += '</div>';
        return html;
    }

    // Detect zones where the compare lap loses time vs reference. Pipeline:
    //   1. Smooth the raw delta series with a small moving average (suppresses
    //      per-tick noise that previously created dozens of pseudo-zones).
    //   2. Scan for continuous "losing" regions where smoothed delta increases.
    //   3. Merge zones separated by short stretches of neutral terrain (likely
    //      part of the same corner sequence).
    //   4. Drop zones below a meaningful magnitude (<0.05 s) or length (<30 m).
    //   5. Build a quantified insight per surviving zone and return the top N.
    function detectTopLossZones(lapData, sess, topN) {
        var refSel = ensureReferenceSelection(lapData);
        if (!refSel) return [];
        var entries = Array.from(window.HistoryDetail.state.driverSelection.entries()).filter(function (kv) {
            // Need a *fetched* lap: hidden=false AND lap is picked AND samples loaded.
            return kv[1] && !kv[1].hidden && kv[1].lap != null && lapData.has(kv[0]);
        });
        var cmpEntry = entries.find(function (kv) { return kv[0] !== refSel.carIdx; });
        if (!cmpEntry) return [];
        var cmpData = lapData.get(cmpEntry[0]);
        var refData = lapData.get(refSel.carIdx);
        if (!cmpData || !refData) return [];
        var deltaSeries = getDeltaSeriesForRange(cmpEntry[0], refSel.carIdx, cmpData.samples, refData.samples, 0, Number.MAX_SAFE_INTEGER, sess);
        if (deltaSeries.length < 4) return [];

        // 1. Smooth values for region detection only — we still compute loss
        // magnitude from the raw series so reported numbers stay precise.
        var WIN = 5;
        var smoothed = new Array(deltaSeries.length);
        for (var s = 0; s < deltaSeries.length; s++) {
            var lo = Math.max(0, s - Math.floor(WIN / 2));
            var hi = Math.min(deltaSeries.length - 1, s + Math.floor(WIN / 2));
            var acc = 0, n = 0;
            for (var j = lo; j <= hi; j++) { acc += deltaSeries[j].v; n++; }
            smoothed[s] = n ? acc / n : deltaSeries[s].v;
        }

        // 2. Continuous losing regions on the smoothed series. Threshold is
        // tiny (0.5 ms per sample step) because real losses spread over 50–200 m
        // average only a few ms/m — anything stricter misses gradual zones.
        // Significance filtering by total loss happens after merge.
        var rawZones = [];
        var zStart = null;
        for (var i = 1; i < smoothed.length; i++) {
            var dv = smoothed[i] - smoothed[i - 1];
            if (dv > 0.0005 && zStart == null) zStart = i - 1;
            if ((dv <= 0 || i === smoothed.length - 1) && zStart != null) {
                rawZones.push({ i0: zStart, i1: i });
                zStart = null;
            }
        }
        if (!rawZones.length) return [];

        // 3. Merge zones separated by <60 m of neutral terrain — corner sequences
        // (e.g. esses, chicanes) produce two close peaks that the user reads as one.
        var merged = [rawZones[0]];
        for (var k = 1; k < rawZones.length; k++) {
            var prev = merged[merged.length - 1];
            var gap = deltaSeries[rawZones[k].i0].d - deltaSeries[prev.i1].d;
            if (gap < 60) {
                prev.i1 = rawZones[k].i1;
            } else {
                merged.push(rawZones[k]);
            }
        }

        // 4. Filter by significance — drop micro-zones (<30 ms or <20 m) caused
        // by sensor noise. Anything above that is worth surfacing to the user.
        var significant = merged.filter(function (z) {
            var lossM = Math.max(0, deltaSeries[z.i1].v - deltaSeries[z.i0].v);
            var lengthM = deltaSeries[z.i1].d - deltaSeries[z.i0].d;
            return lossM >= 0.03 && lengthM >= 20;
        });
        if (!significant.length) return [];

        // 5. Build insights, rank by total loss.
        var insights = significant.map(function (z) {
            return buildZoneInsight(z.i0, z.i1, deltaSeries, cmpData.samples, refData.samples);
        });
        insights.sort(function (a, b) { return b.loss - a.loss; });
        return insights.slice(0, topN);
    }

    function getDeltaSeriesForRange(carIdx, refCarIdx, driverSamples, refSamples, xMin, xMax, sess) {
        var key = deltaCacheKey(carIdx, refCarIdx, xMin, xMax, compareState.deltaMode, compareState.miniPerSector);
        if (compareState.deltaSeriesCache.has(key)) return compareState.deltaSeriesCache.get(key);
        var interpCtx = createInterpContext();
        var computed = computeDeltaSeries(driverSamples, refSamples, sess, interpCtx)
            .filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
        compareState.deltaSeriesCache.set(key, computed);
        return computed;
    }

    // Cause labels (used by both the classifier output and the UI). Keep the key
    // stable — the UI maps it to a CSS class for coloured badges.
    var CAUSE_LABELS = {
        late_brake:   'Поздний тормоз',
        soft_brake:   'Слабое торможение',
        low_apex:     'Низкая скорость в апексе',
        late_throttle:'Поздний газ',
        poor_exit:    'Слабый выход',
        choppy_thr:   'Рваный газ',
        wide_line:    'Широкая траектория',
        mixed:        'Смешанная зона',
    };

    function buildZoneInsight(i0, i1, deltaSeries, cmpSamples, refSamples) {
        var start = deltaSeries[i0].d, end = deltaSeries[i1].d;
        var loss = Math.max(0, deltaSeries[i1].v - deltaSeries[i0].v);
        // Extend the braking search upstream — drivers often start braking ~50 m
        // *before* they actually lose time, so the zone's i0 misses the brake point.
        var brakeWindowStart = Math.max(0, start - 80);
        // Extend the throttle search downstream so we capture the resume point even
        // when the compare driver opens the throttle a bit after the loss settles.
        var throttleWindowEnd = end + 60;

        var refBrk = windowStats(refSamples, start, end, 'brk');
        var cmpBrk = windowStats(cmpSamples, start, end, 'brk');
        var refThr = windowStats(refSamples, start, end, 'thr');
        var cmpThr = windowStats(cmpSamples, start, end, 'thr');
        var refSpd = windowStats(refSamples, start, end, 'spd');
        var cmpSpd = windowStats(cmpSamples, start, end, 'spd');

        var refBrakeStart = findCrossingUp(refSamples, brakeWindowStart, end, 'brk', 15);
        var cmpBrakeStart = findCrossingUp(cmpSamples, brakeWindowStart, end, 'brk', 15);
        var refThrottleResume = findCrossingUp(refSamples, start, throttleWindowEnd, 'thr', 40);
        var cmpThrottleResume = findCrossingUp(cmpSamples, start, throttleWindowEnd, 'thr', 40);

        var refPeakBrk = peakInWindow(refSamples, brakeWindowStart, end, 'brk');
        var cmpPeakBrk = peakInWindow(cmpSamples, brakeWindowStart, end, 'brk');

        // Exit speed: average over the last 60 m of the zone (single point at end
        // is too noisy; a short trailing window smooths it).
        var exitStart = Math.max(start, end - 60);
        var refExitSpd = windowStats(refSamples, exitStart, end, 'spd').avg;
        var cmpExitSpd = windowStats(cmpSamples, exitStart, end, 'spd').avg;

        // Build a list of candidate facts with a "score" — bigger score = bigger
        // contribution to the lost time. The biggest one becomes the primary cause;
        // the next two are surfaced as supporting facts.
        var candidates = [];

        if (refBrakeStart != null && cmpBrakeStart != null) {
            var brakeLate = cmpBrakeStart - refBrakeStart;        // metres
            if (Math.abs(brakeLate) >= 10) {
                candidates.push({
                    cause: brakeLate > 0 ? 'late_brake' : 'early_brake',
                    score: Math.abs(brakeLate) * 0.4 + (brakeLate > 0 ? 4 : 0),
                    fact: { label: 'Brake pt', value: (brakeLate > 0 ? '+' : '') + Math.round(brakeLate) + 'm', tone: brakeLate > 0 ? 'loss' : 'neutral' },
                    rec: brakeLate > 0
                        ? 'Начинайте торможение на ~' + Math.round(brakeLate) + ' м раньше (эталон жмёт педаль на ~' + Math.round(refBrakeStart) + ' м).'
                        : 'Можно тормозить позже — вы давите педаль на ' + Math.round(-brakeLate) + ' м раньше эталона, это съедает скорость до точки.',
                });
            }
        }

        var brakeForceGap = refPeakBrk - cmpPeakBrk;              // %
        if (brakeForceGap >= 8 && refPeakBrk >= 40) {
            candidates.push({
                cause: 'soft_brake',
                score: brakeForceGap * 0.3,
                fact: { label: 'Brake max', value: '−' + Math.round(brakeForceGap) + '%', tone: 'loss' },
                rec: 'Тормозите интенсивнее: эталон выжимает педаль до ' + Math.round(refPeakBrk) + '%, вы — только до ' + Math.round(cmpPeakBrk) + '%.',
            });
        }

        var apexGap = refSpd.min - cmpSpd.min;                    // km/h, positive = cmp slower at apex
        if (apexGap >= 3) {
            candidates.push({
                cause: 'low_apex',
                score: apexGap * 1.2,
                fact: { label: 'Min spd', value: '−' + Math.round(apexGap) + ' km/h', tone: 'loss' },
                rec: 'Скорость в апексе ниже на ' + Math.round(apexGap) + ' км/ч — пробуйте отпускать тормоз раньше и катить через поворот, а не дотормаживать в апексе.',
            });
        }

        if (refThrottleResume != null && cmpThrottleResume != null) {
            var throttleLate = cmpThrottleResume - refThrottleResume;
            if (throttleLate >= 10) {
                candidates.push({
                    cause: 'late_throttle',
                    score: throttleLate * 0.35,
                    fact: { label: 'Thr resume', value: '+' + Math.round(throttleLate) + 'm', tone: 'loss' },
                    rec: 'Газ восстанавливается позже на ~' + Math.round(throttleLate) + ' м (вы на ' + Math.round(cmpThrottleResume) + ' м, эталон на ' + Math.round(refThrottleResume) + ' м). Раньше раскручивайте двигатель на выходе.',
                });
            }
        }

        var exitGap = refExitSpd - cmpExitSpd;                    // km/h
        if (exitGap >= 3) {
            candidates.push({
                cause: 'poor_exit',
                score: exitGap * 1.0,
                fact: { label: 'Exit spd', value: '−' + Math.round(exitGap) + ' km/h', tone: 'loss' },
                rec: 'Выход медленнее на ' + Math.round(exitGap) + ' км/ч — раньше раскрывайте руль и прогрессивно добавляйте газ.',
            });
        }

        if (cmpThr.variance > 220 && cmpThr.variance > refThr.variance + 60) {
            candidates.push({
                cause: 'choppy_thr',
                score: Math.min(15, (cmpThr.variance - refThr.variance) / 30),
                fact: { label: 'Thr mod', value: 'дёрганый', tone: 'loss' },
                rec: 'Газ модулируется неровно — стабилизируйте усилие, избегайте резких сбросов.',
            });
        }

        candidates.sort(function (a, b) { return b.score - a.score; });

        var primary = candidates.length ? candidates[0].cause : 'mixed';
        // Normalise early_brake into late_brake-class for label purposes (its
        // recommendation already says "you brake too early").
        var primaryKey = primary === 'early_brake' ? 'late_brake' : primary;
        var primaryLabel = CAUSE_LABELS[primaryKey] || CAUSE_LABELS.mixed;

        // Surface up to 4 facts and up to 3 recommendations.
        var facts = candidates.slice(0, 4).map(function (c) { return c.fact; });
        var recommendations = candidates.slice(0, 3).map(function (c) { return c.rec; });
        if (!recommendations.length) {
            recommendations.push('Смешанные потери — изучите чарты в этом отрезке вручную.');
        }

        return {
            start: start,
            end: end,
            loss: loss,
            primary: primaryKey,
            primaryLabel: primaryLabel,
            facts: facts,
            recommendations: recommendations,
        };
    }

    // First lapDistance in [start..end] where the metric crosses `threshold` from below.
    // Used to locate the braking-start or throttle-resume point inside a loss zone.
    // Returns null if no crossing was found (i.e. driver never reached the threshold).
    function findCrossingUp(samples, start, end, key, threshold) {
        var prev = -Infinity;
        for (var i = 0; i < samples.length; i++) {
            var s = samples[i];
            if (s.d < start) { prev = Number(s[key] || 0); continue; }
            if (s.d > end) return null;
            var v = Number(s[key] || 0);
            if (prev < threshold && v >= threshold) return s.d;
            prev = v;
        }
        return null;
    }

    // Peak value of `key` over [start..end] (returns 0 if window empty). Used for
    // peak brake / peak speed comparisons inside the loss-zone classifier.
    function peakInWindow(samples, start, end, key) {
        var max = -Infinity;
        for (var i = 0; i < samples.length; i++) {
            var s = samples[i];
            if (s.d < start) continue;
            if (s.d > end) break;
            var v = Number(s[key] || 0);
            if (v > max) max = v;
        }
        return max === -Infinity ? 0 : max;
    }

    // Walk the samples once, collect avg / min / variance for the requested distance
    // window. Replaces three near-identical filter+map+reduce passes that previously
    // scanned the full samples array per call (and per metric).
    function windowStats(samples, start, end, key) {
        var sum = 0, count = 0, min = Infinity, sumSq = 0;
        for (var i = 0; i < samples.length; i++) {
            var s = samples[i];
            if (s.d < start || s.d > end) continue;
            var v = Number(s[key] || 0);
            sum += v;
            sumSq += v * v;
            if (v < min) min = v;
            count++;
        }
        if (!count) return { avg: 0, min: 0, variance: 0, count: 0 };
        var avg = sum / count;
        // var = E[X²] − E[X]² is one-pass; matches the previous two-pass formula
        // (mean-deviation squared / N) within floating-point precision.
        var variance = count > 1 ? Math.max(0, sumSq / count - avg * avg) : 0;
        return { avg: avg, min: min, variance: variance, count: count };
    }


    function enforceMetricLimit() {
        var metrics = compareState.__metrics || METRICS;
        var maxVisible = (compareState.miniPerSector >= 4 && window.innerWidth <= 720) ? 6 : metrics.length;
        var visible = metrics.filter(function (m) { return !compareState.hiddenMetrics.has(m.key); });
        while (visible.length > maxVisible) {
            var victim = visible.pop();
            compareState.hiddenMetrics.add(victim.key);
        }
    }


    function getMetricPriority(metricKey) {
        return (metricKey === 'spd' || metricKey === 'thr' || metricKey === 'brk' || metricKey === 'str')
            ? 'primary'
            : 'secondary';
    }

    /** Lap compare uses synthetic selection keys; resolve the real car for team colour / labels. */
    function resolveCompareDriver(sess, selectionKey, sel) {
        if (!sess || !sess.drivers) return null;
        var src = sel && sel.sourceCarIdx != null ? Number(sel.sourceCarIdx) : Number(selectionKey);
        if (sess.drivers[src]) return sess.drivers[src];
        if (sess.drivers[selectionKey]) return sess.drivers[selectionKey];
        return null;
    }
    // ---------- chart stack ----------

    function effectiveHeight(m) {
        var scaled = Math.max(18, Math.round(m.height * compareState.heightScale));
        return getMetricPriority(m.key) === 'secondary' ? Math.max(18, Math.round(scaled * 0.75)) : scaled;
    }

    // Sector dividers painted inside the overview rail — major ticks at S2/S3 starts,
    // minor ticks at mini-segment splits. Non-interactive — overview drag/click is preserved.
    function renderOverviewSegments(meta, miniPerSector, trackLen) {
        if (!trackLen || trackLen <= 0) return '';
        var s2 = (meta && meta.sector2StartM) || 0;
        var s3 = (meta && meta.sector3StartM) || 0;
        var html = '';
        [s2, s3].forEach(function (x) {
            if (x > 0 && x < trackLen) {
                html += '<div class="tc-overview-tick tc-overview-tick--major"'
                    + ' style="left:' + ((x / trackLen) * 100).toFixed(3) + '%"'
                    + ' aria-hidden="true"></div>';
            }
        });
        if (Number(miniPerSector) > 1) {
            buildSegmentBoundaries(meta, miniPerSector).forEach(function (seg) {
                if (seg.part === 1) return; // first slice has no leading divider
                html += '<div class="tc-overview-tick tc-overview-tick--minor"'
                    + ' style="left:' + ((seg.start / trackLen) * 100).toFixed(3) + '%"'
                    + ' aria-hidden="true"></div>';
            });
        }
        // S1/S2/S3 labels centred over each sector.
        var bands = [
            { sector: 1, start: 0,  end: s2 || trackLen },
            { sector: 2, start: s2, end: s3 || trackLen },
            { sector: 3, start: s3, end: trackLen },
        ];
        bands.forEach(function (b) {
            if (b.end <= b.start) return;
            var midPct = ((b.start + (b.end - b.start) / 2) / trackLen) * 100;
            html += '<div class="tc-overview-label"'
                + ' style="left:' + midPct.toFixed(3) + '%"'
                + ' aria-hidden="true">S' + b.sector + '</div>';
        });
        return html;
    }

    function drawChartStack(lapData) {
        stopChartCamLoop();
        var host = document.getElementById('tcCharts');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var trackLen = sess.meta.trackLengthM || 5000;

        var xMin = compareState.zoomStart != null ? compareState.zoomStart : 0;
        var xMax = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;

        // Reference = first selected driver's samples — used for Delta.
        var resolvedRef = ensureReferenceSelection(lapData);
        var refIdx = resolvedRef ? resolvedRef.carIdx : null;
        var refSamples = refIdx != null ? lapData.get(refIdx).samples : null;

        enforceMetricLimit();
        var visibleMetrics = (compareState.__metrics || METRICS).filter(function (m) { return !compareState.hiddenMetrics.has(m.key); });

        var html = '';
        html += '<div class="tc-overview-sticky">'
             +   '<div class="tc-overview" id="tcOverview" title="Drag window to pan · click empty track to center">'
             +     renderOverviewSegments(sess.meta, compareState.miniPerSector, trackLen)
             +     '<div class="tc-overview-window" id="tcOverviewWin" title="Drag to move zoom window"></div>'
             +   '</div>'
             +   '<div class="tc-corner-ruler" id="tcCornerRuler" hidden></div>'
             + '</div>';
        visibleMetrics.forEach(function (m) {
            var h = effectiveHeight(m);
            var priority = getMetricPriority(m.key);
            html += '<div class="tc-chart-row" data-priority="' + priority + '" data-metric="' + m.key + '" style="--tc-row-h:' + h + 'px">'
                + '<div class="tc-chart-label tc-chart-label--rail" role="presentation"></div>'
                + '<div class="tc-chart-svg-host"></div>'
                + '</div>';
        });
        // Hover overlay spans the entire stack. Value chips live here (not inside the
        // per-row SVG hosts) so a chip taller than its row is never clipped by the
        // row's overflow:hidden — it just spills over the neighbouring rows.
        html += '<div class="tc-hover-layer" id="tcHoverLayer">'
             + '<div class="tc-crosshair" id="tcCrosshair"></div>'
             + '<div class="tc-corner-tag" id="tcCornerTag" hidden></div>'
             + '<div class="tc-brush" id="tcBrush"></div>'
             + visibleMetrics.map(function (m) {
                    return '<div class="tc-row-chip" data-metric="' + m.key + '" hidden></div>';
               }).join('')
             + '</div>';
        html += '<div class="tc-xaxis" id="tcXAxis" aria-hidden="true"></div>';
        html += '<div class="tc-interact-hint" aria-hidden="true">Wheel zoom · Shift+drag pan · drag select zoom · dbl-click reset · Esc reset · [← →] pan · [+ −] zoom</div>';
        host.innerHTML = html;

        var selections = Array.from(window.HistoryDetail.state.driverSelection.entries()).filter(function (kv) {
            return kv[1] && !kv[1].hidden;
        });

        visibleMetrics.forEach(function (m) {
            var row = host.querySelector('.tc-chart-row[data-metric="' + m.key + '"] .tc-chart-svg-host');
            row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, refIdx, xMin, xMax, sess, effectiveHeight(m));
        });

        updateCornerRuler(host, xMin, xMax);
        updateXAxis(host, xMin, xMax);
        wireHover(host, lapData, selections, refSamples, refIdx, xMin, xMax, sess);
        bindCompareShortcuts();

        function updateChartStackView(nextXMin, nextXMax) {
            if (!host) return;
            visibleMetrics.forEach(function (m) {
                var row = host.querySelector('.tc-chart-row[data-metric="' + m.key + '"] .tc-chart-svg-host');
                if (!row) return;
                row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, refIdx, nextXMin, nextXMax, sess, effectiveHeight(m));
            });
            var overviewWin = host.querySelector('#tcOverviewWin');
            if (overviewWin) {
                var l = Math.max(0, Math.min(100, (nextXMin / trackLen) * 100));
                var w = Math.max(2, Math.min(100, ((nextXMax - nextXMin) / trackLen) * 100));
                overviewWin.style.left = l + '%';
                overviewWin.style.width = w + '%';
            }
            updateCornerRuler(host, nextXMin, nextXMax);
            updateXAxis(host, nextXMin, nextXMax);
            // Keep the bridge-driven crosshair anchored to the actual hovered distance
            // as the chart auto-pans. Without this, the crosshair pins to an edge on
            // first map-hover and only "snaps" into place on the next mousemove — the
            // user holding the cursor still during a 150 ms auto-pan saw a stale line.
            if (compareState.__lastBridgeD != null) {
                var crosshairEl = host.querySelector('#tcCrosshair');
                if (crosshairEl) {
                    var bSpan = Math.max(1, nextXMax - nextXMin);
                    var bPct = Math.max(0, Math.min(1, (compareState.__lastBridgeD - nextXMin) / bSpan));
                    crosshairEl.style.left = (bPct * 100) + '%';
                    positionCornerTag(host, compareState.__lastBridgeD, bPct);
                }
            }
        }
        compareState.__updateChartStackView = updateChartStackView;
    }

    function bindCompareShortcuts() {
        if (shortcutsBound) return;
        shortcutsBound = true;
        document.addEventListener('keydown', function (e) {
            if (e.target && (/input|textarea|select/i).test(e.target.tagName || '')) return;
            if (!latestCompareLapData) return;
            // Only fire when the Compare tab is actually visible AND focus is inside it
            // (or on body — the common "no focused element" case). Otherwise a stray
            // R/Esc somewhere else on the page would silently reset chart zoom.
            var host = document.getElementById('tcCharts');
            if (!host || host.offsetParent === null) return;
            var layout = host.closest('.tc-layout') || host;
            var ae = document.activeElement;
            if (ae && ae !== document.body && !layout.contains(ae)) return;
            var key = e.key || '';
            var kl = key.toLowerCase();
            if (kl === 'escape') {
                compareState.zoomStart = null;
                compareState.zoomEnd = null;
                compareState.brush = null;
                redraw(latestCompareLapData);
                return;
            }
            if (kl === 'r' && !e.ctrlKey && !e.metaKey) {
                compareState.zoomStart = null;
                compareState.zoomEnd = null;
                redraw(latestCompareLapData);
                return;
            }
            var sess = window.HistoryDetail && window.HistoryDetail.state && window.HistoryDetail.state.session;
            var trackLen = (sess && sess.meta && sess.meta.trackLengthM) || 5000;
            var z0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
            var z1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;
            var span = Math.max(1, z1 - z0);
            var step = span * 0.1;
            if (key === 'ArrowLeft') {
                e.preventDefault();
                compareState.zoomStart = Math.max(0, z0 - step);
                compareState.zoomEnd = Math.min(trackLen, z1 - step);
                if (compareState.zoomEnd - compareState.zoomStart < span - 1e-6) {
                    compareState.zoomEnd = compareState.zoomStart + span;
                    compareState.zoomEnd = Math.min(trackLen, compareState.zoomEnd);
                    compareState.zoomStart = Math.max(0, compareState.zoomEnd - span);
                }
                redraw(latestCompareLapData);
                return;
            }
            if (key === 'ArrowRight') {
                e.preventDefault();
                compareState.zoomStart = Math.min(trackLen - span, z0 + step);
                compareState.zoomEnd = Math.min(trackLen, z1 + step);
                redraw(latestCompareLapData);
                return;
            }
            if (key === '+' || key === '=') {
                e.preventDefault();
                zoomFromCenter(latestCompareLapData, trackLen, z0, z1, 0.85);
                return;
            }
            if (key === '-' || key === '_') {
                e.preventDefault();
                zoomFromCenter(latestCompareLapData, trackLen, z0, z1, 1.15);
                return;
            }
        });
    }

    /** Zoom around center of current window; factor &lt; 1 zooms in. */
    function zoomFromCenter(lapData, trackLen, z0, z1, factor) {
        var span = Math.max(1, z1 - z0);
        var center = z0 + span / 2;
        var newSpan = Math.min(trackLen, Math.max(trackLen * 0.002, span * factor));
        compareState.zoomStart = Math.max(0, center - newSpan / 2);
        compareState.zoomEnd = Math.min(trackLen, compareState.zoomStart + newSpan);
        compareState.zoomStart = Math.max(0, compareState.zoomEnd - newSpan);
        if (compareState.zoomStart <= 0 && compareState.zoomEnd >= trackLen - 1e-6) {
            compareState.zoomStart = null;
            compareState.zoomEnd = null;
        }
        redraw(lapData);
    }

    function zoomOut2x() {
        var sess = window.HistoryDetail.state.session;
        var trackLen = sess.meta.trackLengthM || 5000;
        var min = compareState.zoomStart != null ? compareState.zoomStart : 0;
        var max = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;
        var span = Math.max(1, max - min);
        var center = min + span / 2;
        var nextSpan = Math.min(trackLen, span * 2);
        compareState.zoomStart = Math.max(0, center - nextSpan / 2);
        compareState.zoomEnd = Math.min(trackLen, center + nextSpan / 2);
        if (compareState.zoomStart <= 0 && compareState.zoomEnd >= trackLen) {
            compareState.zoomStart = null;
            compareState.zoomEnd = null;
        }
    }

    function zoomIn2x() {
        var sess = window.HistoryDetail.state.session;
        var trackLen = sess.meta.trackLengthM || 5000;
        var min = compareState.zoomStart != null ? compareState.zoomStart : 0;
        var max = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;
        var span = Math.max(1, max - min);
        // Don't zoom in tighter than ~50m of track — keeps the chart readable.
        var minSpan = Math.min(50, trackLen);
        if (span <= minSpan + 1e-6) return;
        var center = min + span / 2;
        var nextSpan = Math.max(minSpan, span / 2);
        compareState.zoomStart = Math.max(0, center - nextSpan / 2);
        compareState.zoomEnd = Math.min(trackLen, center + nextSpan / 2);
    }

    // Walks samples and returns contiguous runs where `field` has a constant value.
    // Each run is { from, to, v } in lapDistance metres.
    function runLengthRuns(samples, field, xMin, xMax) {
        var runs = [];
        if (!samples || samples.length === 0) return runs;
        var curV = samples[0][field] || 0;
        var curFrom = samples[0].d;
        for (var i = 1; i < samples.length; i++) {
            var v = samples[i][field] || 0;
            if (v !== curV) {
                runs.push({ from: curFrom, to: samples[i].d, v: curV });
                curV = v;
                curFrom = samples[i].d;
            }
        }
        runs.push({ from: curFrom, to: samples[samples.length - 1].d, v: curV });
        return runs.filter(function (r) { return r.to >= xMin && r.from <= xMax; });
    }

    /** Horizontal grid levels + label strings for Y-axis ticks inside the plot area. */
    function getHorizontalGridSpec(metric, plotVMin, plotVMax) {
        var key = metric.key;
        if (key === 'delta') {
            var n = 5;
            var out = [];
            for (var i = 0; i < n; i++) {
                var t = i / (n - 1);
                var v = plotVMin + t * (plotVMax - plotVMin);
                out.push({ v: v, label: (v >= 0 ? '+' : '') + v.toFixed(3) });
            }
            return out;
        }
        if (key === 'spd') {
            return [
                { v: 0, label: '0' },
                { v: 100, label: '100' },
                { v: 200, label: '200' },
                { v: 300, label: '300' },
                { v: 370, label: '370' },
            ];
        }
        if (key === 'thr' || key === 'brk' || key === 'ers') {
            return [
                { v: 0, label: '0%' },
                { v: 50, label: '50%' },
                { v: 100, label: '100%' },
            ];
        }
        if (key === 'str') {
            return [
                { v: -100, label: '−100' },
                { v: -50, label: '−50' },
                { v: 0, label: '0' },
                { v: 50, label: '+50' },
                { v: 100, label: '+100' },
            ];
        }
        if (key === 'gr') {
            var out = [];
            for (var g = -1; g <= 8; g++) {
                out.push({ v: g, label: g < 0 ? 'R' : (g === 0 ? 'N' : String(g)) });
            }
            return out;
        }
        if (key === 'rpm') {
            return [
                { v: 0, label: '0' },
                { v: 7000, label: '7k' },
                { v: 14000, label: '14k' },
            ];
        }
        if (key === 'dep') {
            return [
                { v: plotVMin, label: plotVMin.toFixed(1) },
                { v: (plotVMin + plotVMax) / 2, label: ((plotVMin + plotVMax) / 2).toFixed(1) },
                { v: plotVMax, label: plotVMax.toFixed(1) + ' MJ' },
            ];
        }
        if (metric.style === 'band') {
            return [
                { v: 0, label: '0' },
                { v: 0.5, label: '·' },
                { v: 1, label: '1' },
            ];
        }
        var n = 3;
        var out = [];
        var span = Math.max(0.0001, plotVMax - plotVMin);
        for (var i = 0; i < n; i++) {
            var t = i / (n - 1);
            var v = plotVMin + t * span;
            out.push({ v: v, label: (Math.abs(v) < 1e-6 ? '0' : (v < 1 ? v.toFixed(1) : String(Math.round(v)))) });
        }
        return out;
    }

    function computePlotValueRange(metric, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess) {
        // ERS Deploy is cumulative and regulation-dependent (≈4 MJ in 2025, up to 6 MJ
        // in 2026) — scale the axis to the visible data instead of a fixed cap.
        if (metric.key === 'dep') {
            var maxV = 0.5;
            selections.forEach(function (kv) {
                var d = lapData && lapData.get(kv[0]);
                if (!d || !d.samples) return;
                for (var i = 0; i < d.samples.length; i++) {
                    var s = d.samples[i];
                    if (s.d < xMin || s.d > xMax) continue;
                    var v = metricValue(metric, s);
                    if (v > maxV) maxV = v;
                }
            });
            return { min: 0, max: Math.min(10, maxV * 1.05) };
        }
        if (metric.key !== 'delta') {
            return { min: metric.min, max: metric.max };
        }
        var maxAbs = 0.05;
        if (!refSamples) {
            return { min: -1, max: 1 };
        }
        selections.forEach(function (kv) {
            var carIdx = kv[0];
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.samples || carIdx === refCarIdx) return;
            var values = getDeltaSeriesForRange(carIdx, refCarIdx, d.samples, refSamples, xMin, xMax, sess);
            values.forEach(function (pt) {
                maxAbs = Math.max(maxAbs, Math.abs(pt.v));
            });
        });
        // Floor at ±0.05s so a near-perfectly matched pair still shows a non-trivial
        // axis. Ceiling at ±10s accommodates legitimate "clean vs ruined lap" deltas
        // while protecting against runaway spikes from corrupt interpolation. The
        // 1.08 multiplier adds 8% headroom so the extreme sample doesn't kiss the edge.
        maxAbs = Math.min(10, Math.max(0.05, maxAbs * 1.08));
        return { min: -maxAbs, max: maxAbs };
    }

    function buildHorizontalGridAndYLabels(metric, plotVMin, plotVMax, PAD_T, plotH, W) {
        var ticks = getHorizontalGridSpec(metric, plotVMin, plotVMax).filter(function (t) {
            return t.v >= plotVMin - 1e-9 && t.v <= plotVMax + 1e-9;
        });
        var grid = '';
        var yLabels = '';
        ticks.forEach(function (t) {
            var yn = PAD_T + plotH - (t.v - plotVMin) / Math.max(0.0001, plotVMax - plotVMin) * plotH;
            if (yn < PAD_T - 0.5 || yn > PAD_T + plotH + 0.5) return;
            grid += '<line class="tc-grid-h" x1="0" x2="' + W + '" y1="' + yn + '" y2="' + yn + '"/>';
            // HTML overlay so the tick label doesn't stretch with the preserveAspectRatio="none"
            // SVG. Vertical scale is 1:1 (viewBox H == row pixel height), so top = yn px aligns.
            var ty = 'translateY(-50%)';
            if (yn <= PAD_T + 11) ty = 'translateY(0)';
            else if (yn >= PAD_T + plotH - 3) ty = 'translateY(-100%)';
            yLabels += '<div class="tc-axis-tick" style="top:' + yn + 'px;transform:' + ty + '">'
                + escapeHtml(t.label) + '</div>';
        });
        return { grid: grid, yLabels: yLabels };
    }

    // Drop intermediate points so each polyline has at most `maxPoints` vertices.
    // F1 lap samples can hit ~3000+ points; rendering more than ~2 verts per CSS pixel
    // is invisible (Bresenham collapse) but still costs string building + SVG parsing
    // + paint. Preserves first/last for endpoint continuity and uses uniform stepping
    // which is fine here — sample spacing is already smooth in distance domain.
    function subsamplePolyline(values, maxPoints) {
        if (!values || values.length <= maxPoints) return values;
        var step = values.length / maxPoints;
        var out = new Array(maxPoints);
        for (var i = 0; i < maxPoints; i++) out[i] = values[Math.min(values.length - 1, Math.floor(i * step))];
        // Pin the actual last sample so the line lands on the right edge cleanly.
        out[out.length - 1] = values[values.length - 1];
        return out;
    }

    function renderChartSvg(metric, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess, H) {
        var W = 900;
        var PAD_T = 4, PAD_B = 16;
        var plotH = H - PAD_T - PAD_B;
        function x(d) { return (d - xMin) / Math.max(1, xMax - xMin) * W; }

        var plotRange = computePlotValueRange(metric, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess);
        var vMinPlot = plotRange.min;
        var vMaxPlot = plotRange.max;

        var gridPack = buildHorizontalGridAndYLabels(metric, vMinPlot, vMaxPlot, PAD_T, plotH, W);
        // Vertical distance gridlines at the same ticks as the bottom axis, so every
        // row lines up with the axis labels without the eye having to interpolate.
        var vGrid = '';
        xAxisTicks(xMin, xMax).forEach(function (gd) {
            var gx = x(gd);
            if (gx <= 1 || gx >= W - 1) return;
            vGrid += '<line class="tc-grid-v" x1="' + gx + '" x2="' + gx + '" y1="' + PAD_T + '" y2="' + (PAD_T + plotH) + '"/>';
        });
        var titleStr = escapeHtml(metric.plotTitle || metric.label);
        // HTML overlay (not SVG text): the chart SVG uses preserveAspectRatio="none" so its
        // lines fill the width — SVG text would stretch horizontally with it on wide screens.
        var insetTitle = '<div class="tc-plot-title">' + titleStr + '</div>';

        // ---- Binary band rows (DRS / Active Aero SM / Boost): one horizontal track per
        // visible driver, filled where the signal ===1. Splitting per driver in their team
        // colour makes it obvious who used the tool and who didn't — the previous
        // single-band-from-ref version hid every compare lap's state. Ref track always
        // renders first (top), then compares in selection order. The sample field name
        // matches metric.key (drs / aero / ovt).
        if (metric.style === 'band') {
            var bandSvg = '';
            var drsLabelsHtml = '';
            var tracks = [];
            selections.forEach(function (kv) {
                var carIdx = kv[0];
                var d = lapData && lapData.get(carIdx);
                if (!d || !d.samples) return;
                var driver = resolveCompareDriver(sess, carIdx, kv[1]);
                var color = laneColorFor(carIdx);
                var labelRaw = (driver && (driver.shortName || driver.code || driver.name)) || ('Car ' + carIdx);
                var label = String(labelRaw).toUpperCase().substring(0, 3);
                tracks.push({ samples: d.samples, color: color, label: label, isRef: carIdx === refCarIdx });
            });
            // Reference first so it lands at the top of the row.
            tracks.sort(function (a, b) { return (b.isRef ? 1 : 0) - (a.isRef ? 1 : 0); });
            var trackH = tracks.length ? plotH / tracks.length : plotH;
            var trackGap = tracks.length > 1 ? Math.min(2, trackH * 0.1) : 0;
            tracks.forEach(function (track, idx) {
                var ty = PAD_T + trackH * idx + trackGap / 2;
                var th = Math.max(2, trackH - trackGap);
                // DRS row: dim underlay where DRS was *available* (detection passed) so a
                // late open or an unused zone reads as "underlay without fill" at a glance.
                if (metric.key === 'drs') {
                    runLengthRuns(track.samples, 'drsAllowed', xMin, xMax).forEach(function (r) {
                        if (r.v !== 1) return;
                        var ax0 = Math.max(0, x(Math.max(r.from, xMin)));
                        var ax1 = Math.min(W, x(Math.min(r.to, xMax)));
                        if (ax1 <= ax0) return;
                        bandSvg += '<rect class="tc-drs-allowed" x="' + ax0 + '" y="' + ty
                            + '" width="' + (ax1 - ax0) + '" height="' + th + '" fill="' + track.color + '"/>';
                    });
                }
                runLengthRuns(track.samples, metric.key, xMin, xMax).forEach(function (r) {
                    if (r.v !== 1) return;
                    var x0 = Math.max(0, x(Math.max(r.from, xMin)));
                    var x1 = Math.min(W, x(Math.min(r.to, xMax)));
                    if (x1 <= x0) return;
                    bandSvg += '<rect class="tc-drs-block" x="' + x0 + '" y="' + ty
                        + '" width="' + (x1 - x0) + '" height="' + th + '" fill="' + track.color + '"/>';
                });
                // Driver-code label hugging the left edge — only when the track has
                // enough vertical room to fit the text legibly.
                if (th >= 10) {
                    drsLabelsHtml += '<div class="tc-drs-track-label" style="top:' + (ty + th / 2) + 'px">'
                        + escapeHtml(track.label) + '</div>';
                }
            });
            return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
                + gridPack.grid + vGrid + bandSvg + '</svg>' + drsLabelsHtml + gridPack.yLabels + insetTitle;
        }

        // ---- ERS row: per-driver deploy-mode lanes at the top of the plot, polyline on
        // top. One thin lane per visible driver (reference first), coloured by ERS mode
        // run — the old version painted the reference's mode across the whole plot and
        // hid every compare lap's strategy. A 2.5px notch in the driver's team colour
        // keys each lane; floating MED/HOT/OT tags stay reference-only.
        var ersBg = '';
        var ersLabelsHtml = '';
        if (metric.key === 'ers') {
            var ersLanes = [];
            selections.forEach(function (kv) {
                var dd = lapData && lapData.get(kv[0]);
                if (!dd || !dd.samples) return;
                ersLanes.push({ carIdx: kv[0], samples: dd.samples, isRef: kv[0] === refCarIdx });
            });
            ersLanes.sort(function (a, b) { return (b.isRef ? 1 : 0) - (a.isRef ? 1 : 0); });
            var laneH = 5, laneGap = 1;
            var tagTop = PAD_T + ersLanes.length * (laneH + laneGap) + 2;
            ersLanes.forEach(function (lane, li) {
                var ly = PAD_T + li * (laneH + laneGap);
                runLengthRuns(lane.samples, 'ersMd', xMin, xMax).forEach(function (r) {
                    var x0 = Math.max(0, x(Math.max(r.from, xMin)));
                    var x1 = Math.min(W, x(Math.min(r.to, xMax)));
                    if (x1 <= x0) return;
                    ersBg += '<rect class="tc-ers-lane tc-ers-mode-' + r.v + '" x="' + x0 + '" y="' + ly
                        + '" width="' + (x1 - x0) + '" height="' + laneH + '"/>';
                    if (lane.isRef) {
                        var tag = ersModeTag(r.v, lane.carIdx);
                        if (tag && (x1 - x0) > 30) {
                            ersLabelsHtml += '<div class="tc-ers-mode-tag" style="left:' + ((x1 - 3) / W * 100) + '%;top:' + tagTop + 'px">' + tag + '</div>';
                        }
                    }
                });
                ersBg += '<rect class="tc-ers-lane-key" x="0" y="' + ly + '" width="2.5" height="' + laneH
                    + '" fill="' + laneColorFor(lane.carIdx) + '"/>';
            });
        }


        // Team-aware dash style: among visible drivers from the same team, the
        // first to appear in selection order gets solid, second dashed, third
        // (and beyond) dotted. Lets the user keep the team colour but still tell
        // teammates apart — especially when two drivers from the same outfit
        // run very similar lines.
        var teamDashIdx = new Map();
        var teamSeen = new Map();
        selections.forEach(function (kv) {
            var driver = resolveCompareDriver(sess, kv[0], kv[1]);
            var tid = driver && driver.teamId != null ? String(driver.teamId) : '_';
            var n = teamSeen.get(tid) || 0;
            teamDashIdx.set(kv[0], n);
            teamSeen.set(tid, n + 1);
        });

        // Two visual roles only: the reference lap is the thick anchor line drawn
        // beneath everything; every compare lap gets the same thinner stroke on top.
        // (The old scheme singled out the *first* compare lap with extra weight and
        // a glow — an arbitrary distinction that read as meaningful when it wasn't.)
        var refLine = '';
        var cmpLines = '';
        selections.forEach(function (kv) {
            var carIdx = kv[0];
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.samples) return;
            var color = laneColorFor(carIdx);
            var dIdx = teamDashIdx.get(carIdx) || 0;
            var dashClass = dIdx === 0 ? ' tc-line--solid' : (dIdx === 1 ? ' tc-line--dashed' : ' tc-line--dotted');

            var values;
            if (metric.key === 'delta') {
                if (!refSamples) return;
                values = getDeltaSeriesForRange(carIdx, refCarIdx, d.samples, refSamples, xMin, xMax, sess);
            } else {
                values = d.samples.map(function (s) { return { d: s.d, v: metricValue(metric, s) }; });
            }
            if (metric.key !== 'delta') values = values.filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
            if (values.length === 0) return;
            // Gear is a step signal: inject a corner vertex at each change so shifts render
            // as verticals instead of the diagonal ramps a plain polyline draws.
            if (metric.key === 'gr') {
                var stepped = [];
                for (var si = 0; si < values.length; si++) {
                    if (si > 0 && values[si].v !== values[si - 1].v) {
                        stepped.push({ d: values[si].d, v: values[si - 1].v });
                    }
                    stepped.push(values[si]);
                }
                values = stepped;
            }
            // 2 vertices per CSS pixel is the visual ceiling. W=900 viewBox units → ~1800 cap.
            values = subsamplePolyline(values, 1800);

            var pts = values.map(function (pt) {
                var yv = PAD_T + plotH - (pt.v - vMinPlot) / Math.max(0.0001, vMaxPlot - vMinPlot) * plotH;
                return x(pt.d) + ',' + yv;
            });
            var isRef = carIdx === refCarIdx;
            var roleClass = isRef ? 'tc-line tc-line-ref' : 'tc-line tc-line-cmp';
            var poly = '<polyline class="' + roleClass + dashClass + '" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
            if (isRef) refLine = poly;
            else cmpLines += poly;
        });
        var lines = refLine + cmpLines;

        // Zero baseline when visible in range (speed / inputs / delta / steering).
        var baseY = PAD_T + plotH - (0 - vMinPlot) / Math.max(0.0001, vMaxPlot - vMinPlot) * plotH;
        if (0 >= vMinPlot - 1e-9 && 0 <= vMaxPlot + 1e-9 && baseY >= PAD_T && baseY <= PAD_T + plotH) {
            lines += '<line class="tc-baseline" x1="0" x2="' + W + '" y1="' + baseY + '" y2="' + baseY + '"/>';
        }

        // Corner markers — fainter than sector lines, drawn beneath them.
        var cornerMarkers = '';
        if (compareState.cornersEnabled && compareState.__corners) {
            compareState.__corners.forEach(function (c) {
                if (c.d < xMin || c.d > xMax) return;
                cornerMarkers += '<line class="tc-corner-line" x1="' + x(c.d) + '" x2="' + x(c.d)
                    + '" y1="' + PAD_T + '" y2="' + (PAD_T + plotH) + '"/>';
            });
        }

        // Sector markers.
        var sectorMarkers = '';
        buildSegmentBoundaries(sess.meta, compareState.miniPerSector).forEach(function (seg, i) {
            if (i === 0) return;
            if (seg.start >= xMin && seg.start <= xMax) {
                sectorMarkers += '<line class="tc-sector-line" x1="' + x(seg.start) + '" x2="' + x(seg.start)
                    + '" y1="' + PAD_T + '" y2="' + (PAD_T + plotH) + '"/>';
            }
        });

        return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
            + gridPack.grid + vGrid + ersBg + cornerMarkers + sectorMarkers + lines + '</svg>' + ersLabelsHtml + gridPack.yLabels + insetTitle;
    }

    // Resamples driverSamples onto reference sample distances and returns per-distance Δtime (seconds).
    function computeDeltaSeries(driverSamples, refSamples, sess, interpCtx) {
        var out = [];
        var segmentBoundaries = buildSegmentBoundaries(sess.meta, compareState.miniPerSector)
            .map(function (seg) { return seg.end; });

        for (var i = 0; i < refSamples.length; i++) {
            var ref = refSamples[i];
            var interp = interpAtDistance(driverSamples, ref.d, interpCtx);
            if (interp == null) continue;
            var delta = interp.t - ref.t;

            if (compareState.deltaMode === 'sector') {
                // Subtract the delta at the most recent sector boundary the ref has passed.
                var boundary = 0;
                for (var j = 0; j < segmentBoundaries.length; j++) {
                    if (ref.d >= segmentBoundaries[j]) boundary = segmentBoundaries[j];
                }
                if (boundary > 0) {
                    var interpAtBoundary = interpAtDistance(driverSamples, boundary, interpCtx);
                    var refAtBoundary = interpAtDistance(refSamples, boundary, interpCtx);
                    if (interpAtBoundary && refAtBoundary) {
                        delta -= (interpAtBoundary.t - refAtBoundary.t);
                    }
                }
            }
            out.push({ d: ref.d, v: delta });
        }
        return out;
    }

    // Interp of sample values at the given lapDistance via binary search over sorted samples[i].d.
    function interpAtDistance(samples, targetD, interpCtx) {
        if (interpCtx) interpCtx.interpCount = (interpCtx.interpCount || 0) + 1;
        if (!samples || samples.length === 0) return null;
        if (targetD <= samples[0].d) return samples[0];
        if (targetD >= samples[samples.length - 1].d) return samples[samples.length - 1];
        var lo = 1, hi = samples.length - 1;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (samples[mid].d < targetD) lo = mid + 1;
            else hi = mid;
        }
        var b = samples[lo];
        var a = samples[lo - 1];
        var span = b.d - a.d;
        if (span <= 0) return a;
        var f = (targetD - a.d) / span;
        return {
            t: a.t + (b.t - a.t) * f,
            d: targetD,
            spd: a.spd + (b.spd - a.spd) * f,
            thr: a.thr + (b.thr - a.thr) * f,
            brk: a.brk + (b.brk - a.brk) * f,
            str: a.str + (b.str - a.str) * f,
            gr:  a.gr,
            rpm: a.rpm + (b.rpm - a.rpm) * f,
            ers: (a.ers || 0) + ((b.ers || 0) - (a.ers || 0)) * f,
            ersMd: a.ersMd || 0,
            ersDepLapJ: (a.ersDepLapJ || 0) + ((b.ersDepLapJ || 0) - (a.ersDepLapJ || 0)) * f,
            drs: a.drs || 0,
            drsAllowed: a.drsAllowed || 0,
            aero: a.aero || 0,
            ovt: a.ovt || 0,
        };
    }

    // ---------- track map ----------

    // Lighten (odd index) / darken (even index) a hex colour so successive same-team laps
    // get distinct shades on the 3D map. Returns the input unchanged for non-hex colours.
    var SHADE_STEPS = [0, 0.32, -0.30, 0.55, -0.52, 0.72];
    function shadeColor(hex, idx) {
        var pct = SHADE_STEPS[Math.min(idx, SHADE_STEPS.length - 1)] || 0;
        if (!pct) return hex;
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (!m) {
            var s = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
            if (s) m = [null, s[1] + s[1], s[2] + s[2], s[3] + s[3]];
        }
        if (!m) return hex;
        var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
        var target = pct < 0 ? 0 : 255, p = Math.abs(pct);
        function mix(c) { return Math.round(c + (target - c) * p); }
        function hx(c) { return ('0' + c.toString(16)).slice(-2); }
        return '#' + hx(mix(r)) + hx(mix(g)) + hx(mix(b));
    }

    // Readability guard: liveryColours can be near-black (dark blues/greens) which vanish
    // on the dark chart background. If relative luminance is below the floor, mix the
    // colour toward white just enough to clear it — hue is preserved, identity stays.
    var MIN_LINE_LUMA = 80; // 0..255; ~#505050 grey equivalent
    function ensureReadableColor(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (!m) return hex;
        var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
        var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma >= MIN_LINE_LUMA) return hex;
        var p = (MIN_LINE_LUMA - luma) / (255 - luma);
        function mix(c) { return Math.round(c + (255 - c) * p); }
        function hx(c) { return ('0' + c.toString(16)).slice(-2); }
        return '#' + hx(mix(r)) + hx(mix(g)) + hx(mix(b));
    }

    // One consistent display colour per selected lap, keyed by selection id, so a lap looks
    // identical on the 3D map, the chart lines and the focus cards. Same-team laps are shaded
    // by their occurrence order (aligns with the chart's solid/dashed/dotted dash index, which
    // counts team occurrences over the same !hidden selection set).
    function laneColorMap() {
        var hd = window.HistoryDetail, sess = hd && hd.state ? hd.state.session : null;
        var out = new Map(), seen = {};
        if (!sess || !hd.state.driverSelection) return out;
        hd.state.driverSelection.forEach(function (sel, key) {
            if (!sel || sel.hidden) return;
            var srcIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : key);
            var drv = sess.drivers[srcIdx];
            var base = (drv && typeof teamAccentColor === 'function')
                ? teamAccentColor(drv.teamId, drv.liveryColorHex) : '#9aa0a6';
            var tid = drv && drv.teamId != null ? String(drv.teamId) : ('_' + key);
            var occ = seen[tid] || 0; seen[tid] = occ + 1;
            out.set(key, ensureReadableColor(shadeColor(base, occ)));
        });
        return out;
    }

    // Module-level lookup so the chart-line, band and per-driver renderers (each in their own
    // function) get a lap's display colour without threading a local laneColors map through.
    // Cached per redraw — laneColorMap walks the whole selection and was being rebuilt for
    // every line of every metric row (and on every hover tick).
    function laneColorFor(carIdx) {
        if (!compareState.__laneColors) compareState.__laneColors = laneColorMap();
        return compareState.__laneColors.get(carIdx) || '#9aa0a6';
    }

    // Linear-interpolated lap time at a distance from a driver's Motion samples (d ascending).
    function interpTimeAtDistance(motion, d) {
        if (!motion || motion.length < 2) return null;
        if (d <= motion[0].d) return motion[0].t;
        var last = motion[motion.length - 1];
        if (d >= last.d) return last.t;
        for (var i = 1; i < motion.length; i++) {
            if (motion[i].d >= d) {
                var a = motion[i - 1], b = motion[i], span = b.d - a.d;
                return span > 0 ? a.t + (b.t - a.t) * ((d - a.d) / span) : a.t;
            }
        }
        return last.t;
    }

    // Track dominance: split the lap into segments and, for each, pick the driver who covered
    // it in the least time. Consecutive same-winner segments merge into runs of normalised
    // [start,end] lap fractions + colour, ready for the 3D ribbon overlay.
    function computeDominance(drivers, trackLen) {
        var withMotion = (drivers || []).filter(function (dv) { return dv.motion && dv.motion.length > 1; });
        if (withMotion.length === 0 || !trackLen) return [];
        var STEPS = 160, seg = trackLen / STEPS, runs = [], cur = null;
        for (var i = 0; i < STEPS; i++) {
            var d0 = i * seg, d1 = (i + 1) * seg, bestColor = null, bestT = Infinity;
            for (var k = 0; k < withMotion.length; k++) {
                var dv = withMotion[k];
                var t0 = interpTimeAtDistance(dv.motion, d0), t1 = interpTimeAtDistance(dv.motion, d1);
                if (t0 == null || t1 == null) continue;
                var dt = t1 - t0;
                if (dt > 0 && dt < bestT) { bestT = dt; bestColor = dv.color; }
            }
            if (bestColor == null) { cur = null; continue; }
            if (cur && cur.color === bestColor) { cur.end = d1 / trackLen; }
            else { cur = { start: d0 / trackLen, end: d1 / trackLen, color: bestColor }; runs.push(cur); }
        }
        return runs;
    }

    // Track map (3D). Builds the driver racing-line set from Motion telemetry and hands it,
    // plus the trackId, to the Three.js renderer in track3d.js. World X/Y/Z match the authored
    // geometry frame so lines land on the ribbon; Motion.y is real elevation where logged.
    function drawTrackMap(lapData) {
        var host = document.getElementById('tcMap');
        if (!host || !window.TrackMap3D) return;
        var sess = window.HistoryDetail.state.session;
        if (!sess || !sess.meta) return;

        var resolvedRef = ensureReferenceSelection(lapData);
        var refCarIdx = resolvedRef ? Number(resolvedRef.carIdx) : null;

        var drivers = [];
        var laneColors = laneColorMap();
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (!sel || sel.hidden) return;
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.motion || d.motion.length === 0) return;
            var srcIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
            drivers.push({
                carIdx: Number(carIdx),
                color: laneColors.get(carIdx) || '#9aa0a6',
                isRef: refCarIdx != null && Number(carIdx) === refCarIdx,
                isPlayer: srcIdx === sess.meta.playerCarIndex,
                motion: d.motion,
            });
        });

        window.TrackMap3D.attach(host, { liveTags: false }); // no live-car feed here — nothing to tag
        // Big running-delta overlay, pinned to the top of the WebGL stage. Created once and
        // reused across redraws (attach is idempotent for the same host, so .tc-map3d persists).
        var stage = host.querySelector('.tc-map3d');
        if (stage && !stage.querySelector('#tcMapDelta')) {
            var deltaEl = document.createElement('div');
            deltaEl.className = 'tc-map3d-delta';
            deltaEl.id = 'tcMapDelta';
            deltaEl.hidden = true;
            deltaEl.title = 'Time vs reference at the cursor';
            deltaEl.innerHTML = '<span class="tc-md-num">—</span>';
            stage.appendChild(deltaEl);
        }
        syncMapDeltaVisibility();
        window.TrackMap3D.setData({
            trackId: sess.meta.trackId,
            drivers: drivers,
            dominance: computeDominance(drivers, sess.meta.trackLengthM),
            onHover: function (dist) {
                if (compareState.__hoverBridge) compareState.__hoverBridge.setDistance(dist, 'map');
            },
            onHoverClear: function () {
                if (compareState.__hoverBridge) compareState.__hoverBridge.clear();
            },
        });
        if (window.TrackMap3D.setSyncMode) window.TrackMap3D.setSyncMode(getMapSyncMode());
    }

    function findClosestMotion(motion, d) {
        if (!motion || !motion.length) return null;
        var best = motion[0], bestDiff = Math.abs(motion[0].d - d);
        for (var i = 1; i < motion.length; i++) {
            var diff = Math.abs(motion[i].d - d);
            if (diff < bestDiff) { best = motion[i]; bestDiff = diff; }
        }
        return best;
    }
    // Chart-camera: smooth pan/zoom for the chart stack (edge-follow + bridge pan).
    var CHART_CM = {
        damping: 0.12,
        edgeFollowSize: 0.12,
        edgeFollowSpeed: 0.05,
        bridgeMargin: 0.10,
    };
    function ensureChartCam() {
        if (!compareState.__chartCam) {
            compareState.__chartCam = {
                z0: null, z1: null,
                tz0: null, tz1: null,
                active: false, rafId: 0,
            };
        }
        return compareState.__chartCam;
    }
    function stopChartCamLoop() {
        var cam = ensureChartCam();
        cam.active = false;
        if (cam.rafId) { cancelAnimationFrame(cam.rafId); cam.rafId = 0; }
    }
    function tickChartCam() {
        var cam = ensureChartCam();
        if (!cam.active) return;
        if (compareState.zoomStart == null && compareState.zoomEnd == null) {
            stopChartCamLoop();
            return;
        }
        if (cam.tz0 == null || cam.tz1 == null) {
            stopChartCamLoop();
            return;
        }
        var trackLenAll = (window.HistoryDetail && window.HistoryDetail.state && window.HistoryDetail.state.session && window.HistoryDetail.state.session.meta && window.HistoryDetail.state.session.meta.trackLengthM) || 5000;
        var cur0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
        var cur1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
        var t = CHART_CM.damping;
        var next0 = cur0 + (cam.tz0 - cur0) * t;
        var next1 = cur1 + (cam.tz1 - cur1) * t;
        var span = next1 - next0;
        if (span > trackLenAll) { next0 = 0; next1 = trackLenAll; }
        next0 = Math.max(0, Math.min(trackLenAll - span, next0));
        next1 = Math.min(trackLenAll, Math.max(next0 + span, next1));
        compareState.zoomStart = next0;
        compareState.zoomEnd = next1;
        // Repaint at ~30 Hz instead of 60 Hz: __updateChartStackView re-renders the
        // full SVG for every metric (~5 SVGs × ~3000 sample points). Halving the
        // repaint rate keeps the animation smooth visually but cuts the work in half.
        // The damping math still runs every frame so convergence timing is unchanged.
        cam.frameCount = (cam.frameCount || 0) + 1;
        var isSettling = Math.abs(next0 - cam.tz0) < 0.3 && Math.abs(next1 - cam.tz1) < 0.3;
        var shouldRepaint = isSettling || (cam.frameCount % 2 === 0);
        if (shouldRepaint && typeof compareState.__updateChartStackView === 'function') {
            compareState.__updateChartStackView(next0, next1);
        }
        if (isSettling) {
            compareState.zoomStart = cam.tz0;
            compareState.zoomEnd = cam.tz1;
            if (typeof compareState.__updateChartStackView === 'function') {
                compareState.__updateChartStackView(cam.tz0, cam.tz1);
            }
            cam.frameCount = 0;
            stopChartCamLoop();
            return;
        }
        cam.rafId = requestAnimationFrame(tickChartCam);
    }
    function startChartCamLoop() {
        var cam = ensureChartCam();
        if (cam.active) return;
        cam.active = true;
        tickChartCam();
    }
    function setChartCamTarget(tz0, tz1) {
        var cam = ensureChartCam();
        var trackLenAll = (window.HistoryDetail && window.HistoryDetail.state && window.HistoryDetail.state.session && window.HistoryDetail.state.session.meta && window.HistoryDetail.state.session.meta.trackLengthM) || 5000;
        var span = tz1 - tz0;
        span = Math.max(1, Math.min(trackLenAll, span));
        cam.tz0 = Math.max(0, Math.min(trackLenAll - span, tz0));
        cam.tz1 = Math.min(trackLenAll, Math.max(cam.tz0 + span, tz1));
        if (!cam.active) startChartCamLoop();
    }

    // ---------- hover sync ----------

    function wireHover(host, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess) {
        var overlay = host.querySelector('#tcHoverLayer');
        var crosshair = host.querySelector('#tcCrosshair');
        if (!overlay) return;

        var chips = Array.prototype.slice.call(host.querySelectorAll('.tc-row-chip'));
        var metricByKey = new Map(METRICS.map(function (m) { return [m.key, m]; }));
        var scheduled = false, lastX = 0;
        var rafToken = 0;
        var hoverCacheByDriver = new Map();
        var lastHoverSignature = null;
        var lastHoverDistance = 0;
        // 'chart' (default) or 'map' — when 'map', skip auto-follow so the camera
        // doesn't slide around under the user's cursor while they're on the map.
        var lastHoverSource = 'chart';
        var brushStartPx = null;
        var brushEl = overlay.querySelector('.tc-brush');
        var overviewWin = host.querySelector('#tcOverviewWin');
        var overview = host.querySelector('#tcOverview');

        // Resolve reference and first compare driver data for lateral-offset calc.
        var refData = (refCarIdx != null && lapData) ? lapData.get(refCarIdx) : null;
        var firstCmp = null;
        selections.forEach(function (kv) {
            if (firstCmp) return;
            var carIdx = Number(kv[0]);
            if (refCarIdx != null && carIdx === Number(refCarIdx)) return;
            var d = lapData && lapData.get(carIdx);
            if (d && d.motion && d.motion.length > 0) firstCmp = d;
        });

        // Pre-compute per-driver interp sample + color + delta series at hover time.
        function resolvePerDriver(d, interpCtx) {
            var compareOrdinal = 0;
            return selections.map(function (kv) {
                var carIdx = kv[0];
                var data = lapData && lapData.get(carIdx);
                if (!data || !data.samples) return null;
                var driver = resolveCompareDriver(sess, carIdx, kv[1]);
                var color = laneColorFor(carIdx);
                var sample = null;
                var idxKey = String(carIdx);
                var nearestIdx = findNearestSampleIndex(data.samples, d);
                var cached = hoverCacheByDriver.get(idxKey);
                if (cached && cached.idx === nearestIdx) sample = cached.sample;
                else {
                    sample = interpAtDistance(data.samples, d, interpCtx);
                    hoverCacheByDriver.set(idxKey, { idx: nearestIdx, sample: sample });
                }
                var deltaVal = null;
                if (carIdx !== refCarIdx && refSamples && data.samples) {
                    var refInterp = interpAtDistance(refSamples, d, interpCtx);
                    if (refInterp && sample) deltaVal = sample.t - refInterp.t;
                } else if (carIdx === refCarIdx) {
                    deltaVal = 0;
                }
                var sel = window.HistoryDetail && window.HistoryDetail.state && window.HistoryDetail.state.driverSelection
                    ? window.HistoryDetail.state.driverSelection.get(carIdx)
                    : null;
                var lapNo = sel && sel.lap != null ? Number(sel.lap) : null;
                var roleLabel = 'REF';
                if (carIdx !== refCarIdx) {
                    roleLabel = 'LAP ' + String.fromCharCode(65 + Math.min(25, compareOrdinal));
                    compareOrdinal++;
                }
                var nameLabel = (driver && (driver.shortName || driver.name || driver.code)) || roleLabel;
                var chipLabel = (driver && (driver.shortName || driver.name || driver.code))
                    ? (nameLabel + (lapNo != null ? (' · L' + lapNo) : ''))
                    : roleLabel;
                var chipShort = (driver && (driver.shortName || driver.name || driver.code))
                    ? (nameLabel + (lapNo != null ? (' L' + lapNo) : ''))
                    : roleLabel;
                return { carIdx: carIdx, color: color, sample: sample, delta: deltaVal, isReference: carIdx === refCarIdx, chipLabel: chipLabel, chipShort: chipShort };
            }).filter(Boolean).sort(function (a, b) {
                return (b.isReference === true) - (a.isReference === true);
            });
        }

        function resolveHoverPair(perDriver) {
            if (!perDriver || perDriver.length === 0) return { ref: null, current: null };
            var ref = perDriver.find(function (x) { return x.isReference; }) || perDriver[0];
            var current = perDriver.find(function (x) { return !x.isReference; }) || ref;
            return { ref: ref, current: current };
        }

        function formatMetricDiff(metricKey, currentSample, refSample) {
            if (!currentSample || !refSample) return '—';
            var dv = (currentSample[metricKey] || 0) - (refSample[metricKey] || 0);
            if (metricKey === 'spd') return (dv >= 0 ? '+' : '') + Math.round(dv) + ' km/h';
            if (metricKey === 'thr' || metricKey === 'brk') return (dv >= 0 ? '+' : '') + Math.round(dv) + '%';
            if (metricKey === 'str') return (dv >= 0 ? '+' : '') + Math.round(dv) + '°';
            if (metricKey === 'rpm') return (dv >= 0 ? '+' : '') + Math.round(dv);
            if (metricKey === 'gr') return (dv >= 0 ? '+' : '') + Math.round(dv);
            if (metricKey === 'ers') return (dv >= 0 ? '+' : '') + Math.round(dv) + '%';
            if (metricKey === 'dep') {
                var depDv = ((currentSample.ersDepLapJ || 0) - (refSample.ersDepLapJ || 0)) / 1e6;
                return (depDv >= 0 ? '+' : '') + depDv.toFixed(2) + ' MJ';
            }
            if (metricKey === 'drs' || metricKey === 'aero' || metricKey === 'ovt') return dv === 0 ? '0' : (dv > 0 ? '+ON' : '-ON');
            if (metricKey === 'delta') return (dv >= 0 ? '+' : '') + dv.toFixed(3) + ' s';
            return (dv >= 0 ? '+' : '') + dv.toFixed(2);
        }

        function update() {
            scheduled = false;
            rafToken = 0;
            // Re-query chips because updateChartStackView may have recreated the DOM.
            chips = Array.prototype.slice.call(host.querySelectorAll('.tc-row-chip'));
            var interpCtx = createInterpContext();
            var rect = overlay.getBoundingClientRect();
            // Read the visible range live: chart-cam can pan via __updateChartStackView
            // without re-wiring hover, so the captured xMin/xMax become stale during the
            // animation. The dynamic read keeps d, crosshair, chips and Y-ranges aligned
            // with whatever axis the user actually sees.
            var curMin = compareState.zoomStart != null ? compareState.zoomStart : 0;
            var curMax = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
            var pct = Math.max(0, Math.min(1, lastX / rect.width));
            var d = curMin + pct * (curMax - curMin);
            crosshair.style.left = (pct * 100) + '%';
            positionCornerTag(host, d, pct);
            lastHoverDistance = d;

            var perDriver = resolvePerDriver(d, interpCtx);
            var pair = resolveHoverPair(perDriver);

            // Lateral offset between reference and first compare trajectory.
            var lateralOffset = null;
            if (refData && firstCmp && refData.motion && firstCmp.motion) {
                var refM2 = findClosestMotion(refData.motion, d);
                var cmpM2 = findClosestMotion(firstCmp.motion, d);
                if (refM2 && cmpM2) {
                    var ldx = cmpM2.x - refM2.x;
                    var ldz = cmpM2.z - refM2.z;
                    lateralOffset = Math.sqrt(ldx*ldx + ldz*ldz);
                }
            }

            var signature = perDriver.map(function (pd) {
                return pd.carIdx + ':' + findNearestSampleIndex((lapData.get(pd.carIdx) || {}).samples, d);
            }).join('|');
            if (signature === lastHoverSignature) return;
            lastHoverSignature = signature;

            var rangeCache = new Map();
            function getYRange(mk) {
                if (rangeCache.has(mk)) return rangeCache.get(mk);
                var mdef = metricByKey.get(mk);
                // Use the dynamic visible range so chip Y-positions match the chart that
                // chart-cam has just panned to (otherwise chips land on the wrong axis).
                var r = mdef ? computePlotValueRange(mdef, lapData, selections, refSamples, refCarIdx, curMin, curMax, sess) : { min: 0, max: 1 };
                rangeCache.set(mk, r);
                return r;
            }
            var PAD_T = 4, PAD_B = 16;
            chips.forEach(function (chip) {
                var metricKey = chip.dataset.metric;
                if (perDriver.length === 0) { chip.hidden = true; return; }
                // Chips live in the stack-wide hover layer; anchor each one to its
                // metric row via the row's rect measured against the layer's rect.
                var rowHost = host.querySelector('.tc-chart-row[data-metric="' + metricKey + '"] .tc-chart-svg-host');
                if (!rowHost) { chip.hidden = true; return; }
                var rowRect = rowHost.getBoundingClientRect();
                var rowTop = rowRect.top - rect.top;
                var metricDef = metricByKey.get(metricKey);
                var hostH = rowRect.height || 40;
                var y = hostH / 2;
                var plotH = Math.max(1, hostH - PAD_T - PAD_B);
                if (metricDef && pair.current) {
                    var yv;
                    if (metricKey === 'delta') yv = (pair.current.delta != null) ? pair.current.delta : 0;
                    else if (pair.current.sample) yv = metricValue(metricDef, pair.current.sample);
                    else yv = 0;
                    var pr = getYRange(metricKey);
                    var yNorm = (yv - pr.min) / Math.max(0.0001, pr.max - pr.min);
                    // Raw position only — the final clamp happens below with the chip's
                    // real rendered height (multi-driver chips are much taller than one line).
                    y = PAD_T + (1 - yNorm) * plotH;
                }
                // Speed chip annexes attack-aid badges so the user can read "DRS open" /
                // "Straight Mode" / "Boost" straight from the speed row — without scanning
                // the dedicated band rows. Labels: DRS (≤2025), SM + BST (2026 regs).
                var AID_BADGES = [
                    { key: 'drs',  label: 'DRS' },
                    { key: 'aero', label: 'SM' },
                    { key: 'ovt',  label: 'BST' },
                ];
                function aidTagFor(label, cmpOn, refOn, isPair) {
                    if (!cmpOn && !refOn) return '';
                    if (isPair) {
                        // In pair mode the tag piggy-backs on a per-driver row; the colour
                        // is meaningless there, so we use a neutral pill.
                        return cmpOn ? '<span class="tc-chip-drs tc-chip-drs--equal">' + label + '</span>' : '';
                    }
                    if (cmpOn && !refOn) return '<span class="tc-chip-drs tc-chip-drs--gain">' + label + ' +</span>';
                    if (!cmpOn && refOn) return '<span class="tc-chip-drs tc-chip-drs--loss">' + label + ' −</span>';
                    return '<span class="tc-chip-drs tc-chip-drs--equal">' + label + '</span>';
                }
                function aidTagsDiff(cmpSample, refSample) {
                    return AID_BADGES.map(function (aid) {
                        return aidTagFor(aid.label, !!(cmpSample && cmpSample[aid.key]), !!(refSample && refSample[aid.key]), false);
                    }).join('');
                }
                function aidTagsPair(sample) {
                    return AID_BADGES.map(function (aid) {
                        return aidTagFor(aid.label, !!(sample && sample[aid.key]), false, true);
                    }).join('');
                }

                var rows = '';
                if (compareState.chipMode === 'diff') {
                    if (metricKey === 'delta') {
                        // Raw float subtraction was being dumped via String(...) — produced
                        // "0.6486164050141454" in the chip. Format to 3 dp with sign, matching
                        // formatChipValue's delta path so both chip modes look consistent.
                        var dv = ((pair.current && pair.current.delta) || 0) - ((pair.ref && pair.ref.delta) || 0);
                        rows = '<span class="tc-chip-row"><span class="tc-chip-ref">Δ</span><span class="tc-chip-val">'
                            + escapeHtml((dv >= 0 ? '+' : '') + dv.toFixed(3) + ' s') + '</span></span>';
                    } else if (metricKey === 'drs' || metricKey === 'aero' || metricKey === 'ovt') {
                        // Band signals are binary — "+ON / -ON / 0" was cryptic. Render a
                        // coloured tag that immediately conveys the diff state: cmp gained
                        // (green), cmp lost the tool (red), or both equal (neutral). When
                        // neither driver has it active the chip is hidden — nothing to compare.
                        var aidDef = AID_BADGES.find(function (a) { return a.key === metricKey; });
                        var dCmpOn = !!(pair.current && pair.current.sample && pair.current.sample[metricKey]);
                        var dRefOn = !!(pair.ref && pair.ref.sample && pair.ref.sample[metricKey]);
                        if (!dCmpOn && !dRefOn) { chip.hidden = true; return; }
                        rows = '<span class="tc-chip-row">'
                            + aidTagFor(aidDef ? aidDef.label : metricKey.toUpperCase(), dCmpOn, dRefOn, false)
                            + '</span>';
                    } else {
                        var diffText = formatMetricDiff(metricKey, pair.current && pair.current.sample, pair.ref && pair.ref.sample);
                        // Inline attack-aid badges on the Speed chip so DRS / SM / Boost
                        // state is visible without consulting the separate band rows.
                        var diffAids = (metricKey === 'spd')
                            ? aidTagsDiff(pair.current && pair.current.sample, pair.ref && pair.ref.sample) : '';
                        rows = '<span class="tc-chip-row"><span class="tc-chip-ref">Δ</span><span class="tc-chip-val">'
                            + escapeHtml(diffText) + '</span>' + diffAids + '</span>';
                    }
                } else {
                    // One entry per selected lap so the chip reflects the comparison size, not just C/R.
                    rows = perDriver.map(function (pd) {
                        var dv = (metricKey === 'delta') ? pd.delta : null;
                        var text = formatChipValue(metricKey, pd.sample, dv, pd.carIdx);
                        // Per-driver attack-aid badges appended to the Speed row only.
                        var drsTag = (metricKey === 'spd') ? aidTagsPair(pd.sample) : '';
                        // Tag tone reflects cumulative delta at the hover point: the
                        // reference is the baseline (neutral); a compare lap with a
                        // negative delta is ahead (win → green), positive is behind
                        // (loss → yellow). Threshold ±10 ms keeps neutral rows neutral
                        // when the two laps are essentially tied at this distance.
                        var tone = 'ref';
                        if (!pd.isReference && pd.delta != null) {
                            if (pd.delta < -0.01) tone = 'win';
                            else if (pd.delta > 0.01) tone = 'loss';
                        }
                        return '<span class="tc-chip-row">'
                            + '<span class="tc-chip-dot" style="background:' + (pd.color || '#bbb') + '"></span>'
                            + '<span class="tc-chip-ref tc-chip-ref--' + tone + '">' + escapeHtml(pd.chipShort || pd.chipLabel || '') + '</span>'
                            + '<span class="tc-chip-val">' + escapeHtml(text) + '</span>'
                            + drsTag
                            + '</span>';
                    }).join('');
                }
                chip.innerHTML = rows;
                chip.hidden = false;
                // Horizontal: sit right of the crosshair, flip to the left side when
                // the rendered chip would clip at the layer's right edge.
                var layerW = rect.width;
                var layerH = rect.height;
                var chipW = chip.offsetWidth || 80;
                var chipH = chip.offsetHeight || 18;
                var xPx = pct * layerW;
                var left = xPx + 10;
                if (left + chipW > layerW - 2) left = xPx - chipW - 10;
                left = Math.max(2, Math.min(layerW - chipW - 2, left));
                // Vertical: centre on the value point inside the row, then clamp to the
                // *layer* — a chip taller than its row spills over neighbouring rows
                // instead of being cut off at the row edge.
                var top = rowTop + y - chipH / 2;
                top = Math.max(2, Math.min(layerH - chipH - 2, top));
                chip.style.left = left + 'px';
                chip.style.top = top + 'px';
            });

            updateMapMarkers(d, lapData, sess);
            renderFocusPanel(perDriver, d, lateralOffset);
        }

        var trackLenAll = (sess && sess.meta && sess.meta.trackLengthM) || 5000;
        var panStart = null;

        function applyPan(nextZ0, nextZ1) {
            var span = Math.max(1, nextZ1 - nextZ0);
            var z0 = Math.max(0, Math.min(trackLenAll - span, nextZ0));
            var z1 = z0 + span;
            compareState.zoomStart = z0;
            compareState.zoomEnd = Math.min(trackLenAll, z1);
            updateOverviewWindow();
            drawChartStack(lapData);
        }

        overlay.addEventListener('wheel', function (e) {
            var rect = overlay.getBoundingClientRect();
            if (rect.width < 2) return;
            e.preventDefault();
            var z0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
            var z1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
            var span = Math.max(1, z1 - z0);
            var factor = e.deltaY > 0 ? 1.12 : 0.88;
            var anchorPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            var anchorD = z0 + anchorPct * span;
            var newSpan = Math.min(trackLenAll, Math.max(trackLenAll * 0.001, span * factor));
            var rel = (anchorD - z0) / span;
            var n0 = anchorD - rel * newSpan;
            compareState.zoomStart = Math.max(0, n0);
            compareState.zoomEnd = Math.min(trackLenAll, compareState.zoomStart + newSpan);
            compareState.zoomStart = Math.max(0, compareState.zoomEnd - newSpan);
            if (compareState.zoomStart <= 0 && compareState.zoomEnd >= trackLenAll - 1e-6) {
                compareState.zoomStart = null;
                compareState.zoomEnd = null;
            }
            redraw(lapData);
        }, { passive: false });

        overlay.addEventListener('dblclick', function (e) {
            e.preventDefault();
            compareState.zoomStart = null;
            compareState.zoomEnd = null;
            compareState.brush = null;
            updateBrushVisual();
            redraw(lapData);
        });

        overlay.addEventListener('pointermove', function (e) {
            if (panStart && panStart.id === e.pointerId) {
                e.preventDefault();
                var rect = overlay.getBoundingClientRect();
                var px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                var dxPx = px - panStart.lastPx;
                panStart.lastPx = px;
                var deltaM = -(dxPx / Math.max(1, rect.width)) * panStart.span;
                var cur0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
                var cur1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
                applyPan(cur0 + deltaM, cur1 + deltaM);
                return;
            }
            var rect = overlay.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            lastHoverSource = 'chart';
            // Chart is now the hover source — release the bridge's hold on the crosshair
            // so chart-cam ticks don't override the chart-driven position.
            compareState.__lastBridgeD = null;
            if (rect.width > 2 && compareState.brush == null) {
                var z0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
                var z1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
                var span = z1 - z0;
                if (span > 0 && span < trackLenAll - 1) {
                    var pct = lastX / rect.width;
                    var edge = CHART_CM.edgeFollowSize;
                    var speed = span * CHART_CM.edgeFollowSpeed;
                    if (pct < edge) {
                        setChartCamTarget(z0 - speed, z1 - speed);
                    } else if (pct > 1 - edge) {
                        setChartCamTarget(z0 + speed, z1 + speed);
                    }
                }
            }
            if (!scheduled) {
                scheduled = true;
                rafToken = requestAnimationFrame(update);
            }
        });
        overlay.addEventListener('mouseleave', function () {
            if (rafToken) cancelAnimationFrame(rafToken);
            rafToken = 0;
            scheduled = false;
            chips.forEach(function (chip) { chip.hidden = true; });
            crosshair.style.left = '-9999px';
            var cornerTagEl = host.querySelector('#tcCornerTag');
            if (cornerTagEl) cornerTagEl.hidden = true;
            renderFocusPanel([], null, null);
        });

        overlay.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            var rect = overlay.getBoundingClientRect();
            var px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            if (e.shiftKey || e.pointerType !== 'mouse') {
                e.preventDefault();
                try { overlay.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                panStart = {
                    id: e.pointerId,
                    lastPx: px,
                    span: Math.max(1, (compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll)
                        - (compareState.zoomStart != null ? compareState.zoomStart : 0)),
                };
                return;
            }
            brushStartPx = px;
            compareState.brush = { start: brushStartPx, end: brushStartPx };
            updateBrushVisual();
            document.addEventListener('mousemove', onBrushMove);
            document.addEventListener('mouseup', onBrushUp);
            document.addEventListener('pointerup', onBrushUp);
            document.addEventListener('touchmove', onBrushMove, { passive: false });
            document.addEventListener('touchend', onBrushUp);
            document.addEventListener('touchcancel', onBrushUp);
        });
        overlay.addEventListener('pointerup', function (e) {
            if (panStart && panStart.id === e.pointerId) {
                try { overlay.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                panStart = null;
            }
        });
        overlay.addEventListener('pointercancel', function (e) {
            if (panStart && panStart.id === e.pointerId) panStart = null;
        });

        function onBrushMove(e) {
            if (brushStartPx == null) return;
            var rect = overlay.getBoundingClientRect();
            var clientX = e.clientX;
            if (e.type === 'touchmove' && e.touches && e.touches[0]) clientX = e.touches[0].clientX;
            var px = Math.max(0, Math.min(rect.width, clientX - rect.left));
            compareState.brush.end = px;
            updateBrushVisual();
        }
        function onBrushUp() {
            document.removeEventListener('mousemove', onBrushMove);
            document.removeEventListener('mouseup', onBrushUp);
            document.removeEventListener('pointerup', onBrushUp);
            document.removeEventListener('touchmove', onBrushMove);
            document.removeEventListener('touchend', onBrushUp);
            document.removeEventListener('touchcancel', onBrushUp);
            brushStartPx = null;
            if (!compareState.brush) return;
            var rect = overlay.getBoundingClientRect();
            var x0 = Math.min(compareState.brush.start, compareState.brush.end);
            var x1 = Math.max(compareState.brush.start, compareState.brush.end);
            var minPx = 5;
            if (x1 - x0 >= minPx && rect.width > 1) {
                var n0 = x0 / rect.width, n1 = x1 / rect.width;
                // Read range live — chart-cam may have panned the axis under us.
                var curMin = compareState.zoomStart != null ? compareState.zoomStart : 0;
                var curMax = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
                compareState.zoomStart = curMin + n0 * (curMax - curMin);
                compareState.zoomEnd = curMin + n1 * (curMax - curMin);
                compareState.brush = null;
                redraw(lapData);
                return;
            }
            compareState.brush = null;
            updateBrushVisual();
        }
        function updateBrushVisual() {
            if (!brushEl) return;
            if (!compareState.brush) {
                brushEl.style.display = 'none';
                return;
            }
            var left = Math.min(compareState.brush.start, compareState.brush.end);
            var width = Math.abs(compareState.brush.end - compareState.brush.start);
            brushEl.style.display = 'block';
            brushEl.style.left = left + 'px';
            brushEl.style.width = width + 'px';
        }
        function updateOverviewWindow() {
            if (!overviewWin) return;
            var trackLen = (sess && sess.meta && sess.meta.trackLengthM) || 1;
            var z0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
            var z1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;
            var l = Math.max(0, Math.min(100, (z0 / trackLen) * 100));
            var w = Math.max(2, Math.min(100, ((z1 - z0) / trackLen) * 100));
            overviewWin.style.left = l + '%';
            overviewWin.style.width = w + '%';
        }
        if (overview) {
            overview.addEventListener('mousedown', function (e) {
                if (e.target && e.target.closest && e.target.closest('#tcOverviewWin')) return;
                var rect = overview.getBoundingClientRect();
                var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                var trackLen = (sess && sess.meta && sess.meta.trackLengthM) || 1;
                var z0 = compareState.zoomStart != null ? compareState.zoomStart : 0;
                var z1 = compareState.zoomEnd != null ? compareState.zoomEnd : trackLen;
                var span = Math.max(1, z1 - z0);
                var center = pct * trackLen;
                compareState.zoomStart = Math.max(0, center - span / 2);
                compareState.zoomEnd = Math.min(trackLen, center + span / 2);
                redraw(lapData);
            });
            if (overviewWin) {
                overviewWin.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var barRect = overview.getBoundingClientRect();
                    var winRect = overviewWin.getBoundingClientRect();
                    overviewDrag = {
                        offsetFrac: (e.clientX - winRect.left) / barRect.width,
                        spanFrac: winRect.width / barRect.width,
                    };
                    document.addEventListener('mousemove', onOverviewDragMove);
                    document.addEventListener('mouseup', onOverviewDragUp);
                });
            }
        }
        function onOverviewDragMove(e) {
            if (!overviewDrag || !overview) return;
            var barRect = overview.getBoundingClientRect();
            var trackLen = (sess && sess.meta && sess.meta.trackLengthM) || 1;
            var frac = (e.clientX - barRect.left) / barRect.width - overviewDrag.offsetFrac;
            frac = Math.max(0, Math.min(1 - overviewDrag.spanFrac, frac));
            compareState.zoomStart = frac * trackLen;
            compareState.zoomEnd = compareState.zoomStart + overviewDrag.spanFrac * trackLen;
            updateOverviewWindow();
            drawChartStack(lapData);
        }
        function onOverviewDragUp() {
            document.removeEventListener('mousemove', onOverviewDragMove);
            document.removeEventListener('mouseup', onOverviewDragUp);
            overviewDrag = null;
        }
        updateOverviewWindow();
        renderFocusPanel([], null);

        // Bridge: lets the track map (or any future external source) drive the hover
        // state by lap distance. Re-uses the same RAF-batched update path as the
        // chart-overlay pointer so chips, crosshair and map markers stay in sync.
        compareState.__hoverBridge = {
            setDistance: function (d, source) {
                if (d == null || !isFinite(d)) return;
                lastHoverSource = source === 'chart' ? 'chart' : 'map';
                var rect = overlay.getBoundingClientRect();
                if (rect.width < 2) return;
                // Read the visible range *live* from compareState — wireHover captured
                // xMin/xMax at draw time, but chart-cam can auto-pan via
                // __updateChartStackView without re-wiring, leaving those stale. Using
                // the dynamic range keeps map→chart crosshair in sync with the panned axis.
                var curMin = compareState.zoomStart != null ? compareState.zoomStart : 0;
                var curMax = compareState.zoomEnd != null ? compareState.zoomEnd : trackLenAll;
                var span = curMax - curMin;
                if (span <= 0) return;
                var pctRaw = (d - curMin) / span;
                var inRange = pctRaw >= 0 && pctRaw <= 1;

                // Auto-pan the chart zoom window when the cursor on the map points
                // outside the currently visible distance range. Sliding pan (just
                // enough to bring d into view + 10% padding) instead of recentre,
                // so the window doesn't jerk on every mousemove.
                if (source !== 'chart' && !inRange && span < trackLenAll - 1) {
                    var pad = span * CHART_CM.bridgeMargin;
                    var newZ0;
                    if (pctRaw < 0) {
                        newZ0 = Math.max(0, d - pad);
                    } else {
                        newZ0 = Math.min(trackLenAll - span, d - span + pad);
                    }
                    var newZ1 = newZ0 + span;
                    setChartCamTarget(newZ0, newZ1);
                }

                // Remember the actual hovered distance — chart-cam auto-pan ticks read
                // this via updateChartStackView to slide the crosshair into place as the
                // visible range catches up to d.
                compareState.__lastBridgeD = d;

                if (!inRange) {
                    // Pin the crosshair to the nearest edge so it stays visible as an
                    // off-screen indicator while the chart auto-pans toward d. Chips
                    // have no meaningful screen x to land on outside the visible range,
                    // so we hide them; map markers are always refreshed.
                    crosshair.style.left = (Math.max(0, Math.min(1, pctRaw)) * 100) + '%';
                    chips.forEach(function (chip) { chip.hidden = true; });
                    updateMapMarkers(d, lapData, sess);
                    return;
                }

                lastX = pctRaw * rect.width;
                if (!scheduled) {
                    scheduled = true;
                    rafToken = requestAnimationFrame(update);
                }
            },
            clear: function () {
                if (rafToken) cancelAnimationFrame(rafToken);
                rafToken = 0;
                scheduled = false;
                lastHoverSource = 'chart';
                compareState.__lastBridgeD = null;
                chips.forEach(function (chip) { chip.hidden = true; });
                crosshair.style.left = '-9999px';
                var cornerTagEl = host.querySelector('#tcCornerTag');
                if (cornerTagEl) cornerTagEl.hidden = true;
                renderFocusPanel([], null, null);
            },
        };
    }

    function findNearestSampleIndex(samples, targetD) {
        if (!samples || samples.length === 0) return -1;
        if (targetD <= samples[0].d) return 0;
        if (targetD >= samples[samples.length - 1].d) return samples.length - 1;
        var lo = 1, hi = samples.length - 1;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (samples[mid].d < targetD) lo = mid + 1;
            else hi = mid;
        }
        var prev = lo - 1;
        return Math.abs(samples[lo].d - targetD) < Math.abs(samples[prev].d - targetD) ? lo : prev;
    }

    // Big running delta overlaid at the top of the 3D map: the first compare lap's cumulative
    // time gap to the reference at the cursor distance. Negative = ahead of reference (green),
    // positive = behind (red). Driven from the same perDriver payload as the focus panel, so it
    // tracks the hover and resets to "—" when the cursor leaves (perDriver = []). Only shown in
    // Map mode — in Charts mode the per-driver delta already lives in the focus panel.
    function updateTopDelta(perDriver) {
        var el = document.getElementById('tcMapDelta');
        if (!el) return;
        var num = el.querySelector('.tc-md-num');
        var cmp = null;
        if (perDriver) {
            for (var i = 0; i < perDriver.length; i++) {
                if (!perDriver[i].isReference && perDriver[i].delta != null) { cmp = perDriver[i]; break; }
            }
        }
        el.classList.remove('is-ahead', 'is-behind', 'is-even');
        if (!cmp) {
            num.textContent = '—';
        } else {
            var d = cmp.delta;
            num.textContent = (d >= 0 ? '+' : '') + d.toFixed(3);
            el.classList.add(d < -0.01 ? 'is-ahead' : (d > 0.01 ? 'is-behind' : 'is-even'));
        }
        el.hidden = getCompareMode() !== 'map';
    }

    // Show the in-map delta overlay only in Map mode. Called on mode switch and after the map
    // (re)draws, so the overlay's visibility stays correct even without a hover event.
    function syncMapDeltaVisibility() {
        var el = document.getElementById('tcMapDelta');
        if (el) el.hidden = getCompareMode() !== 'map';
    }

    // SVG gear dial — a ring with the gear number (G1..8 / N / R) in the centre.
    function gearDialSvg(g) {
        return '<div class="tc-rd-gear"><svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">'
            + '<circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3"/>'
            + '<text x="24" y="31" text-anchor="middle" class="tc-rd-gear-num">' + g + '</text>'
            + '</svg><span class="tc-rd-cap">gear</span></div>';
    }

    // SVG steering indicator — a top arc with a needle deflected by str (-100..100,
    // negative = left). Mapped to ±45° of visual tilt at full lock.
    function steerSvg(str) {
        var ang = Math.max(-45, Math.min(45, (str / 100) * 45));
        var lbl = (str > 0 ? 'R' : str < 0 ? 'L' : '') + Math.abs(Math.round(str)) + '°';
        return '<div class="tc-rd-steer"><svg viewBox="0 0 56 34" width="56" height="34" aria-hidden="true">'
            + '<path d="M6 28 A22 22 0 0 1 50 28" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3"/>'
            + '<line x1="28" y1="28" x2="28" y2="9" stroke="var(--rd)" stroke-width="2.5" stroke-linecap="round" transform="rotate(' + ang.toFixed(1) + ' 28 28)"/>'
            + '</svg><span class="tc-rd-cap">' + lbl + '</span></div>';
    }

    function pedalBar(kind, v) {
        return '<div class="tc-rd-bar tc-rd-bar--' + kind + '">'
            + '<span class="tc-rd-bar-fill" style="width:' + v + '%"></span>'
            + '<span class="tc-rd-bar-lbl">' + Math.round(v) + '%</span></div>';
    }

    // One YOU / REFERENCE instrument card for the focus panel.
    function readoutCardHtml(pd) {
        var s = pd.sample;
        var isRef = pd.isReference;
        var color = pd.color || '#9aa0a6';
        var name = escapeHtml(pd.chipLabel || pd.chipShort || (isRef ? 'Reference' : 'You'));
        var badge = isRef ? '<span class="tc-rd-tag tc-rd-tag--ref">REF</span>' : '<span class="tc-rd-tag">YOU</span>';
        var spd = s ? Math.round(s.spd) : '—';
        var rpm = s ? Math.round(s.rpm).toLocaleString() : '—';
        var gr = s ? (s.gr > 0 ? s.gr : (s.gr === 0 ? 'N' : 'R')) : '—';
        var thr = s ? Math.max(0, Math.min(100, s.thr)) : 0;
        var brk = s ? Math.max(0, Math.min(100, s.brk)) : 0;
        var ersMd = s ? ersModeTag(s.ersMd || 0, pd.carIdx) : '';
        // Attack-aid chips per regulation: DRS for ≤2025 laps, Straight Mode + Boost for 2026.
        var aidChips = lapIsReg26(pd.carIdx)
            ? '<span class="tc-rd-chip tc-rd-chip--drs is-' + (s && s.aero ? 'on' : 'off') + '">SM</span>'
              + '<span class="tc-rd-chip tc-rd-chip--boost is-' + (s && s.ovt ? 'on' : 'off') + '">BST</span>'
            : '<span class="tc-rd-chip tc-rd-chip--drs is-' + (s && s.drs ? 'on' : 'off') + '">DRS</span>';
        return ''
            + '<div class="tc-rd tc-rd--' + (isRef ? 'ref' : 'cmp') + '" style="--rd:' + color + '">'
            +   '<div class="tc-rd-head"><span class="tc-rd-dot"></span>'
            +     '<span class="tc-rd-name" title="' + name + '">' + name + '</span>' + badge + '</div>'
            +   '<div class="tc-rd-body">'
            +     '<div class="tc-rd-stats">'
            +       '<div class="tc-rd-spd"><b>' + spd + '</b><span>km/h</span></div>'
            +       '<div class="tc-rd-rpm"><b>' + rpm + '</b><span>rpm</span></div>'
            +     '</div>'
            +     gearDialSvg(gr) + steerSvg(s ? s.str : 0)
            +   '</div>'
            +   '<div class="tc-rd-pedals">' + pedalBar('thr', thr) + pedalBar('brk', brk) + '</div>'
            +   '<div class="tc-rd-chips">'
            +     aidChips
            +     (ersMd ? '<span class="tc-rd-chip">' + escapeHtml(ersMd) + '</span>' : '')
            +     (s ? '<span class="tc-rd-chip">ERS ' + Math.round(s.ers || 0) + '%</span>' : '')
            +   '</div>'
            + '</div>';
    }

    function renderFocusPanel(perDriver, distance, lateralOffset) {
        updateTopDelta(perDriver);
        var host = document.getElementById('tcFocusPanel');
        if (!host) return;
        var ref = perDriver ? perDriver.find(function (x) { return x.isReference; }) : null;
        var compares = perDriver ? perDriver.filter(function (x) { return !x.isReference; }) : [];
        // YOU (compare laps) on top, REFERENCE below — matches the dual-card reference layout.
        var ordered = compares.concat(ref ? [ref] : []);
        var hasAny = ordered.length > 0;

        var subText = distance == null
            ? 'Hover the chart or track map to inspect values'
            : ('d = ' + Math.round(distance) + ' m' + (lateralOffset != null ? ' · offset ' + lateralOffset.toFixed(2) + ' m' : ''));

        host.innerHTML = ''
            + '<div class="tc-focus-head"><h4>You vs Reference</h4></div>'
            + '<div class="tc-focus-sub">' + subText + '</div>'
            + (hasAny
                ? '<div class="tc-readouts">' + ordered.map(readoutCardHtml).join('') + '</div>'
                : '');
    }

    // Chart -> map: move every driver marker to the given lap distance (3D renderer).
    function updateMapMarkers(targetD, lapData, sess) {
        if (window.TrackMap3D) window.TrackMap3D.setMarkerDistance(targetD);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    window.TelemetryCompare = { render: render };
})();
