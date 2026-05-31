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
        { key: 'drs',   label: 'DRS', plotTitle: 'DRS', height: 22, min: 0, max: 1, style: 'band' },
    ];

    var ERS_MODE_TAGS = ['', 'MED', 'HOT', 'OT'];

    // Compact chip-value formatter per metric. Returns string for a sample+metric pair.
    function formatChipValue(metricKey, sample, deltaAt) {
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
                + (ERS_MODE_TAGS[sample.ersMd || 0] || '');
            case 'drs':   return sample.drs ? 'ON' : 'OFF';
            default:      return '';
        }
    }

    function render(body) {
        var sess = window.HistoryDetail.state.session;
        body.innerHTML = ''
            + '<div class="tc-layout">'
            +   '<div class="tc-side" id="tcSide" data-priority="secondary">'
            +     '<div class="tc-side-picker-host" id="tcSidePickerHost"></div>'
            +     '<div class="tc-side-toolbar tc-sector-badges" id="tcBadges"></div>'
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
            + '</div>';

        var side = body.querySelector('#tcSidePickerHost');
        var picker = window.HistoryDetail.DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: true,
            compareCardMode: true,
            onChange: function () { reloadLapSamples().then(redraw); },
        });
        side.appendChild(picker);

        reloadLapSamples().then(redraw);
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
        ensureReferenceSelection(lapData);
        drawBadges(lapData);
        drawChartStack(lapData);
        drawTrackMap(lapData);
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

        // ---------- Compact side toolbar ----------
        // View section: delta mode + split + zoom shortcuts.
        var html = '<div class="tc-stb">'
            + '<div class="tc-stb-section">'
            +   '<div class="tc-stb-label">View</div>'
            +   '<div class="tc-segmented tc-segmented--full">'
            +     '<button class="tc-seg-btn ' + (compareState.deltaMode === 'cumulative' ? 'active' : '') + '" data-mode="cumulative" title="Cumulative delta">Cumul.</button>'
            +     '<button class="tc-seg-btn ' + (compareState.deltaMode === 'sector' ? 'active' : '') + '" data-mode="sector" title="Per-sector delta">Per Sec.</button>'
            +   '</div>'
            +   '<div class="tc-stb-row">'
            +     '<span class="tc-stb-mini">Split</span>'
            +     '<div class="tc-segmented">'
            +       '<button class="tc-seg-btn ' + (compareState.miniPerSector === 1 ? 'active' : '') + '" data-mini="1">3</button>'
            +       '<button class="tc-seg-btn ' + (compareState.miniPerSector === 3 ? 'active' : '') + '" data-mini="3">9</button>'
            +       '<button class="tc-seg-btn ' + (compareState.miniPerSector === 4 ? 'active' : '') + '" data-mini="4">12</button>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-stb-row">'
            +     '<span class="tc-stb-mini">Zoom</span>'
            +     '<div class="tc-zoom-actions">'
            +       '<button class="tc-zoom-btn" data-action="reset-zoom" title="Reset to full lap">Reset</button>'
            +       '<button class="tc-zoom-btn" data-action="zoom-in-2x" title="Zoom in 2×" aria-label="Zoom in 2×">+2×</button>'
            +       '<button class="tc-zoom-btn" data-action="zoom-out-2x" title="Zoom out 2×" aria-label="Zoom out 2×">−2×</button>'
            +     '</div>'
            +   '</div>'
            + '</div>';

        // Sectors — clickable zoom shortcuts (horizontal scroll if many).
        html += '<div class="tc-stb-section">'
            +   '<div class="tc-stb-label">Sectors</div>'
            +   '<div class="tc-sector-groups">';
        var miniCount = Math.max(1, Number(compareState.miniPerSector) || 1);
        var currentSector = null;
        segments.forEach(function (seg, idx) {
            if (currentSector !== seg.sector) {
                if (currentSector !== null) html += '</div>';
                html += '<div class="tc-sector-group" data-sector="S' + seg.sector + '">';
                currentSector = seg.sector;
            }
            var sectorKey = 's' + seg.sector + 'Ms';
            var refMs = refLap ? refLap[sectorKey] : 0;
            var segmentMs = seg.parts > 1 ? (refMs / seg.parts) : refMs;
            var fullLabel = 'S' + seg.sector + (seg.parts > 1 ? ('.' + seg.part) : '');
            var shortLabel = seg.sector + (seg.parts > 1 ? ('.' + seg.part) : '');
            html += '<button class="tc-badge" data-start="' + seg.start + '" data-end="' + seg.end + '" title="' + fullLabel + '">'
                + '<strong><span class="tc-badge-label-full">' + fullLabel + '</span><span class="tc-badge-label-short">' + shortLabel + '</span></strong> '
                + window.HistoryDetail.formatSectorTime(segmentMs)
                + '</button>';

            if (miniCount > 1 && (idx + 1) % miniCount === 0 && (idx + 1) < segments.length) {
                html += '<span class="tc-sector-divider" aria-hidden="true"></span>';
            }
        });
        if (currentSector !== null) html += '</div>';
        html += '</div></div>';

        // Channels — visible-metric chips, wrapping.
        html += '<div class="tc-stb-section">'
            +   '<div class="tc-stb-label">Channels</div>'
            +   '<div class="tc-channel-list">';
        METRICS.forEach(function (m) {
            var pressed = !compareState.hiddenMetrics.has(m.key);
            html += '<button class="tc-channel ' + (pressed ? 'active' : '') + '" data-key="' + m.key + '"'
                + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">'
                + escapeHtml(m.label) + '</button>';
        });
        html += '</div></div>';

        // Display section: chip mode + height preset + reset + insights.
        html += '<div class="tc-stb-section">'
            +   '<div class="tc-stb-label">Display</div>'
            +   '<div class="tc-stb-row">'
            +     '<div class="tc-segmented tc-segmented--grow">'
            +       '<button class="tc-seg-btn tc-chip-mode ' + (compareState.chipMode === 'pair' ? 'active' : '') + '" data-chip-mode="pair">Values</button>'
            +       '<button class="tc-seg-btn tc-chip-mode ' + (compareState.chipMode === 'diff' ? 'active' : '') + '" data-chip-mode="diff">Delta</button>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-stb-row">'
            +     '<span class="tc-stb-mini">Size</span>'
            +     '<div class="tc-segmented tc-segmented--grow">';
        // Size presets: SVG icon visualises a chart-row of growing height.
        // Multiplies METRICS[i].height (base 50–70 px). Tall=2.8 → Speed row ~196 px,
        // Throttle/Brake ~140 px — properly readable for shape & numerical inspection.
        [
            { scale: 1.3, title: 'Compact', barY: 9, barH: 4 },
            { scale: 1.9, title: 'Normal',  barY: 6, barH: 7 },
            { scale: 2.8, title: 'Tall',    barY: 2, barH: 11 },
        ].forEach(function (pair) {
            var active = Math.abs(compareState.heightScale - pair.scale) < 0.01;
            var icon = '<svg class="tc-size-icon" viewBox="0 0 16 14" aria-hidden="true" focusable="false">'
                + '<rect x="1" y="' + pair.barY + '" width="14" height="' + pair.barH + '" rx="1.5"/>'
                + '</svg>';
            html += '<button class="tc-seg-btn tc-seg-btn--icon ' + (active ? 'active' : '') + '"'
                + ' data-scale="' + pair.scale + '" title="' + pair.title + '" aria-label="' + pair.title + '">'
                + icon + '</button>';
        });
        html += '</div>'
            +   '</div>'
            +   '<div class="tc-stb-row">'
            +     '<span class="tc-stb-mini">Insights</span>'
            +     '<button class="tc-seg-btn tc-insights-toggle tc-stb-toggle ' + (compareState.insightsEnabled ? 'active' : '') + '" data-action="insights">'
            +       (compareState.insightsEnabled ? 'On' : 'Off') + '</button>'
            +   '</div>'
            + '</div>';

        if (compareState.insightsEnabled) {
            html += renderTopLossZones(lapData, sess);
        }
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
            // Hover bridge: panel card ↔ map zone. Uses delegation so it survives
            // every drawBadges innerHTML rewrite without re-attaching listeners.
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
                // Suppress flicker when moving between child elements of the same card.
                if (z.contains(e.relatedTarget)) return;
                document.querySelectorAll('.tc-map-loss.is-hover').forEach(function (g) {
                    g.classList.remove('is-hover');
                });
            });
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
                if (ds.action === 'insights') {
                    compareState.insightsEnabled = !compareState.insightsEnabled;
                    persistState();
                    drawBadges(data);
                    return;
                }
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

    function renderTopLossZones(lapData, sess) {
        var zones = detectTopLossZones(lapData, sess, 3);
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
            html += '<div class="tc-loss-zone" data-zone-id="z' + i + '">'
                +   '<div class="tc-loss-zone-head">'
                +     '<button class="tc-loss-jump" data-start="' + z.start + '" data-end="' + z.end + '" data-zone-id="z' + i + '" title="Zoom charts to this segment + highlight on map">'
                +       '<span class="tc-loss-num">#' + (i + 1) + '</span>'
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
        var maxVisible = (compareState.miniPerSector >= 4 && window.innerWidth <= 720) ? 6 : METRICS.length;
        var visible = METRICS.filter(function (m) { return !compareState.hiddenMetrics.has(m.key); });
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
        var visibleMetrics = METRICS.filter(function (m) { return !compareState.hiddenMetrics.has(m.key); });

        var html = '';
        html += '<div class="tc-overview" id="tcOverview" title="Drag window to pan · click empty track to center">'
             +   renderOverviewSegments(sess.meta, compareState.miniPerSector, trackLen)
             +   '<div class="tc-overview-window" id="tcOverviewWin" title="Drag to move zoom window"></div>'
             + '</div>';
        visibleMetrics.forEach(function (m) {
            var h = effectiveHeight(m);
            var priority = getMetricPriority(m.key);
            html += '<div class="tc-chart-row" data-priority="' + priority + '" data-metric="' + m.key + '" style="--tc-row-h:' + h + 'px">'
                + '<div class="tc-chart-label tc-chart-label--rail" role="presentation"></div>'
                + '<div class="tc-chart-svg-host"></div>'
                + '</div>';
        });
        // Hover overlay spans the entire stack.
        html += '<div class="tc-hover-layer" id="tcHoverLayer">'
             + '<div class="tc-crosshair" id="tcCrosshair"></div>'
             + '<div class="tc-brush" id="tcBrush"></div>'
             + '</div>';
        html += '<div class="tc-interact-hint" aria-hidden="true">Wheel zoom · Shift+drag pan · drag select zoom · dbl-click reset · Esc reset · [← →] pan · [+ −] zoom</div>';
        host.innerHTML = html;

        var selections = Array.from(window.HistoryDetail.state.driverSelection.entries()).filter(function (kv) {
            return kv[1] && !kv[1].hidden;
        });

        visibleMetrics.forEach(function (m) {
            var row = host.querySelector('[data-metric="' + m.key + '"] .tc-chart-svg-host');
            row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, refIdx, xMin, xMax, sess, effectiveHeight(m));
            // Per-row value chip that follows the crosshair. Hidden until the user hovers.
            row.insertAdjacentHTML('beforeend',
                '<div class="tc-row-chip" data-metric="' + m.key + '" hidden></div>');
        });

        wireHover(host, lapData, selections, refSamples, refIdx, xMin, xMax, sess);
        bindCompareShortcuts();

        function updateChartStackView(nextXMin, nextXMax) {
            if (!host) return;
            visibleMetrics.forEach(function (m) {
                var row = host.querySelector('[data-metric="' + m.key + '"] .tc-chart-svg-host');
                if (!row) return;
                row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, refIdx, nextXMin, nextXMax, sess, effectiveHeight(m))
                    + '<div class="tc-row-chip" data-metric="' + m.key + '" hidden></div>';
            });
            var overviewWin = host.querySelector('#tcOverviewWin');
            if (overviewWin) {
                var l = Math.max(0, Math.min(100, (nextXMin / trackLen) * 100));
                var w = Math.max(2, Math.min(100, ((nextXMax - nextXMin) / trackLen) * 100));
                overviewWin.style.left = l + '%';
                overviewWin.style.width = w + '%';
            }
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
        if (key === 'drs') {
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
            var lx = 5;
            var anchor = 'start';
            if (yn <= PAD_T + 11) anchor = 'hanging';
            if (yn >= PAD_T + plotH - 3) anchor = 'auto';
            var dy = anchor === 'hanging' ? 0.5 : 0;
            yLabels += '<text class="tc-axis-tick" x="' + lx + '" y="' + (yn + dy) + '"'
                + (anchor === 'hanging' ? ' dominant-baseline="hanging"' : '')
                + '>' + escapeHtml(t.label) + '</text>';
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

        // Reference driver samples for overlays (DRS overlay on Speed; ERS bg band).
        var refDriverData = (refCarIdx != null && lapData) ? lapData.get(refCarIdx) : null;
        var refDriverSamples = refDriverData ? refDriverData.samples : null;

        var gridPack = buildHorizontalGridAndYLabels(metric, vMinPlot, vMaxPlot, PAD_T, plotH, W);
        var titleStr = escapeHtml(metric.plotTitle || metric.label);
        var insetTitle = '<text class="tc-plot-title" x="8" y="' + (H - 3) + '">' + titleStr + '</text>';

        // ---- DRS band row: one horizontal track per visible driver, filled where
        // their drs===1. Splitting per driver in their team colour makes it obvious
        // who opened the wing and who didn't — the previous single-band-from-ref
        // version hid every compare lap's DRS state. Ref track always renders first
        // (top), then compares in selection order.
        if (metric.style === 'band' && metric.key === 'drs') {
            var bandSvg = '';
            var tracks = [];
            selections.forEach(function (kv) {
                var carIdx = kv[0];
                var d = lapData && lapData.get(carIdx);
                if (!d || !d.samples) return;
                var driver = resolveCompareDriver(sess, carIdx, kv[1]);
                var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6';
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
                runLengthRuns(track.samples, 'drs', xMin, xMax).forEach(function (r) {
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
                    bandSvg += '<text class="tc-drs-track-label" x="3" y="' + (ty + th / 2 + 3) + '">'
                        + escapeHtml(track.label) + '</text>';
                }
            });
            return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
                + gridPack.grid + bandSvg + gridPack.yLabels + insetTitle + '</svg>';
        }

        // ---- ERS row: background mode band + floating mode tags, polyline on top. ----
        var ersBg = '';
        if (metric.key === 'ers' && refDriverSamples) {
            runLengthRuns(refDriverSamples, 'ersMd', xMin, xMax).forEach(function (r) {
                var x0 = Math.max(0, x(Math.max(r.from, xMin)));
                var x1 = Math.min(W, x(Math.min(r.to, xMax)));
                if (x1 <= x0) return;
                ersBg += '<rect class="tc-ers-band tc-ers-mode-' + r.v + '" x="' + x0 + '" y="' + PAD_T
                    + '" width="' + (x1 - x0) + '" height="' + plotH + '"/>';
                var tag = ERS_MODE_TAGS[r.v] || '';
                if (tag && (x1 - x0) > 30) {
                    ersBg += '<text class="tc-ers-mode-tag" x="' + (x1 - 3) + '" y="' + (PAD_T + 10)
                        + '" text-anchor="end">' + tag + '</text>';
                }
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

        var lines = '';
        var compareSeriesCount = 0;
        selections.forEach(function (kv) {
            var carIdx = kv[0];
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.samples) return;
            var driver = resolveCompareDriver(sess, carIdx, kv[1]);
            var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6';
            var dIdx = teamDashIdx.get(carIdx) || 0;
            var dashClass = dIdx === 0 ? ' tc-line--solid' : (dIdx === 1 ? ' tc-line--dashed' : ' tc-line--dotted');

            var values;
            if (metric.key === 'delta') {
                if (!refSamples) return;
                values = getDeltaSeriesForRange(carIdx, refCarIdx, d.samples, refSamples, xMin, xMax, sess);
            } else {
                values = d.samples.map(function (s) { return { d: s.d, v: s[metric.key] || 0 }; });
            }
            if (metric.key !== 'delta') values = values.filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
            if (values.length === 0) return;
            // 2 vertices per CSS pixel is the visual ceiling. W=900 viewBox units → ~1800 cap.
            values = subsamplePolyline(values, 1800);

            var pts = values.map(function (pt) {
                var yv = PAD_T + plotH - (pt.v - vMinPlot) / Math.max(0.0001, vMaxPlot - vMinPlot) * plotH;
                return x(pt.d) + ',' + yv;
            });
            var roleClass = 'tc-line tc-line-extra';
            if (carIdx === refCarIdx) roleClass = 'tc-line tc-line-ref';
            else if (compareSeriesCount === 0) roleClass = 'tc-line tc-line-current';
            lines += '<polyline class="' + roleClass + dashClass + '" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
            if (carIdx !== refCarIdx) compareSeriesCount++;
        });

        // Zero baseline when visible in range (speed / inputs / delta / steering).
        var baseY = PAD_T + plotH - (0 - vMinPlot) / Math.max(0.0001, vMaxPlot - vMinPlot) * plotH;
        if (0 >= vMinPlot - 1e-9 && 0 <= vMaxPlot + 1e-9 && baseY >= PAD_T && baseY <= PAD_T + plotH) {
            lines += '<line class="tc-baseline" x1="0" x2="' + W + '" y1="' + baseY + '" y2="' + baseY + '"/>';
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
            + gridPack.grid + ersBg + sectorMarkers + lines + gridPack.yLabels + insetTitle + '</svg>';
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
            drs: a.drs || 0,
        };
    }

    // ---------- track map ----------

    // Projects world XZ coordinates into the 360×360 viewBox used by the track-map SVG.
    // Centralised so drawTrackMap and updateMapMarkers can't drift apart numerically.
    function createMapProjection(bounds, viewW, viewH) {
        if (!bounds) return null;
        var W = viewW || 360, H = viewH || 360;
        var xRange = bounds.maxX - bounds.minX;
        var zRange = bounds.maxZ - bounds.minZ;
        var scale = Math.min(W / Math.max(1, xRange), H / Math.max(1, zRange)) * 0.9;
        var offsetX = (W - xRange * scale) / 2 - bounds.minX * scale;
        var offsetY = (H - zRange * scale) / 2 - bounds.minZ * scale;
        return {
            W: W, H: H, scale: scale, offsetX: offsetX, offsetY: offsetY,
            project: function (x, z) { return [x * scale + offsetX, z * scale + offsetY]; },
        };
    }

    function drawTrackMap(lapData) {
        var host = document.getElementById('tcMap');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var bounds = sess.meta.trackBoundsXZ;

        var proj = createMapProjection(bounds);
        if (!proj) {
            host.innerHTML = '<div class="tc-map-empty">No motion data yet.</div>';
            return;
        }
        var W = proj.W, H = proj.H;
        var project = proj.project;

        var lines = '';
        var heatSegments = '';
        var markers = '';
        var eventMarkers = '';
        var resolvedRef = ensureReferenceSelection(lapData);
        var refData = resolvedRef ? lapData.get(resolvedRef.carIdx) : null;
        var firstCmp = null;
        // Same teammate-dash rule as the chart stack: 1st visible driver from
        // each team → solid, 2nd → dashed, 3rd+ → dotted. Computed up front
        // because driverSelection iteration order also drives line rendering.
        var mapTeamDashIdx = new Map();
        var mapTeamSeen = new Map();
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (!sel || sel.hidden) return;
            var srcIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
            var drv = sess.drivers[srcIdx];
            var tid = drv && drv.teamId != null ? String(drv.teamId) : '_';
            var n = mapTeamSeen.get(tid) || 0;
            mapTeamDashIdx.set(carIdx, n);
            mapTeamSeen.set(tid, n + 1);
        });
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (!sel || sel.hidden) return;
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.motion || d.motion.length === 0) return;
            if (!firstCmp && resolvedRef && Number(carIdx) !== resolvedRef.carIdx) firstCmp = d;
            var sourceCarIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
            var driver = sess.drivers[sourceCarIdx];
            var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6';
            var pts = d.motion.map(function (m) {
                var p = project(m.x, m.z);
                return p[0] + ',' + p[1];
            });
            var dIdx = mapTeamDashIdx.get(carIdx) || 0;
            var dashClass = dIdx === 0 ? ' tc-map-line--solid' : (dIdx === 1 ? ' tc-map-line--dashed' : ' tc-map-line--dotted');
            lines += '<polyline class="tc-map-line' + dashClass + '" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
            var first = project(d.motion[0].x, d.motion[0].z);
            markers += '<circle class="tc-map-marker" data-car="' + carIdx + '" cx="' + first[0]
                + '" cy="' + first[1] + '" r="5" fill="' + color + '"/>';
        });
        if (compareState.mapLayers.deltaHeat && refData && firstCmp && refData.motion && firstCmp.motion) {
            // Heat colour: green = compare faster than reference at this point,
            // red = compare slower. Saturation scales with |delta| up to ±1.5 s.
            // Near-zero delta fades to dark grey so neutral zones don't shout.
            for (var i = 1; i < firstCmp.motion.length; i++) {
                var a = firstCmp.motion[i - 1], b = firstCmp.motion[i];
                var refA = interpAtDistance(refData.samples || [], a.d);
                var cmpA = interpAtDistance(firstCmp.samples || [], a.d);
                if (!refA || !cmpA) continue;
                var delta = cmpA.t - refA.t;
                var t = Math.min(1, Math.abs(delta) / 1.5);
                var rH, gH, bH;
                if (delta >= 0) { // slower → red
                    rH = Math.round(80 + 175 * t);
                    gH = Math.round(80 - 30 * t);
                    bH = Math.round(80 - 30 * t);
                } else {           // faster → green
                    rH = Math.round(80 - 30 * t);
                    gH = Math.round(80 + 130 * t);
                    bH = Math.round(80 - 30 * t);
                }
                var p1 = project(a.x, a.z), p2 = project(b.x, b.z);
                heatSegments += '<line class="tc-map-heat" x1="' + p1[0] + '" y1="' + p1[1]
                    + '" x2="' + p2[0] + '" y2="' + p2[1] + '" stroke="rgb(' + rH + ',' + gH + ',' + bH + ')"/>';
            }
        }

        // Track Dominance: divides the lap into ~20 m segments and colours each
        // segment by the driver who covered it the fastest. Works for any number
        // of visible laps (≥2). Uses one driver's motion as the geometry source —
        // they all share the same circuit shape, only colour changes per segment.
        var dominanceSegments = '';
        var dominanceLegendDrivers = [];
        if (compareState.mapLayers.dominance) {
            var visibleLaps = [];
            window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
                if (!sel || sel.hidden) return;
                var dd = lapData && lapData.get(carIdx);
                if (!dd || !dd.samples || dd.samples.length === 0 || !dd.motion || dd.motion.length === 0) return;
                var sourceCarIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
                var driver = sess.drivers[sourceCarIdx];
                var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6';
                var label = (driver && (driver.shortName || driver.code || driver.name)) || ('Car ' + sourceCarIdx);
                visibleLaps.push({ carIdx: carIdx, samples: dd.samples, motion: dd.motion, color: color, label: String(label).toUpperCase() });
            });
            if (visibleLaps.length >= 2) {
                var trackLenD = (sess.meta && sess.meta.trackLengthM) || 0;
                if (trackLenD > 0) {
                    var SEG = Math.min(300, Math.max(50, Math.floor(trackLenD / 25))); // ~25 m sectors
                    var segLen = trackLenD / SEG;
                    var segWinnerColor = new Array(SEG);
                    var segWinnerCar = new Array(SEG);
                    for (var k = 0; k < SEG; k++) {
                        var ds = k * segLen, de = (k + 1) * segLen;
                        var bestTime = Infinity, bestColor = null, bestCar = null;
                        for (var v = 0; v < visibleLaps.length; v++) {
                            var sStart = interpAtDistance(visibleLaps[v].samples, ds);
                            var sEnd = interpAtDistance(visibleLaps[v].samples, de);
                            if (!sStart || !sEnd) continue;
                            var st = sEnd.t - sStart.t;
                            if (st > 0 && st < bestTime) { bestTime = st; bestColor = visibleLaps[v].color; bestCar = visibleLaps[v].carIdx; }
                        }
                        segWinnerColor[k] = bestColor;
                        segWinnerCar[k] = bestCar;
                    }
                    var baseMotion = visibleLaps[0].motion;
                    for (var i2 = 1; i2 < baseMotion.length; i2++) {
                        var aD = baseMotion[i2 - 1], bD = baseMotion[i2];
                        var midD = (aD.d + bD.d) / 2;
                        if (midD < 0 || midD > trackLenD) continue;
                        var segIdx = Math.min(SEG - 1, Math.max(0, Math.floor(midD / segLen)));
                        var col2 = segWinnerColor[segIdx];
                        if (!col2) continue;
                        var p1d = project(aD.x, aD.z), p2d = project(bD.x, bD.z);
                        dominanceSegments += '<line class="tc-map-dominance" x1="' + p1d[0] + '" y1="' + p1d[1]
                            + '" x2="' + p2d[0] + '" y2="' + p2d[1] + '" stroke="' + col2 + '"/>';
                    }
                    // Legend: drivers + count of segments they win.
                    var winsByCar = new Map();
                    segWinnerCar.forEach(function (cid) {
                        if (cid == null) return;
                        winsByCar.set(cid, (winsByCar.get(cid) || 0) + 1);
                    });
                    visibleLaps.forEach(function (lap) {
                        var wins = winsByCar.get(lap.carIdx) || 0;
                        var pct = SEG > 0 ? Math.round(100 * wins / SEG) : 0;
                        dominanceLegendDrivers.push({ color: lap.color, label: lap.label, pct: pct });
                    });
                    dominanceLegendDrivers.sort(function (a, b) { return b.pct - a.pct; });
                }
            }
        }

        // Top Loss Zones overlay — top-3 segments where the compare lap bleeds
        // time vs reference. Same detection used by the Insights panel; we render
        // them as thick polylines along the compare lap's trajectory with numbered
        // badges. Active state mirrors the zoom (clicking a tc-loss-jump syncs
        // zoomStart/zoomEnd to a zone, so we match by start/end with a 1 m tolerance).
        var lossSegments = '';
        var lossBadges = '';
        if (compareState.mapLayers.loss && firstCmp && firstCmp.motion && firstCmp.samples) {
            var lossZones = detectTopLossZones(lapData, sess, 3);
            var maxZoneLoss = lossZones.reduce(function (a, z) { return Math.max(a, z.loss); }, 0);
            var zs = compareState.zoomStart, ze = compareState.zoomEnd;
            lossZones.forEach(function (z, i) {
                var zonePts = [];
                for (var k = 0; k < firstCmp.motion.length; k++) {
                    var mZ = firstCmp.motion[k];
                    if (mZ.d >= z.start && mZ.d <= z.end) {
                        var pZ = project(mZ.x, mZ.z);
                        zonePts.push(pZ[0].toFixed(2) + ',' + pZ[1].toFixed(2));
                    }
                }
                if (zonePts.length < 2) return;
                var isActive = zs != null && ze != null && Math.abs(zs - z.start) < 1 && Math.abs(ze - z.end) < 1;
                var intensity = maxZoneLoss > 0 ? Math.max(0.45, z.loss / maxZoneLoss) : 1;
                var cls = 'tc-map-loss rank-' + (i + 1) + (isActive ? ' is-active' : '');
                var ttl = 'Loss #' + (i + 1) + ' · +' + z.loss.toFixed(3) + ' s · '
                    + Math.round(z.start) + '–' + Math.round(z.end) + ' m';
                lossSegments += '<g class="' + cls + '" data-zone-id="z' + i + '" data-start="' + z.start + '" data-end="' + z.end + '" style="--tc-loss-intensity:' + intensity.toFixed(2) + '">'
                    + '<polyline class="tc-map-loss-line" points="' + zonePts.join(' ') + '"/>'
                    + '<title>' + ttl + '</title>'
                    + '</g>';
                // Badge anchored at the zone midpoint — easier to see than at the start,
                // and avoids overlap with brake-event dots that cluster near corner entry.
                var midParts = zonePts[Math.floor(zonePts.length / 2)].split(',');
                var bx = parseFloat(midParts[0]), by = parseFloat(midParts[1]);
                lossBadges += '<g class="tc-map-loss-badge rank-' + (i + 1) + (isActive ? ' is-active' : '')
                    + '" data-zone-id="z' + i + '" data-start="' + z.start + '" data-end="' + z.end + '" transform="translate(' + bx.toFixed(2) + ',' + by.toFixed(2) + ')">'
                    + '<circle r="7"/>'
                    + '<text dy="3.2" text-anchor="middle">' + (i + 1) + '</text>'
                    + '<title>' + ttl + '</title>'
                    + '</g>';
            });
        }

        if (compareState.mapLayers.events && firstCmp && firstCmp.samples && firstCmp.motion) {
            [
                { key: 'Braking start', idx: findEventIndex(firstCmp.samples, function (p, c) { return (p.brk || 0) < 5 && (c.brk || 0) >= 20; }), cls: 'brk' },
                { key: 'Throttle pickup', idx: findEventIndex(firstCmp.samples, function (p, c) { return (p.thr || 0) < 20 && (c.thr || 0) >= 40; }), cls: 'thr' },
                { key: 'Min speed', idx: findMinIndex(firstCmp.samples, 'spd'), cls: 'min' },
                { key: 'Apex', idx: findMinIndex(firstCmp.samples, 'str', true), cls: 'apx' },
            ].forEach(function (ev) {
                if (ev.idx < 0) return;
                var sample = firstCmp.samples[ev.idx];
                var m = findClosestMotion(firstCmp.motion, sample.d);
                if (!m) return;
                var p = project(m.x, m.z);
                eventMarkers += '<g class="tc-map-event tc-map-event-' + ev.cls + '" data-start="' + Math.max(0, sample.d - 35)
                    + '" data-end="' + (sample.d + 35) + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="4"/>'
                    + '<title>' + ev.key + ' · ' + Math.round(sample.d) + 'm</title></g>';
            });
        }

        var folder = window.HistoryDetail.state.folder;
        var slug = window.HistoryDetail.state.slug;
        var svgUrl = '/api/sessions/' + encodeURIComponent(folder) + '/' + encodeURIComponent(slug) + '/track-svg';

        host.innerHTML = ''
            + '<div class="tc-map-stage">'
            +   '<div class="tc-map-camera" id="tcMapCamera">'
            +     '<object class="tc-map-outline" type="image/svg+xml" data="' + svgUrl + '"></object>'
            +     '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tc-map-svg" preserveAspectRatio="xMidYMid meet">'
            // Render order matters: dominance is a ribbon-thick fill that would hide
            // the per-driver racing lines if drawn on top. Layering it underneath lets
            // the user compare actual trajectories against the dominance backdrop.
            +       dominanceSegments + heatSegments + (compareState.mapLayers.line ? lines : '') + lossSegments + markers + eventMarkers + lossBadges
            +     '</svg>'
            +   '</div>'
            +   '<div class="tc-map-controls">'
            +     '<button class="tc-map-zoom-btn" data-action="zoom-in" title="Zoom in (wheel up)" aria-label="Zoom in">+</button>'
            +     '<button class="tc-map-zoom-btn" data-action="zoom-out" title="Zoom out (wheel down)" aria-label="Zoom out">−</button>'
            +     '<button class="tc-map-zoom-btn ' + (compareState.mapFollow ? 'active' : '') + '" data-action="follow" title="Follow cursor when zoomed" aria-label="Toggle follow">𖦏</button>'
            +     '<button class="tc-map-zoom-btn" data-action="reset" title="Reset view" aria-label="Reset view">⛶</button>'
            +   '</div>'
            + '</div>'
            + '<div class="tc-map-caption">Track map'
            +   '<span class="tc-map-filters">'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.line ? 'active' : '') + '" data-layer="line">Line</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.deltaHeat ? 'active' : '') + '" data-layer="deltaHeat" title="Colour the racing line by time delta vs the reference lap">Δ Heat</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.dominance ? 'active' : '') + '" data-layer="dominance" title="Each ~25 m segment is coloured by the driver who covered it the fastest">Dominance</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.events ? 'active' : '') + '" data-layer="events">Events</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.loss ? 'active' : '') + '" data-layer="loss" title="Highlight top-3 zones where the compare lap loses time vs reference">Loss</button>'
            +   '</span>'
            +   (compareState.mapLayers.deltaHeat && !compareState.mapLayers.dominance && refData && firstCmp ? buildHeatLegend(sess, resolvedRef, lapData) : '')
            +   (compareState.mapLayers.dominance && dominanceLegendDrivers.length > 0 ? buildDominanceLegend(dominanceLegendDrivers) : '')
            + '</div>';
        host.querySelectorAll('.tc-map-filter').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var layer = btn.dataset.layer;
                compareState.mapLayers[layer] = !compareState.mapLayers[layer];
                persistState();
                drawTrackMap(lapData);
            });
        });
        host.querySelectorAll('.tc-map-event').forEach(function (ev) {
            ev.addEventListener('click', function () {
                compareState.zoomStart = Number(ev.dataset.start);
                compareState.zoomEnd = Number(ev.dataset.end);
                redraw(lapData);
            });
        });
        host.querySelectorAll('.tc-map-loss, .tc-map-loss-badge').forEach(function (g) {
            g.addEventListener('click', function (e) {
                // Stop bubbling so the SVG-level click-to-zoom handler doesn't also fire.
                e.stopPropagation();
                var start = Number(g.dataset.start);
                var end = Number(g.dataset.end);
                if (compareState.zoomStart === start && compareState.zoomEnd === end) {
                    compareState.zoomStart = null;
                    compareState.zoomEnd = null;
                } else {
                    compareState.zoomStart = start;
                    compareState.zoomEnd = end;
                }
                redraw(lapData);
            });
        });
        host.querySelector('.tc-map-svg').addEventListener('click', function (e) {
            var seg = resolveMapSegmentClick(e, sess.meta);
            if (!seg) return;
            compareState.zoomStart = seg.start;
            compareState.zoomEnd = seg.end;
            redraw(lapData);
        });

        // ---------- camera (pan / zoom / follow) ----------
        var camera = host.querySelector('#tcMapCamera');
        var stageEl = host.querySelector('.tc-map-stage');
        var svgForCamera = host.querySelector('.tc-map-svg');

        // Real CSS pixel size of the stage (not the viewBox 360×360).
        function stageSize() {
            if (!stageEl) return { w: W, h: H };
            return { w: stageEl.clientWidth || W, h: stageEl.clientHeight || H };
        }

        // Cinemachine-style 2D follow settings.
        // Dead zone is expressed as a fraction of the *visible viewport* (vwVB = W/Z
        // viewBox units), so the camera-resting region naturally shrinks with zoom.
        // For analytical hover we want the marker glued to the cursor: dead zone = 0
        // and a tight damping (≈80 ms to converge on a target jump). The maxScreenSpeed
        // cap only catches teleports (e.g. switching laps); ordinary cursor motion
        // never hits it because the per-frame step is bounded by damping.
        var CM = {
            damping: 0.45,        // lerp factor per frame (0..1). Higher = snappier.
            deadZoneX: 0.0,       // fraction of viewport width (0..1). 0 = no dead zone.
            deadZoneY: 0.0,       // fraction of viewport height.
            maxScreenSpeed: 80,   // max camera screen-pixels per frame @ 60 Hz.
        };

        // Default pan that keeps the track centered for a given zoom level.
        // Used both for first draw (when persisted pan is null) and as the
        // fallback when something asks for pan before the user has touched it.
        function defaultPanX(Z) {
            var sz = stageSize();
            return -sz.w * (Z - 1) / 2;
        }
        function defaultPanY(Z) {
            var sz = stageSize();
            return -sz.h * (Z - 1) / 2;
        }
        function clampPan(tx, ty, Z) {
            var sz = stageSize();
            // Content may be larger than viewport (Z>1) or smaller (Z<1).
            // Keep at least one content edge inside the viewport bounds.
            var limX = sz.w * (1 - Z);
            var limY = sz.h * (1 - Z);
            return [
                Math.min(Math.max(tx, Math.min(0, limX)), Math.max(0, limX)),
                Math.min(Math.max(ty, Math.min(0, limY)), Math.max(0, limY)),
            ];
        }
        function panToCameraCenter(cx, cy, Z) {
            var sz = stageSize();
            var sx = sz.w / W;
            var sy = sz.h / H;
            return { px: sz.w / 2 - cx * sx * Z, py: sz.h / 2 - cy * sy * Z };
        }
        function cameraCenterFromPan(px, py, Z) {
            var sz = stageSize();
            var sx = sz.w / W;
            var sy = sz.h / H;
            return { cx: (sz.w / 2 - px) / (sx * Z), cy: (sz.h / 2 - py) / (sy * Z) };
        }

        function ensureCamState() {
            if (!compareState.__camState) {
                compareState.__camState = {
                    x: W / 2, y: H / 2,
                    tx: W / 2, ty: H / 2,
                    active: false,
                    rafId: 0,
                };
            }
            return compareState.__camState;
        }
        function syncCamStateFromPan() {
            var cs = ensureCamState();
            var Z = compareState.mapZoom || 1;
            var px = (compareState.mapPanX == null) ? defaultPanX(Z) : compareState.mapPanX;
            var py = (compareState.mapPanY == null) ? defaultPanY(Z) : compareState.mapPanY;
            var c = cameraCenterFromPan(px, py, Z);
            cs.x = c.cx;
            cs.y = c.cy;
            cs.tx = c.cx;
            cs.ty = c.cy;
        }
        function stopCameraLoop() {
            var cs = ensureCamState();
            cs.active = false;
            if (cs.rafId) { cancelAnimationFrame(cs.rafId); cs.rafId = 0; }
        }
        function tickCamera() {
            var cs = ensureCamState();
            if (!cs.active) return;
            var Z = compareState.mapZoom || 1;
            if (Z <= 1.001 || !compareState.mapFollow) { stopCameraLoop(); return; }

            // cs.x/cs.tx are in viewBox units (see project() → 0..W). The previous
            // version computed dzX/maxStep in stage CSS pixels (sz.w/Z) and compared
            // to viewBox-unit dx — that worked only when sz.w ≈ W, otherwise dead
            // zone was off by sz.w/W. Use viewBox units everywhere; convert
            // maxScreenSpeed (intended as screen px/frame) into viewBox units via
            // px2vb = W/sz.w. One step of Δ viewBox units shows as Δ·(sz.w·Z/W) px,
            // so capping ≤ S screen px ⇔ Δ ≤ S·W/(sz.w·Z) = S·px2vb/Z.
            var sz = stageSize();
            var px2vbX = W / Math.max(1, sz.w);
            var px2vbY = H / Math.max(1, sz.h);
            var vwVB = W / Z;
            var vhVB = H / Z;

            var dx = cs.tx - cs.x;
            var dy = cs.ty - cs.y;

            // Dead zone: camera only moves when the target leaves the inner zone.
            var dzX = vwVB * CM.deadZoneX * 0.5;
            var dzY = vhVB * CM.deadZoneY * 0.5;
            var errX = 0, errY = 0;
            if (dx > dzX) errX = dx - dzX;
            else if (dx < -dzX) errX = dx + dzX;
            if (dy > dzY) errY = dy - dzY;
            else if (dy < -dzY) errY = dy + dzY;

            var idealX = cs.x + errX;
            var idealY = cs.y + errY;

            // Smooth damping toward the ideal position.
            var t = CM.damping;
            var nextX = cs.x + (idealX - cs.x) * t;
            var nextY = cs.y + (idealY - cs.y) * t;

            // Clamp step to avoid huge leaps on zoom changes etc.
            var maxStepX = CM.maxScreenSpeed * px2vbX / Z;
            var maxStepY = CM.maxScreenSpeed * px2vbY / Z;
            var stepX = nextX - cs.x;
            var stepY = nextY - cs.y;
            if (Math.abs(stepX) > maxStepX) nextX = cs.x + Math.sign(stepX) * maxStepX;
            if (Math.abs(stepY) > maxStepY) nextY = cs.y + Math.sign(stepY) * maxStepY;

            cs.x = nextX;
            cs.y = nextY;

            var pan = panToCameraCenter(cs.x, cs.y, Z);
            var c = clampPan(pan.px, pan.py, Z);
            compareState.mapPanX = c[0];
            compareState.mapPanY = c[1];

            if (compareState.__applyMapTransform) compareState.__applyMapTransform({ fromCamera: true });
            cs.rafId = requestAnimationFrame(tickCamera);
        }
        function startCameraLoop() {
            var cs = ensureCamState();
            if (cs.active) return;
            cs.active = true;
            tickCamera();
        }

        function applyMapTransform(opts) {
            if (!camera) return;
            var fromCamera = !!(opts && opts.fromCamera);
            var smooth = !!(opts && opts.smooth);
            camera.classList.toggle('tc-map-camera--smooth', smooth);
            var Z = compareState.mapZoom || 1;
            var px, py;
            if (fromCamera && compareState.__camState) {
                px = compareState.mapPanX;
                py = compareState.mapPanY;
            } else {
                // null pan → "auto-center for this zoom" (first draw, or reset).
                px = (compareState.mapPanX == null) ? defaultPanX(Z) : compareState.mapPanX;
                py = (compareState.mapPanY == null) ? defaultPanY(Z) : compareState.mapPanY;
            }
            var c = clampPan(px, py, Z);
            compareState.mapPanX = c[0];
            compareState.mapPanY = c[1];
            camera.style.transform = 'translate(' + c[0].toFixed(2) + 'px, ' + c[1].toFixed(2) + 'px) scale(' + Z.toFixed(3) + ')';
            stageEl.classList.toggle('tc-map-stage--zoomed', Z > 1.001);

            // Inverse-shrink everything that has a "size in screen pixels" so it
            // doesn't balloon at high zoom and hide the trajectory differences the
            // user is trying to compare. Lines/heat/dominance ride on CSS vars so
            // we update once on the stage instead of touching every SVG node.
            //   base · ratio^(Z-1), floored to keep things still visible at Z=20
            var lineW = Math.max(0.12, 1.5 * Math.pow(0.70, Z - 1));
            var heatW = Math.max(0.25, 3.0 * Math.pow(0.72, Z - 1));
            var domW = Math.max(0.35, 4.0 * Math.pow(0.72, Z - 1));
            stageEl.style.setProperty('--tc-map-line-w', lineW.toFixed(2));
            stageEl.style.setProperty('--tc-map-heat-w', heatW.toFixed(2));
            stageEl.style.setProperty('--tc-map-dominance-w', domW.toFixed(2));
            // Marker stroke shrinks with zoom so the team-colour fill dominates the
            // outline at the analytical zoom levels. Linear fade from 1.0 px (overview)
            // down to 0.15 px (high zoom) — the floor is near the practical minimum
            // a browser can rasterise for a non-scaling stroke before it disappears
            // into a half-transparent pixel row.
            var markerStroke = Math.max(0.15, 1 - (Z - 1) * 0.08);
            stageEl.style.setProperty('--tc-map-marker-stroke', markerStroke.toFixed(2));

            if (svgForCamera) {
                // Marker / event dots shrink with zoom — at max zoom the dot should
                // be just a position indicator, not the dominant visual element on
                // top of the (thin) trajectories.
                var carR = Math.max(0.20, 5 * Math.pow(0.70, Z - 1));
                var evR = Math.max(0.15, 4 * Math.pow(0.70, Z - 1));
                svgForCamera.querySelectorAll('.tc-map-marker').forEach(function (el) { el.setAttribute('r', carR.toFixed(2)); });
                svgForCamera.querySelectorAll('.tc-map-event circle').forEach(function (el) { el.setAttribute('r', evR.toFixed(2)); });
                // Loss badges scale on the same curve as event markers so the
                // numbered pins stay readable at full zoom without dominating the lines.
                var lossBadgeScale = Math.max(0.35, Math.pow(0.78, Z - 1));
                svgForCamera.querySelectorAll('.tc-map-loss-badge').forEach(function (g) {
                    var tx = (g.getAttribute('transform') || '').match(/translate\(([-\d.]+),([-\d.]+)\)/);
                    if (!tx) return;
                    g.setAttribute('transform', 'translate(' + tx[1] + ',' + tx[2] + ') scale(' + lossBadgeScale.toFixed(3) + ')');
                });
            }
        }
        function setMapZoom(newZoom, anchorViewBoxX, anchorViewBoxY) {
            newZoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, newZoom));
            var oldZoom = compareState.mapZoom || 1;
            if (Math.abs(newZoom - oldZoom) < 0.001) return;
            // Keep the viewBox point under the anchor cursor stationary on screen.
            // Derivation: for camera transform translate(tx,ty) scale(Z) with origin 0,0,
            //   stage_pixel = tx + viewBox_point * (stageW/W) * Z
            // Solve newTx so the same viewBox point lands on the same stage pixel:
            //   newTx = oldTx + anchor * (stageW/W) * (oldZ - newZ)
            var ax = (anchorViewBoxX != null) ? anchorViewBoxX : W / 2;
            var ay = (anchorViewBoxY != null) ? anchorViewBoxY : H / 2;
            var sz = stageSize();
            var scaleX = sz.w / W;
            var scaleY = sz.h / H;
            // Pan can still be null here (user hits +/− before having moved): treat
            // null as "centered for the old zoom" so the anchor math stays valid.
            var basePanX = (compareState.mapPanX == null) ? defaultPanX(oldZoom) : compareState.mapPanX;
            var basePanY = (compareState.mapPanY == null) ? defaultPanY(oldZoom) : compareState.mapPanY;
            compareState.mapPanX = basePanX + ax * scaleX * (oldZoom - newZoom);
            compareState.mapPanY = basePanY + ay * scaleY * (oldZoom - newZoom);
            compareState.mapZoom = newZoom;
            // When zooming out below 1×, recentre automatically so the whole track stays visible.
            if (newZoom < 1) {
                compareState.mapPanX = defaultPanX(newZoom);
                compareState.mapPanY = defaultPanY(newZoom);
            }
            syncCamStateFromPan();
            applyMapTransform({ smooth: true });
            persistState();
        }
        function resetMapView() {
            // Reset returns to the full-lap overview (Z=1). The closer initial default
            // (Z=3) is only applied on first load, not when the user hits reset.
            compareState.mapZoom = 1;
            compareState.mapPanX = 0;
            compareState.mapPanY = 0;
            stopCameraLoop();
            syncCamStateFromPan();
            applyMapTransform({ smooth: true });
            persistState();
        }
        // Recenter the camera so a viewBox point sits in the middle of the stage.
        // Used by the chart-driven hover sync to follow the cursor along the racing line.
        function panToFollow(sx, sy) {
            if (!compareState.mapFollow) return;
            var Z = compareState.mapZoom || 1;
            if (Z <= 1.001) return;
            var cs = ensureCamState();
            cs.tx = sx;
            cs.ty = sy;
            if (!cs.active) startCameraLoop();
        }
        // Expose follow helper so updateMapMarkers can invoke it.
        compareState.__mapFollow = panToFollow;
        compareState.__mapProject = project;
        compareState.__applyMapTransform = applyMapTransform;

        // Kill any RAF still ticking from a previous drawTrackMap entry. Layer
        // toggles call drawTrackMap → new closures, but the old tickCamera keeps
        // re-scheduling itself via cs.rafId and references the now-detached stageEl
        // (clientWidth → 0, dead zone collapses). Cancel first; we rebuild cs.x/y
        // from the current pan immediately after, so no continuity is lost.
        stopCameraLoop();
        syncCamStateFromPan();
        applyMapTransform();
        if (compareState.mapFollow && compareState.mapZoom > 1.001) {
            startCameraLoop();
        }

        // Wheel zoom anchored at cursor.
        stageEl.addEventListener('wheel', function (e) {
            e.preventDefault();
            var ctm = svgForCamera.getScreenCTM();
            if (!ctm) return;
            var pt = svgForCamera.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            var local = pt.matrixTransform(ctm.inverse());
            var factor = e.deltaY > 0 ? 0.85 : 1.18;
            setMapZoom((compareState.mapZoom || 1) * factor, local.x, local.y);
        }, { passive: false });

        // Toolbar buttons.
        host.querySelectorAll('.tc-map-zoom-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var action = btn.dataset.action;
                if (action === 'zoom-in') setMapZoom((compareState.mapZoom || 1) * 1.4);
                else if (action === 'zoom-out') setMapZoom((compareState.mapZoom || 1) / 1.4);
                else if (action === 'reset') resetMapView();
                else if (action === 'follow') {
                    compareState.mapFollow = !compareState.mapFollow;
                    btn.classList.toggle('active', compareState.mapFollow);
                    persistState();
                }
            });
        });

        // ---------- map → charts hover bridge ----------
        // Drag the cursor along the racing line on the map and the chart crosshair,
        // value chips and focus panel snap to the same lap distance.
        var stage = host.querySelector('.tc-map-stage');
        var svgEl = host.querySelector('.tc-map-svg');
        var hoverSource = refData || firstCmp;
        if (stage && svgEl && hoverSource && hoverSource.motion && hoverSource.motion.length > 1) {
            var hitPoints = hoverSource.motion.map(function (m) {
                var p = project(m.x, m.z);
                return { sx: p[0], sy: p[1], d: m.d };
            });
            var lastDispatchedD = -Infinity;
            var hoverActive = false;

            function findNearestPoint(localX, localY) {
                var bestIdx = -1, bestD2 = Infinity;
                for (var i = 0; i < hitPoints.length; i++) {
                    var dx = hitPoints[i].sx - localX;
                    var dy = hitPoints[i].sy - localY;
                    var d2 = dx * dx + dy * dy;
                    if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
                }
                return bestIdx >= 0 ? hitPoints[bestIdx] : null;
            }

            stage.addEventListener('mousemove', function (e) {
                // Don't intercept when hovering an event marker — they have their own click semantics.
                if (e.target && e.target.closest && e.target.closest('.tc-map-event')) return;
                var ctm = svgEl.getScreenCTM();
                if (!ctm) return;
                var pt = svgEl.createSVGPoint();
                pt.x = e.clientX; pt.y = e.clientY;
                var local = pt.matrixTransform(ctm.inverse());
                // Snap to the nearest point on the racing line regardless of distance —
                // any cursor position inside the map activates hover (no dead zone).
                var nearest = findNearestPoint(local.x, local.y);
                if (!nearest) return;
                if (!hoverActive) {
                    stage.classList.add('tc-map-stage--hover');
                    hoverActive = true;
                }
                if (Math.abs(nearest.d - lastDispatchedD) > 0.5) {
                    lastDispatchedD = nearest.d;
                    if (compareState.__hoverBridge) compareState.__hoverBridge.setDistance(nearest.d, 'map');
                }
            });

            stage.addEventListener('mouseleave', function () {
                if (hoverActive) {
                    stage.classList.remove('tc-map-stage--hover');
                    hoverActive = false;
                    if (compareState.__hoverBridge) compareState.__hoverBridge.clear();
                    lastDispatchedD = -Infinity;
                }
            });
        }
    }

    function buildDominanceLegend(drivers) {
        var pills = drivers.map(function (d) {
            return '<span class="tc-dom-pill" title="' + d.label + ' fastest in ' + d.pct + '% of lap segments">'
                + '<span class="tc-dom-swatch" style="background:' + d.color + '"></span>'
                + '<span class="tc-dom-label">' + d.label + '</span>'
                + '<span class="tc-dom-pct">' + d.pct + '%</span>'
                + '</span>';
        }).join('');
        return '<div class="tc-map-dom-legend" title="Track dominance — fastest driver per ~25 m segment">' + pills + '</div>';
    }

    function buildHeatLegend(sess, resolvedRef, lapData) {
        // Resolve which compare lap is driving the heat colours (it's the first
        // visible non-reference lap — same logic as drawTrackMap's firstCmp).
        var cmpLabel = '';
        if (window.HistoryDetail && window.HistoryDetail.state && window.HistoryDetail.state.driverSelection) {
            window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
                if (cmpLabel || !sel || sel.hidden) return;
                if (resolvedRef && Number(carIdx) === resolvedRef.carIdx) return;
                if (!lapData || !lapData.has(carIdx)) return;
                var driver = resolveCompareDriver(sess, carIdx, sel);
                var name = (driver && (driver.shortName || driver.name || driver.code)) || ('Car ' + carIdx);
                cmpLabel = escapeHtml(String(name)) + (sel.lap != null ? (' L' + sel.lap) : '');
            });
        }
        var refLabel = '';
        if (resolvedRef) {
            var refDriver = sess.drivers ? sess.drivers[resolvedRef.carIdx] : null;
            var rname = (refDriver && (refDriver.shortName || refDriver.name || refDriver.code)) || ('Car ' + resolvedRef.carIdx);
            refLabel = escapeHtml(String(rname)) + ' L' + resolvedRef.lap;
        }
        var ctx = (cmpLabel && refLabel) ? (cmpLabel + ' vs REF ' + refLabel) : 'compare vs REF';
        return '<div class="tc-map-heat-legend" title="Each segment of the racing line is coloured by how much time the compare lap gains or loses against the reference at that point.">'
            + '<span class="tc-heat-swatch tc-heat-swatch--fast"></span><span class="tc-heat-label">faster</span>'
            + '<span class="tc-heat-swatch tc-heat-swatch--slow"></span><span class="tc-heat-label">slower</span>'
            + '<span class="tc-heat-ctx">' + ctx + ' · max ±1.5 s</span>'
            + '</div>';
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
    function findEventIndex(samples, predicate) {
        for (var i = 1; i < samples.length; i++) if (predicate(samples[i - 1], samples[i])) return i;
        return -1;
    }
    function findMinIndex(samples, key, absMode) {
        if (!samples || !samples.length) return -1;
        var best = 0, bestVal = absMode ? Math.abs(samples[0][key] || 0) : (samples[0][key] || 0);
        for (var i = 1; i < samples.length; i++) {
            var v = absMode ? Math.abs(samples[i][key] || 0) : (samples[i][key] || 0);
            if (v < bestVal) { best = i; bestVal = v; }
        }
        return best;
    }
    function resolveMapSegmentClick(evt, meta) {
        var node = evt.target;
        if (node && node.closest('.tc-map-event')) return null;
        if (node && node.closest('.tc-map-loss, .tc-map-loss-badge')) return null;
        var svg = evt.currentTarget;
        var pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        var local = pt.matrixTransform(svg.getScreenCTM().inverse());
        var ratio = Math.min(1, Math.max(0, local.x / 360));
        var trackLen = (meta && meta.trackLengthM) || 0;
        var d = ratio * trackLen;
        var segments = buildSegmentBoundaries(meta, compareState.miniPerSector);
        return segments.find(function (s) { return d >= s.start && d <= s.end; }) || null;
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
                var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6';
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
            if (metricKey === 'drs') return dv === 0 ? '0' : (dv > 0 ? '+ON' : '-ON');
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
                var metricDef = metricByKey.get(metricKey);
                var y = 8;
                var hostH = chip.parentElement.clientHeight || 40;
                var plotH = Math.max(1, hostH - PAD_T - PAD_B);
                if (metricDef && pair.current) {
                    var yv;
                    if (metricKey === 'delta') yv = (pair.current.delta != null) ? pair.current.delta : 0;
                    else if (pair.current.sample) yv = pair.current.sample[metricKey] != null ? pair.current.sample[metricKey] : 0;
                    else yv = 0;
                    var pr = getYRange(metricKey);
                    var yNorm = (yv - pr.min) / Math.max(0.0001, pr.max - pr.min);
                    y = Math.max(2, Math.min(hostH - 18, PAD_T + (1 - yNorm) * plotH));
                }
                // Speed chip annexes a DRS state badge so the user can read "DRS open"
                // straight from the speed row — without scanning the dedicated DRS row.
                function drsTagFor(cmpOn, refOn, isPair) {
                    if (!cmpOn && !refOn) return '';
                    if (isPair) {
                        // In pair mode the tag piggy-backs on a per-driver row; the colour
                        // is meaningless there, so we use a neutral pill.
                        return cmpOn ? '<span class="tc-chip-drs tc-chip-drs--equal">DRS</span>' : '';
                    }
                    if (cmpOn && !refOn) return '<span class="tc-chip-drs tc-chip-drs--gain">DRS +</span>';
                    if (!cmpOn && refOn) return '<span class="tc-chip-drs tc-chip-drs--loss">DRS −</span>';
                    return '<span class="tc-chip-drs tc-chip-drs--equal">DRS</span>';
                }

                var rows = '';
                if (compareState.chipMode === 'diff') {
                    if (metricKey === 'delta') {
                        // Raw float subtraction was being dumped via String(...) — produced
                        // "0.6486164050141454" in the chip. Format to 3 dp with sign, matching
                        // formatChipValue's delta path so both chip modes look consistent.
                        var dv = ((pair.current && pair.current.delta) || 0) - ((pair.ref && pair.ref.delta) || 0);
                        rows = '<span class="tc-chip-ref">Δ</span><span class="tc-chip-val">'
                            + escapeHtml((dv >= 0 ? '+' : '') + dv.toFixed(3) + ' s') + '</span>';
                    } else if (metricKey === 'drs') {
                        // DRS is binary — "+ON / -ON / 0" was cryptic. Render a coloured tag
                        // that immediately conveys the diff state: cmp gained (green),
                        // cmp lost the wing (red), or both equal (neutral). When neither
                        // driver has DRS open the chip is hidden — nothing to compare.
                        var dCmpOn = !!(pair.current && pair.current.sample && pair.current.sample.drs);
                        var dRefOn = !!(pair.ref && pair.ref.sample && pair.ref.sample.drs);
                        if (!dCmpOn && !dRefOn) { chip.hidden = true; return; }
                        rows = drsTagFor(dCmpOn, dRefOn, false);
                    } else {
                        var diffText = formatMetricDiff(metricKey, pair.current && pair.current.sample, pair.ref && pair.ref.sample);
                        rows = '<span class="tc-chip-ref">Δ</span><span class="tc-chip-val">' + escapeHtml(diffText) + '</span>';
                        // Inline DRS badge on the Speed chip so the wing state is visible
                        // without consulting the separate DRS row.
                        if (metricKey === 'spd') {
                            var sCmpOn = !!(pair.current && pair.current.sample && pair.current.sample.drs);
                            var sRefOn = !!(pair.ref && pair.ref.sample && pair.ref.sample.drs);
                            rows += drsTagFor(sCmpOn, sRefOn, false);
                        }
                    }
                } else {
                    // One entry per selected lap so the chip reflects the comparison size, not just C/R.
                    rows = perDriver.map(function (pd) {
                        var dv = (metricKey === 'delta') ? pd.delta : null;
                        var text = formatChipValue(metricKey, pd.sample, dv);
                        // Per-driver DRS badge appended to the Speed row only.
                        var drsTag = (metricKey === 'spd') ? drsTagFor(!!(pd.sample && pd.sample.drs), false, true) : '';
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
                // Chip is absolute-positioned inside the row's SVG host; track the crosshair x.
                var chipHost = chip.parentElement;
                var hostW = chipHost.clientWidth;
                var chipW = chip.offsetWidth || 80;
                chip.style.left = Math.max(2, Math.min(hostW - chipW - 2, pct * hostW + 6)) + 'px';
                chip.style.top = y + 'px';
            });

            updateMapMarkers(d, lapData, sess);
            // Auto-follow only when the hover comes from a NON-map source (chart hover
            // or external). When the cursor is on the map itself, panning the camera
            // creates a feedback loop: every centre-on-marker move shifts the viewBox
            // point under the cursor, picks a new "nearest" sample, sets a new target,
            // pans again — the marker chases its tail away from the cursor. Skipping
            // the pan for map hover leaves the marker at its natural position (closest
            // racing-line point to the cursor), which visually tracks the mouse.
            if (lastHoverSource !== 'map' && compareState.__mapFollow && compareState.__mapProject) {
                var followIdx = (refCarIdx != null) ? refCarIdx
                    : (perDriver && perDriver[0] ? perDriver[0].carIdx : null);
                var followData = followIdx != null ? lapData.get(followIdx) : null;
                if (followData && followData.motion && followData.motion.length > 0) {
                    var fm = findClosestMotion(followData.motion, d);
                    if (fm) {
                        var fp = compareState.__mapProject(fm.x, fm.z);
                        compareState.__mapFollow(fp[0], fp[1]);
                    }
                }
            }
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
                lastHoverSource = source === 'map' ? 'map' : 'chart';
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
                if (source === 'map' && !inRange && span < trackLenAll - 1) {
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

    function renderFocusPanel(perDriver, distance, lateralOffset) {
        var host = document.getElementById('tcFocusPanel');
        if (!host) return;
        var ref = perDriver ? perDriver.find(function (x) { return x.isReference; }) : null;
        var compares = perDriver ? perDriver.filter(function (x) { return !x.isReference; }) : [];
        var hasAny = !!(ref || compares.length);

        // Grid header
        var colCount = 1 + (ref ? 1 : 0) + compares.length;
        var gridStyle = 'grid-template-columns: 56px repeat(' + (colCount - 1) + ', 1fr);';
        var headerHtml = '<div class="tc-focus-grid-header">Metric</div>';
        if (ref) {
            headerHtml += '<div class="tc-focus-grid-header" title="' + escapeHtml(ref.chipLabel || '') + '">' + escapeHtml(ref.chipShort || 'REF') + '</div>';
        }
        compares.forEach(function (cmp) {
            headerHtml += '<div class="tc-focus-grid-header" title="' + escapeHtml(cmp.chipLabel || '') + '">' + escapeHtml(cmp.chipShort || 'CMP') + '</div>';
        });

        var metrics = [
            { key: 'delta', label: 'Delta', fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(3); }, inv: true },
            { key: 'spd',   label: 'Speed', fmt: function (v) { return String(Math.round(v)); }, inv: true },
            { key: 'thr',   label: 'Thr',   fmt: function (v) { return Math.round(v) + '%'; }, inv: true },
            { key: 'brk',   label: 'Brk',   fmt: function (v) { return Math.round(v) + '%'; }, inv: false },
            { key: 'gr',    label: 'Gear',  fmt: function (v) { return String(Math.round(v)); }, inv: true },
            { key: 'rpm',   label: 'RPM',   fmt: function (v) { return Math.round(v).toLocaleString(); }, inv: true },
        ];

        var rowsHtml = '';
        if (lateralOffset != null) {
            rowsHtml += '<div class="tc-focus-grid-row">'
                + '<div class="tc-focus-grid-cell">Traj offset</div>'
                + (ref ? '<div class="tc-focus-grid-cell">—</div>' : '')
                + compares.map(function () { return '<div class="tc-focus-grid-cell">' + lateralOffset.toFixed(2) + ' m</div>'; }).join('')
                + '</div>';
        }
        metrics.forEach(function (m) {
            var cells = '<div class="tc-focus-grid-cell">' + m.label + '</div>';
            if (ref) {
                var rv = m.key === 'delta' ? (ref.delta || 0) : (ref.sample ? (ref.sample[m.key] || 0) : 0);
                cells += '<div class="tc-focus-grid-cell">' + (m.fmt ? m.fmt(rv) : rv) + '</div>';
            }
            compares.forEach(function (cmp) {
                var cv = m.key === 'delta' ? (cmp.delta || 0) : (cmp.sample ? (cmp.sample[m.key] || 0) : 0);
                var rv = m.key === 'delta' ? (ref.delta || 0) : (ref.sample ? (ref.sample[m.key] || 0) : 0);
                var diff = cv - rv;
                var trend = diff === 0 ? '→' : ((m.inv ? -diff : diff) < 0 ? '▲' : '▼');
                var cls = diff === 0 ? 'neutral' : ((m.inv ? -diff : diff) < 0 ? 'gain' : 'loss');
                cells += '<div class="tc-focus-grid-cell ' + cls + '">' + trend + ' ' + (m.fmt ? m.fmt(diff) : diff) + '</div>';
            });
            rowsHtml += '<div class="tc-focus-grid-row">' + cells + '</div>';
        });

        var subText = (distance == null ? 'Hover chart to inspect values' : ('d=' + Math.round(distance) + 'm'))
            + ' · Drag zoom · Shift-drag pan · Wheel zoom · Esc reset';

        host.innerHTML = ''
            + '<div class="tc-focus-head"><h4>Compare Focus</h4></div>'
            + '<div class="tc-focus-sub">' + subText + '</div>'
            + (hasAny ? '<div class="tc-focus-grid" style="' + gridStyle + '">' + headerHtml + rowsHtml + '</div>' : '');
    }

    function updateMapMarkers(targetD, lapData, sess) {
        var svg = document.querySelector('#tcMap svg');
        if (!svg || !lapData) return;
        var proj = createMapProjection(sess.meta.trackBoundsXZ);
        if (!proj) return;

        lapData.forEach(function (data, carIdx) {
            var marker = svg.querySelector('.tc-map-marker[data-car="' + carIdx + '"]');
            if (!marker || !data.motion || data.motion.length === 0) return;
            // Find closest motion sample by lapDistance.
            var best = data.motion[0];
            var bestDiff = Math.abs(best.d - targetD);
            for (var i = 1; i < data.motion.length; i++) {
                var diff = Math.abs(data.motion[i].d - targetD);
                if (diff < bestDiff) { best = data.motion[i]; bestDiff = diff; }
            }
            var p = proj.project(best.x, best.z);
            marker.setAttribute('cx', p[0]);
            marker.setAttribute('cy', p[1]);
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    window.TelemetryCompare = { render: render };
})();
