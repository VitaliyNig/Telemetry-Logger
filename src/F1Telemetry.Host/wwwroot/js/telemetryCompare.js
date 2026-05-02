// History Mode — Telemetry Compare page.
// Charts are hand-crafted inline SVG (no charting library, matching the existing Gap Ring /
// pedal-chart pattern). The whole stack shares a single X domain = lapDistance in metres so
// a vertical crosshair lines up across every metric and the track-map marker without any
// transform math.

(function () {
    'use strict';

    // Cached per-page state — lives for the duration of a detail-view open.
    var compareState = {
        zoomStart: null,   // metres; null = full lap
        zoomEnd: null,
        deltaMode: 'cumulative', // or 'sector'
        hiddenMetrics: new Set(),
        heightScale: 1.0,           // 0.75 | 1.0 | 1.4
        heightOverride: {},         // { metricKey: pixelsAtScale1 } from drag
        miniPerSector: 3,
        focusPinMode: false,
        focusPinned: null,
        insightsEnabled: true,
        brush: null,
        deltaSeriesCache: new Map(),
        hoverPerf: { enabled: false, lastLogTs: 0, samples: 0, hoverMs: 0, interpCount: 0 },
        chipMode: 'pair', // 'pair' | 'diff'
        mapLayers: { line: true, deltaHeat: true, events: true },

    };
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
            if (p.heightOverride && typeof p.heightOverride === 'object') compareState.heightOverride = p.heightOverride;
            if ([1, 3, 4].indexOf(Number(p.miniPerSector)) >= 0) compareState.miniPerSector = Number(p.miniPerSector);
            compareState.focusPinMode = !!p.focusPinMode;
            compareState.insightsEnabled = p.insightsEnabled !== false;
            if (p.chipMode === 'diff' || p.chipMode === 'pair') compareState.chipMode = p.chipMode;
            if (p.mapLayers && typeof p.mapLayers === 'object') {
                compareState.mapLayers = {
                    line: p.mapLayers.line !== false,
                    deltaHeat: p.mapLayers.deltaHeat !== false,
                    events: p.mapLayers.events !== false,
                };
            }
        } catch (e) { /* ignore corrupt storage */ }
    }

    function persistState() {
        try {
            localStorage.setItem(PERSIST_KEY, JSON.stringify({
                hiddenMetrics: Array.from(compareState.hiddenMetrics),
                heightScale: compareState.heightScale,
                heightOverride: compareState.heightOverride,
                miniPerSector: compareState.miniPerSector,
                focusPinMode: compareState.focusPinMode,
                insightsEnabled: compareState.insightsEnabled,
                chipMode: compareState.chipMode,
                mapLayers: compareState.mapLayers,
            }));
        } catch (e) { /* storage may be disabled */ }
    }

    loadPersistedState();
    compareState.hoverPerf.enabled = !!(window && window.location && /(?:\?|&)tcPerf=1(?:&|$)/.test(window.location.search || ''));

    function deltaCacheKey(carIdx, refCarIdx, xMin, xMax, mode, miniPerSector) {
        return [carIdx, refCarIdx, xMin.toFixed(3), xMax.toFixed(3), mode, miniPerSector].join('|');
    }

    function clearDeltaSeriesCache() {
        compareState.deltaSeriesCache.clear();
    }

    function createInterpContext() {
        return { interpCount: 0 };
    }

    function recordHoverPerf(durationMs, interpCount) {
        var perf = compareState.hoverPerf;
        if (!perf.enabled) return;
        perf.samples++;
        perf.hoverMs += durationMs;
        perf.interpCount += interpCount;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (now - perf.lastLogTs >= 1000) {
            var avgMs = perf.samples ? (perf.hoverMs / perf.samples) : 0;
            var avgInterp = perf.samples ? (perf.interpCount / perf.samples) : 0;
            console.debug('[tcPerf] hover avg=', avgMs.toFixed(2) + 'ms', 'interp/frame=', avgInterp.toFixed(1), 'frames=', perf.samples);
            perf.lastLogTs = now;
            perf.samples = 0;
            perf.hoverMs = 0;
            perf.interpCount = 0;
        }
    }

    var METRICS = [
        { key: 'delta', label: 'Δ (s)', plotTitle: 'DELTA', height: 70, getValue: null /* computed */, min: -1, max: 1 },
        { key: 'spd',   label: 'Speed (km/h)', plotTitle: 'SPEED', height: 70, min: 0, max: 370 },
        { key: 'thr',   label: 'Throttle', plotTitle: 'THROTTLE', height: 50, min: 0, max: 100 },
        { key: 'brk',   label: 'Brake', plotTitle: 'BRAKE', height: 50, min: 0, max: 100 },
        { key: 'str',   label: 'Steering', plotTitle: 'STEERING', height: 50, min: -100, max: 100 },
        { key: 'gr',    label: 'Gear', plotTitle: 'GEAR', height: 50, min: -1, max: 8 },
        { key: 'rpm',   label: 'RPM', plotTitle: 'RPM', height: 60, min: 0, max: 14000 },
        { key: 'ers',   label: 'ERS (%)', plotTitle: 'ERS', height: 60, min: 0, max: 100 },
        { key: 'drs',   label: 'DRS', plotTitle: 'DRS', height: 22, min: 0, max: 1, style: 'band' },
    ];

    var ERS_MODE_NAMES = ['None', 'Medium', 'Hotlap', 'Overtake'];
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
            +   '<div class="tc-side" id="tcSide" data-priority="secondary"></div>'
            +   '<div class="tc-main">'
            +     '<div class="tc-layer tc-layer-a tc-kpi-sticky" data-priority="primary">'
            +       '<div class="tc-sector-badges" id="tcBadges"></div>'
            +     '</div>'
            +     '<div class="tc-layer tc-layer-b" data-priority="primary">'
            +       '<div class="tc-charts" id="tcCharts"></div>'
            +     '</div>'
            +     '<div class="tc-layer tc-layer-c tc-compare-content" data-priority="secondary">'
            +       '<aside class="tc-focus" id="tcFocusPanel" data-priority="secondary"></aside>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-map tc-layer tc-layer-c" id="tcMap" data-priority="secondary"></div>'
            + '</div>';

        var side = body.querySelector('#tcSide');
        var picker = window.HistoryDetail.DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: true,
            compareCardMode: true,
            onChange: function () { reloadLapSamples().then(redraw); },
        });
        side.appendChild(picker);

        reloadLapSamples().then(redraw);
    }

    // Fetches samples for every selected driver/lap. Returns a Promise<Map<carIdx, {samples, motion}>>.
    function reloadLapSamples() {
        var hd = window.HistoryDetail;
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
            var out = new Map();
            entries.forEach(function (e) { out.set(e[0], e[1]); });
            return out;
        });
    }

    function redraw(lapData) {
        latestCompareLapData = lapData;
        clearDeltaSeriesCache();
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

        var html = '<div class="tc-controls-row">'
            + '<div class="tc-delta-toggle">'
            + '<button class="tc-mode ' + (compareState.deltaMode === 'cumulative' ? 'active' : '') + '" data-mode="cumulative">Δ cumulative</button>'
            + '<button class="tc-mode ' + (compareState.deltaMode === 'sector' ? 'active' : '') + '" data-mode="sector">Δ per-sector</button>'
            + '</div>'
            + '<div class="tc-segment-toggle">'
            + '<button class="tc-segment-mode ' + (compareState.miniPerSector === 1 ? 'active' : '') + '" data-mini="1">3</button>'
            + '<button class="tc-segment-mode ' + (compareState.miniPerSector === 3 ? 'active' : '') + '" data-mini="3">9</button>'
            + '<button class="tc-segment-mode ' + (compareState.miniPerSector === 4 ? 'active' : '') + '" data-mini="4">12</button>'
            + '</div>'
            + '</div>';
        // One badge per sector with inter-driver deltas.
        var resolvedRef = ensureReferenceSelection(lapData);
        var refIdx = resolvedRef ? resolvedRef.carIdx : null;
        var refDriverLap = refIdx != null ? sess.drivers[refIdx] : null;
        var refLap = null;
        if (refDriverLap) {
            var sel = window.HistoryDetail.state.driverSelection.get(refIdx);
            refLap = (refDriverLap.laps || []).find(function (l) { return l.lapNum === sel.lap; });
        }

        html += '<div class="tc-sector-groups">';
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
        html += '<button class="tc-badge tc-badge-reset" data-start="0" data-end="' + trackLen + '">Full Lap</button>';
        html += '<button class="tc-badge" data-action="reset-zoom">Reset Zoom</button>';
        html += '<button class="tc-badge" data-action="zoom-out-2x">Zoom Out 2x</button>';
        html += '</div>';

        // --- Second row: metric visibility chips + height presets + reset-heights. ---
        html += '<div class="tc-metrics-toolbar">';
        html += '<button class="tc-insights-toggle ' + (compareState.insightsEnabled ? 'active' : '') + '" data-action="insights">'
            + 'Insights ' + (compareState.insightsEnabled ? 'On' : 'Off') + '</button>';
        METRICS.forEach(function (m) {
            var pressed = !compareState.hiddenMetrics.has(m.key);
            html += '<button class="tc-metric-chip" data-key="' + m.key + '"'
                + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">'
                + escapeHtml(m.label) + '</button>';
        });
        html += '<span class="tc-toolbar-sep"></span>';
        html += '<button class="tc-size-chip tc-chip-mode ' + (compareState.chipMode === 'pair' ? 'active' : '') + '" data-chip-mode="pair">Chip: C/Ref</button>';
        html += '<button class="tc-size-chip tc-chip-mode ' + (compareState.chipMode === 'diff' ? 'active' : '') + '" data-chip-mode="diff">Chip: Δ</button>'; 
        [[0.75, 'Compact'], [1.0, 'Normal'], [1.4, 'Tall']].forEach(function (pair) {
            var active = Math.abs(compareState.heightScale - pair[0]) < 0.01;
            html += '<button class="tc-size-chip ' + (active ? 'active' : '') + '"'
                + ' data-scale="' + pair[0] + '">' + pair[1] + '</button>';
        });
        html += '<button class="tc-size-chip tc-reset-heights">Reset heights</button>';
        html += '</div>';
        if (compareState.insightsEnabled) {
            html += renderTopLossZones(lapData, sess);
        }
        host.innerHTML = html;

        host.querySelectorAll('.tc-badge').forEach(function (b) {
            b.addEventListener('click', function () {
                var action = b.dataset.action;
                if (action === 'reset-zoom') {
                    compareState.zoomStart = null;
                    compareState.zoomEnd = null;
                    redraw(lapData);
                    return;
                }
                if (action === 'zoom-out-2x') {
                    zoomOut2x();
                    redraw(lapData);
                    return;
                }
                var start = Number(b.dataset.start), end = Number(b.dataset.end);
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
        host.querySelectorAll('.tc-segment-mode').forEach(function (m) {
            m.addEventListener('click', function () {
                var next = Number(m.dataset.mini);
                if (next === compareState.miniPerSector) return;
                compareState.miniPerSector = next;
                compareState.zoomStart = null;
                compareState.zoomEnd = null;
                enforceMetricLimit();
                persistState();
                redraw(lapData);
            });
        });
        host.querySelectorAll('.tc-mode').forEach(function (m) {
            m.addEventListener('click', function () {
                compareState.deltaMode = m.dataset.mode;
                redraw(lapData);
            });
        });
        host.querySelectorAll('.tc-metric-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var key = chip.dataset.key;
                if (compareState.hiddenMetrics.has(key)) compareState.hiddenMetrics.delete(key);
                else compareState.hiddenMetrics.add(key);
                enforceMetricLimit();
                persistState();
                drawBadges(lapData);
                drawChartStack(lapData);
            });
        });
        host.querySelectorAll('.tc-chip-mode').forEach(function (btn) {
            btn.addEventListener('click', function () {
                compareState.chipMode = btn.dataset.chipMode === 'diff' ? 'diff' : 'pair';
                persistState();
                drawBadges(lapData);
            });
        });
        host.querySelectorAll('.tc-size-chip[data-scale]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                compareState.heightScale = Number(btn.dataset.scale);
                persistState();
                drawBadges(lapData);
                drawChartStack(lapData);
            });
        });
        var resetBtn = host.querySelector('.tc-reset-heights');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                compareState.heightOverride = {};
                persistState();
                drawChartStack(lapData);
            });
        }
        var insightsBtn = host.querySelector('.tc-insights-toggle');
        if (insightsBtn) {
            insightsBtn.addEventListener('click', function () {
                compareState.insightsEnabled = !compareState.insightsEnabled;
                persistState();
                drawBadges(lapData);
            });
        }
    }

    function renderTopLossZones(lapData, sess) {
        var zones = detectTopLossZones(lapData, sess, 3);
        if (!zones.length) return '<div class="tc-insights-empty">Top Loss Zones: not enough comparable data.</div>';
        var html = '<div class="tc-insights"><div class="tc-insights-title">Top Loss Zones</div>';
        zones.forEach(function (z, i) {
            html += '<div class="tc-loss-zone">'
                + '<button class="tc-loss-jump tc-badge" data-start="' + z.start + '" data-end="' + z.end + '">#' + (i + 1) + ' '
                + Math.round(z.start) + '–' + Math.round(z.end) + 'm</button>'
                + '<div class="tc-loss-meta">Δ +' + z.loss.toFixed(3) + 's · ' + escapeHtml(z.cause) + '</div>'
                + '<div class="tc-loss-tip">' + escapeHtml(z.recommendation) + '</div>'
                + '</div>';
        });
        html += '</div>';
        return html;
    }

    function detectTopLossZones(lapData, sess, topN) {
        var refSel = ensureReferenceSelection(lapData);
        if (!refSel) return [];
        var entries = Array.from(window.HistoryDetail.state.driverSelection.entries()).filter(function (kv) {
            return kv[1] && !kv[1].hidden;
        });
        var cmpEntry = entries.find(function (kv) { return Number(kv[0]) !== refSel.carIdx; });
        if (!cmpEntry) return [];
        var cmpData = lapData.get(cmpEntry[0]);
        var refData = lapData.get(refSel.carIdx);
        if (!cmpData || !refData) return [];
        var deltaSeries = getDeltaSeriesForRange(cmpEntry[0], refSel.carIdx, cmpData.samples, refData.samples, 0, Number.MAX_SAFE_INTEGER, sess);
        if (deltaSeries.length < 4) return [];
        var zones = [];
        var start = null;
        for (var i = 1; i < deltaSeries.length; i++) {
            var slope = deltaSeries[i].v - deltaSeries[i - 1].v;
            if (slope > 0.015 && start == null) start = i - 1;
            if ((slope <= 0 || i === deltaSeries.length - 1) && start != null) {
                var end = i;
                if (end - start >= 2) zones.push(buildZoneInsight(start, end, deltaSeries, cmpData.samples, refData.samples));
                start = null;
            }
        }
        zones.sort(function (a, b) { return b.loss - a.loss; });
        return zones.slice(0, topN);
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

    function buildZoneInsight(i0, i1, deltaSeries, cmpSamples, refSamples) {
        var start = deltaSeries[i0].d, end = deltaSeries[i1].d;
        var loss = Math.max(0, deltaSeries[i1].v - deltaSeries[i0].v);
        var cmpA = interpAtDistance(cmpSamples, start), cmpB = interpAtDistance(cmpSamples, end);
        var refA = interpAtDistance(refSamples, start), refB = interpAtDistance(refSamples, end);
        var avgCmpBrake = avgMetric(cmpSamples, start, end, 'brk');
        var avgRefBrake = avgMetric(refSamples, start, end, 'brk');
        var thrVar = metricVariance(cmpSamples, start, end, 'thr');
        var minCmpSpd = minMetric(cmpSamples, start, end, 'spd');
        var minRefSpd = minMetric(refSamples, start, end, 'spd');
        var exitThrCmp = avgMetric(cmpSamples, Math.max(start, end - 80), end, 'thr');
        var exitThrRef = avgMetric(refSamples, Math.max(start, end - 80), end, 'thr');
        var cause = 'mixed execution';
        var recommendation = 'Стабилизируйте траекторию и педали в этом отрезке.';
        if ((avgCmpBrake + 8) < avgRefBrake) {
            cause = 'поздний тормоз';
            recommendation = 'Начинайте торможение чуть раньше и плавнее нарастанием усилия.';
        } else if (thrVar > 220 || avgMetric(cmpSamples, start, end, 'thr') < avgMetric(refSamples, start, end, 'thr') - 10) {
            cause = 'ранний/рваный газ';
            recommendation = 'Подавайте газ позже, но ровнее: меньше пиков и сбросов дросселя.';
        } else if (minCmpSpd + 4 < minRefSpd) {
            cause = 'низкая min speed';
            recommendation = 'Сфокусируйтесь на большей скорости в апексе: мягче отпуск тормоза и шире дуга.';
        } else if (exitThrCmp + 8 < exitThrRef || (cmpB.spd + 6 < refB.spd)) {
            cause = 'плохой exit';
            recommendation = 'Раньше раскрывайте руль на выходе и ускоряйтесь прогрессивно.';
        }
        return { start: start, end: end, loss: loss, cause: cause, recommendation: recommendation };
    }

    function avgMetric(samples, start, end, key) {
        var vals = samples.filter(function (s) { return s.d >= start && s.d <= end; }).map(function (s) { return Number(s[key] || 0); });
        if (!vals.length) return 0;
        return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }
    function minMetric(samples, start, end, key) {
        var vals = samples.filter(function (s) { return s.d >= start && s.d <= end; }).map(function (s) { return Number(s[key] || 0); });
        if (!vals.length) return 0;
        return Math.min.apply(null, vals);
    }
    function metricVariance(samples, start, end, key) {
        var vals = samples.filter(function (s) { return s.d >= start && s.d <= end; }).map(function (s) { return Number(s[key] || 0); });
        if (vals.length < 2) return 0;
        var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        return vals.reduce(function (acc, v) { var d = v - mean; return acc + d * d; }, 0) / vals.length;
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
        var base = compareState.heightOverride[m.key] != null
            ? compareState.heightOverride[m.key]
            : m.height;
        var scaled = Math.max(18, Math.round(base * compareState.heightScale));
        return getMetricPriority(m.key) === 'secondary' ? Math.max(18, Math.round(scaled * 0.75)) : scaled;
    }

    function drawChartStack(lapData) {
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
        visibleMetrics.forEach(function (m) {
            var h = effectiveHeight(m);
            var priority = getMetricPriority(m.key);
            html += '<div class="tc-chart-row" data-priority="' + priority + '" data-metric="' + m.key + '" style="--tc-row-h:' + h + 'px">'
                + '<div class="tc-chart-label tc-chart-label--rail" role="presentation"></div>'
                + '<div class="tc-chart-svg-host"></div>'
                + '<div class="tc-resize-handle" data-metric="' + m.key + '" title="Drag to resize"></div>'
                + '</div>';
        });
        // Hover overlay spans the entire stack.
        html += '<div class="tc-hover-layer" id="tcHoverLayer">'
             + '<div class="tc-crosshair" id="tcCrosshair"></div>'
             + '<div class="tc-brush" id="tcBrush"></div>'
             + '</div>';
        html += '<div class="tc-overview" id="tcOverview"><div class="tc-overview-window" id="tcOverviewWin"></div></div>';
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

        wireResizeHandles(host, lapData);
        wireHover(host, lapData, selections, refSamples, refIdx, xMin, xMax, sess);
        bindCompareShortcuts();
    }

    function bindCompareShortcuts() {
        if (shortcutsBound) return;
        shortcutsBound = true;
        document.addEventListener('keydown', function (e) {
            if ((e.key || '').toLowerCase() !== 'r') return;
            if (e.target && (/input|textarea|select/i).test(e.target.tagName || '')) return;
            if (!latestCompareLapData || !document.getElementById('tcCharts')) return;
            compareState.zoomStart = null;
            compareState.zoomEnd = null;
            redraw(latestCompareLapData);
        });
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

    // Mouse-drag on the bottom edge of a row changes compareState.heightOverride[key].
    function wireResizeHandles(host, lapData) {
        host.querySelectorAll('.tc-resize-handle').forEach(function (h) {
            h.addEventListener('mousedown', function (ev) {
                ev.preventDefault();
                var key = h.dataset.metric;
                var row = h.parentElement;
                var svgHost = row.querySelector('.tc-chart-svg-host');
                var startY = ev.clientY;
                var startH = svgHost.getBoundingClientRect().height;

                function onMove(e) {
                    var deltaPx = e.clientY - startY;
                    var newH = Math.max(18, Math.round(startH + deltaPx));
                    // Store as "pixels at scale 1" so scale presets still compose correctly.
                    compareState.heightOverride[key] = newH / Math.max(0.01, compareState.heightScale);
                    svgHost.style.height = newH + 'px';
                    row.style.setProperty('--tc-row-h', newH + 'px');
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    persistState();
                    drawChartStack(lapData);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });
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
        maxAbs = Math.min(2, Math.max(0.05, maxAbs * 1.08));
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

    function renderChartSvg(metric, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess, H) {
        var W = 900;
        var PAD_T = 4, PAD_B = 16;
        var plotH = H - PAD_T - PAD_B;
        var idSuffix = '-' + String(metric.key || 'm').replace(/[^a-z0-9_-]/gi, '');
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

        // ---- DRS band row: filled blocks where drs===1, no polyline. ----
        if (metric.style === 'band' && metric.key === 'drs') {
            var bandSvg = '';
            if (refDriverSamples) {
                runLengthRuns(refDriverSamples, 'drs', xMin, xMax).forEach(function (r) {
                    if (r.v !== 1) return;
                    var x0 = Math.max(0, x(Math.max(r.from, xMin)));
                    var x1 = Math.min(W, x(Math.min(r.to, xMax)));
                    if (x1 <= x0) return;
                    bandSvg += '<rect class="tc-drs-block" x="' + x0 + '" y="' + PAD_T
                        + '" width="' + (x1 - x0) + '" height="' + plotH + '"/>';
                });
            }
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

        // ---- Speed row: faint DRS overlay under the polylines. ----
        var speedDrsOverlay = '';
        if (metric.key === 'spd' && refDriverSamples) {
            runLengthRuns(refDriverSamples, 'drs', xMin, xMax).forEach(function (r) {
                if (r.v !== 1) return;
                var x0 = Math.max(0, x(Math.max(r.from, xMin)));
                var x1 = Math.min(W, x(Math.min(r.to, xMax)));
                if (x1 <= x0) return;
                speedDrsOverlay += '<rect class="tc-drs-overlay" x="' + x0 + '" y="' + PAD_T
                    + '" width="' + (x1 - x0) + '" height="' + plotH + '"/>';
            });
        }

        var lines = '';
        var compareSeriesCount = 0;
        selections.forEach(function (kv) {
            var carIdx = kv[0];
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.samples) return;
            var driver = resolveCompareDriver(sess, carIdx, kv[1]);
            var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';

            var values;
            if (metric.key === 'delta') {
                if (!refSamples) return;
                values = getDeltaSeriesForRange(carIdx, refCarIdx, d.samples, refSamples, xMin, xMax, sess);
            } else {
                values = d.samples.map(function (s) { return { d: s.d, v: s[metric.key] || 0 }; });
            }
            if (metric.key !== 'delta') values = values.filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
            if (values.length === 0) return;

            var pts = values.map(function (pt) {
                var yv = PAD_T + plotH - (pt.v - vMinPlot) / Math.max(0.0001, vMaxPlot - vMinPlot) * plotH;
                return x(pt.d) + ',' + yv;
            });
            var roleClass = 'tc-line tc-line-extra';
            if (carIdx === refCarIdx) roleClass = 'tc-line tc-line-ref';
            else if (compareSeriesCount === 0) roleClass = 'tc-line tc-line-current';
            var markerAttr = roleClass.indexOf('tc-line-ref') >= 0 ? ' marker-mid="url(#tcMarkerRef' + idSuffix + ')"' :
                (roleClass.indexOf('tc-line-current') >= 0 ? ' marker-mid="url(#tcMarkerCurrent' + idSuffix + ')"' : ' marker-mid="url(#tcMarkerExtra' + idSuffix + ')"');
            lines += '<polyline class="' + roleClass + '" stroke="' + color + '" points="' + pts.join(' ') + '"' + markerAttr + '/>';
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

        var defs = '<defs>'
            + '<marker id="tcMarkerRef' + idSuffix + '" markerWidth="4" markerHeight="4" refX="2" refY="2"><circle cx="2" cy="2" r="1" class="tc-line-marker-ref"/></marker>'
            + '<marker id="tcMarkerCurrent' + idSuffix + '" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5"><rect x="1" y="1" width="3" height="3" class="tc-line-marker-current"/></marker>'
            + '<marker id="tcMarkerExtra' + idSuffix + '" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5"><path d="M1 2.5 L4 2.5 M2.5 1 L2.5 4" class="tc-line-marker-extra"/></marker>'
            + '<pattern id="tcPatternRef' + idSuffix + '" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" class="tc-line-pattern-ref"/></pattern>'
            + '<pattern id="tcPatternCurrent' + idSuffix + '" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.7" class="tc-line-pattern-current"/></pattern>'
            + '<pattern id="tcPatternExtra' + idSuffix + '" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6" class="tc-line-pattern-extra"/></pattern>'
            + '</defs>';
        return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
            + defs + gridPack.grid + ersBg + speedDrsOverlay + sectorMarkers + lines + gridPack.yLabels + insetTitle + '</svg>';
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

    function drawTrackMap(lapData) {
        var host = document.getElementById('tcMap');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var bounds = sess.meta.trackBoundsXZ;

        var W = 360, H = 360;
        if (!bounds) {
            host.innerHTML = '<div class="tc-map-empty">No motion data yet.</div>';
            return;
        }
        var xRange = bounds.maxX - bounds.minX;
        var zRange = bounds.maxZ - bounds.minZ;
        var scale = Math.min(W / Math.max(1, xRange), H / Math.max(1, zRange)) * 0.9;
        var offsetX = (W - xRange * scale) / 2 - bounds.minX * scale;
        var offsetY = (H - zRange * scale) / 2 - bounds.minZ * scale;

        function project(x, z) { return [x * scale + offsetX, z * scale + offsetY]; }

        var lines = '';
        var heatSegments = '';
        var markers = '';
        var eventMarkers = '';
        var resolvedRef = ensureReferenceSelection(lapData);
        var refData = resolvedRef ? lapData.get(resolvedRef.carIdx) : null;
        var firstCmp = null;
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            if (!sel || sel.hidden) return;
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.motion || d.motion.length === 0) return;
            if (!firstCmp && resolvedRef && Number(carIdx) !== resolvedRef.carIdx) firstCmp = d;
            var sourceCarIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
            var driver = sess.drivers[sourceCarIdx];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';
            var pts = d.motion.map(function (m) {
                var p = project(m.x, m.z);
                return p[0] + ',' + p[1];
            });
            lines += '<polyline class="tc-map-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
            var first = project(d.motion[0].x, d.motion[0].z);
            markers += '<circle class="tc-map-marker" data-car="' + carIdx + '" cx="' + first[0]
                + '" cy="' + first[1] + '" r="5" fill="' + color + '"/>';
        });
        if (compareState.mapLayers.deltaHeat && refData && firstCmp && refData.motion && firstCmp.motion) {
            for (var i = 1; i < firstCmp.motion.length; i++) {
                var a = firstCmp.motion[i - 1], b = firstCmp.motion[i];
                var refA = interpAtDistance(refData.samples || [], a.d);
                var cmpA = interpAtDistance(firstCmp.samples || [], a.d);
                if (!refA || !cmpA) continue;
                var delta = cmpA.t - refA.t;
                var t = Math.min(1, Math.abs(delta) / 1.5);
                var colorHeat = delta >= 0
                    ? ('rgb(255,' + Math.round(170 * (1 - t)) + ',' + Math.round(40 * (1 - t)) + ')')
                    : ('rgb(' + Math.round(30 * (1 - t)) + ',' + Math.round(180 + 70 * t) + ',255)');
                var p1 = project(a.x, a.z), p2 = project(b.x, b.z);
                heatSegments += '<line class="tc-map-heat" x1="' + p1[0] + '" y1="' + p1[1]
                    + '" x2="' + p2[0] + '" y2="' + p2[1] + '" stroke="' + colorHeat + '"/>';
            }
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
            +   '<object class="tc-map-outline" type="image/svg+xml" data="' + svgUrl + '"></object>'
            +   '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tc-map-svg" preserveAspectRatio="xMidYMid meet">'
            +     heatSegments + (compareState.mapLayers.line ? lines : '') + markers + eventMarkers
            +   '</svg>'
            + '</div>'
            + '<div class="tc-map-caption">Track map'
            +   '<span class="tc-map-filters">'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.line ? 'active' : '') + '" data-layer="line">Line</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.deltaHeat ? 'active' : '') + '" data-layer="deltaHeat">Delta Heat</button>'
            +     '<button class="tc-map-filter ' + (compareState.mapLayers.events ? 'active' : '') + '" data-layer="events">Events</button>'
            +   '</span></div>';
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
        host.querySelector('.tc-map-svg').addEventListener('click', function (e) {
            var seg = resolveMapSegmentClick(e, sess.meta);
            if (!seg) return;
            compareState.zoomStart = seg.start;
            compareState.zoomEnd = seg.end;
            redraw(lapData);
        });
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
        var lastHoverDistance = null;
        var lastHoverSignature = null;
        var brushStartPx = null;
        var brushEl = overlay.querySelector('.tc-brush');
        var overviewWin = host.querySelector('#tcOverviewWin');
        var overview = host.querySelector('#tcOverview');

        // Pre-compute per-driver interp sample + color + delta series at hover time.
        function resolvePerDriver(d, interpCtx) {
            var compareOrdinal = 0;
            return selections.map(function (kv) {
                var carIdx = kv[0];
                var data = lapData && lapData.get(carIdx);
                if (!data || !data.samples) return null;
                var driver = resolveCompareDriver(sess, carIdx, kv[1]);
                var color = (driver && typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';
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
                return { carIdx: carIdx, color: color, sample: sample, delta: deltaVal, isReference: carIdx === refCarIdx, chipLabel: chipLabel };
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
            var perfStart = (window.performance && performance.now) ? performance.now() : Date.now();
            var interpCtx = createInterpContext();
            var rect = overlay.getBoundingClientRect();
            var pct = Math.max(0, Math.min(1, lastX / rect.width));
            var d = xMin + pct * (xMax - xMin);
            if (lastHoverDistance != null && Math.abs(lastHoverDistance - d) < 0.0001) return;
            lastHoverDistance = d;
            crosshair.style.left = (pct * 100) + '%';

            var perDriver = resolvePerDriver(d, interpCtx);
            var pair = resolveHoverPair(perDriver);
            var signature = perDriver.map(function (pd) {
                return pd.carIdx + ':' + findNearestSampleIndex((lapData.get(pd.carIdx) || {}).samples, d);
            }).join('|');
            if (signature === lastHoverSignature) return;
            lastHoverSignature = signature;

            var rangeCache = new Map();
            function getYRange(mk) {
                if (rangeCache.has(mk)) return rangeCache.get(mk);
                var mdef = metricByKey.get(mk);
                var r = mdef ? computePlotValueRange(mdef, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess) : { min: 0, max: 1 };
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
                var rows = '';
                if (compareState.chipMode === 'diff') {
                    var diff = metricKey === 'delta'
                        ? ((pair.current && pair.current.delta) || 0) - ((pair.ref && pair.ref.delta) || 0)
                        : formatMetricDiff(metricKey, pair.current && pair.current.sample, pair.ref && pair.ref.sample);
                    rows = '<span class="tc-chip-ref">Δ</span><span class="tc-chip-val">' + escapeHtml(String(diff)) + '</span>';
                } else {
                    var cText = formatChipValue(metricKey, pair.current && pair.current.sample, metricKey === 'delta' ? (pair.current && pair.current.delta) : null);
                    var rText = formatChipValue(metricKey, pair.ref && pair.ref.sample, metricKey === 'delta' ? (pair.ref && pair.ref.delta) : null);
                    rows = '<span class="tc-chip-dot" style="background:' + (pair.current ? pair.current.color : '#bbb') + '"></span>'
                        + '<span class="tc-chip-ref">C</span><span class="tc-chip-val">' + escapeHtml(cText) + '</span>'
                        + '<span class="tc-chip-sep"></span>'
                        + '<span class="tc-chip-dot" style="background:' + (pair.ref ? pair.ref.color : '#bbb') + '"></span>'
                        + '<span class="tc-chip-ref">R</span><span class="tc-chip-val">' + escapeHtml(rText) + '</span>';
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
            renderFocusPanel(perDriver, d);
            var elapsed = ((window.performance && performance.now) ? performance.now() : Date.now()) - perfStart;
            recordHoverPerf(elapsed, interpCtx.interpCount || 0);
        }

        overlay.addEventListener('mousemove', function (e) {
            var rect = overlay.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            if (!scheduled) {
                scheduled = true;
                rafToken = requestAnimationFrame(update);
            }
        });
        overlay.addEventListener('mouseleave', function () {
            if (rafToken) cancelAnimationFrame(rafToken);
            rafToken = 0;
            scheduled = false;
            crosshair.style.left = '-9999px';
            chips.forEach(function (chip) { chip.hidden = true; });
            if (!compareState.focusPinned) renderFocusPanel([], null);
        });
        overlay.addEventListener('click', function (e) {
            if (!compareState.focusPinMode) return;
            var rect = overlay.getBoundingClientRect();
            var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            var d = xMin + pct * (xMax - xMin);
            var perDriver = resolvePerDriver(d);
            if (!compareState.focusPinned) compareState.focusPinned = { base: perDriver, baseDistance: d };
            else compareState.focusPinned = { base: compareState.focusPinned.base, baseDistance: compareState.focusPinned.baseDistance, compare: perDriver, compareDistance: d };
            renderFocusPanel(perDriver, d);
        });
        overlay.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var rect = overlay.getBoundingClientRect();
            brushStartPx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            compareState.brush = { start: brushStartPx, end: brushStartPx };
            updateBrushVisual();
            document.addEventListener('mousemove', onBrushMove);
            document.addEventListener('mouseup', onBrushUp);
        });
        function onBrushMove(e) {
            if (brushStartPx == null) return;
            var rect = overlay.getBoundingClientRect();
            var px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            compareState.brush.end = px;
            updateBrushVisual();
        }
        function onBrushUp() {
            document.removeEventListener('mousemove', onBrushMove);
            document.removeEventListener('mouseup', onBrushUp);
            brushStartPx = null;
            if (!compareState.brush) return;
            var rect = overlay.getBoundingClientRect();
            var x0 = Math.min(compareState.brush.start, compareState.brush.end);
            var x1 = Math.max(compareState.brush.start, compareState.brush.end);
            var minPx = 5;
            if (x1 - x0 >= minPx && rect.width > 1) {
                var n0 = x0 / rect.width, n1 = x1 / rect.width;
                compareState.zoomStart = xMin + n0 * (xMax - xMin);
                compareState.zoomEnd = xMin + n1 * (xMax - xMin);
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
        }
        updateOverviewWindow();
        renderFocusPanel([], null);
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

    function renderFocusPanel(perDriver, distance) {
        var host = document.getElementById('tcFocusPanel');
        if (!host) return;
        var hasLive = perDriver && perDriver.length > 1;
        var ref = hasLive ? perDriver[0] : null;
        var cmp = hasLive ? perDriver[1] : null;
        var diffs = ref && cmp ? {
            delta: (cmp.delta || 0),
            spd: (cmp.sample.spd || 0) - (ref.sample.spd || 0),
            thr: (cmp.sample.thr || 0) - (ref.sample.thr || 0),
            brk: (cmp.sample.brk || 0) - (ref.sample.brk || 0),
            gr: (cmp.sample.gr || 0) - (ref.sample.gr || 0),
            rpm: (cmp.sample.rpm || 0) - (ref.sample.rpm || 0),
        } : null;
        function row(label, val, inverse) {
            if (val == null) return '<div class="tc-focus-row"><span>' + label + '</span><strong>—</strong></div>';
            var trend = val === 0 ? '→' : ((inverse ? -val : val) < 0 ? '▲' : '▼');
            var cls = val === 0 ? 'neutral' : ((inverse ? -val : val) < 0 ? 'gain' : 'loss');
            return '<div class="tc-focus-row ' + cls + '"><span>' + label + '</span><strong>' + trend + ' ' + (val >= 0 ? '+' : '') + val.toFixed(2) + '</strong></div>';
        }
        var pin = compareState.focusPinned;
        host.innerHTML = ''
            + '<div class="tc-focus-head"><h4>Compare Focus</h4><button class="tc-pin-btn ' + (compareState.focusPinMode ? 'active' : '') + '" data-act="pin">Pin</button></div>'
            + '<div class="tc-focus-sub">' + (distance == null ? 'Hover chart to inspect' : ('d=' + Math.round(distance) + 'm')) + '</div>'
            + row('Delta', diffs ? diffs.delta : null, true)
            + row('Speed diff', diffs ? diffs.spd : null, true)
            + row('Throttle diff', diffs ? diffs.thr : null, true)
            + row('Brake diff', diffs ? diffs.brk : null, false)
            + row('Gear diff', diffs ? diffs.gr : null, true)
            + row('RPM diff', diffs ? diffs.rpm : null, true)
            + '<div class="tc-focus-pin-state">' + (pin ? 'Pinned: ' + Math.round(pin.baseDistance) + 'm' + (pin.compareDistance != null ? (' vs ' + Math.round(pin.compareDistance) + 'm') : '') : 'Pin mode: click chart to lock up to two points') + '</div>';
        var pinBtn = host.querySelector('.tc-pin-btn');
        if (pinBtn) {
            pinBtn.addEventListener('click', function () {
                compareState.focusPinMode = !compareState.focusPinMode;
                if (!compareState.focusPinMode) compareState.focusPinned = null;
                persistState();
                renderFocusPanel(perDriver, distance);
            });
        }
    }

    function updateMapMarkers(targetD, lapData, sess) {
        var svg = document.querySelector('#tcMap svg');
        if (!svg || !lapData) return;
        var bounds = sess.meta.trackBoundsXZ;
        if (!bounds) return;
        var W = 360, H = 360;
        var xRange = bounds.maxX - bounds.minX;
        var zRange = bounds.maxZ - bounds.minZ;
        var scale = Math.min(W / Math.max(1, xRange), H / Math.max(1, zRange)) * 0.9;
        var offsetX = (W - xRange * scale) / 2 - bounds.minX * scale;
        var offsetY = (H - zRange * scale) / 2 - bounds.minZ * scale;

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
            marker.setAttribute('cx', best.x * scale + offsetX);
            marker.setAttribute('cy', best.z * scale + offsetY);
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    window.TelemetryCompare = { render: render };
})();
