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
    };

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
            }));
        } catch (e) { /* storage may be disabled */ }
    }

    loadPersistedState();

    var METRICS = [
        { key: 'delta', label: 'Δ (s)', height: 70, getValue: null /* computed */, min: -1, max: 1 },
        { key: 'spd',   label: 'Speed (km/h)', height: 70, min: 0, max: 370 },
        { key: 'thr',   label: 'Throttle', height: 50, min: 0, max: 100 },
        { key: 'brk',   label: 'Brake', height: 50, min: 0, max: 100 },
        { key: 'str',   label: 'Steering', height: 50, min: -100, max: 100 },
        { key: 'gr',    label: 'Gear', height: 50, min: -1, max: 8 },
        { key: 'rpm',   label: 'RPM', height: 60, min: 0, max: 14000 },
        { key: 'ers',   label: 'ERS (%)', height: 60, min: 0, max: 100 },
        { key: 'drs',   label: 'DRS', height: 22, min: 0, max: 1, style: 'band' },
    ];

    var ERS_MODE_NAMES = ['None', 'Medium', 'Hotlap', 'Overtake'];
    var ERS_MODE_TAGS = ['', 'MED', 'HOT', 'OT'];

    // Y-axis min/max labels per metric. Compact so they don't eat plot space.
    var AXIS_LABELS = {
        delta: { max: '+1s',  min: '-1s'  },
        spd:   { max: '370',  min: '0'    },
        thr:   { max: '100%', min: '0%'   },
        brk:   { max: '100%', min: '0%'   },
        str:   { max: '+100', min: '-100' },
        gr:    { max: '8',    min: 'R'    },
        rpm:   { max: '14k',  min: '0'    },
        ers:   { max: '100%', min: '0%'   },
    };

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
            +   '<div class="tc-side" id="tcSide"></div>'
            +   '<div class="tc-main">'
            +     '<div class="tc-sector-badges" id="tcBadges"></div>'
            +     '<div class="tc-compare-content">'
            +       '<div class="tc-charts" id="tcCharts"></div>'
            +       '<aside class="tc-focus" id="tcFocusPanel"></aside>'
            +     '</div>'
            +   '</div>'
            +   '<div class="tc-map" id="tcMap"></div>'
            + '</div>';

        var side = body.querySelector('#tcSide');
        var picker = window.HistoryDetail.DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: true,
            onChange: function () { reloadLapSamples().then(redraw); },
        });
        side.appendChild(picker);

        reloadLapSamples().then(redraw);
    }

    // Fetches samples for every selected driver/lap. Returns a Promise<Map<carIdx, {samples, motion}>>.
    function reloadLapSamples() {
        var hd = window.HistoryDetail;
        var selections = Array.from(hd.state.driverSelection.entries()).filter(function (kv) {
            return kv[1] && kv[1].lap != null;
        });
        var promises = selections.map(function (kv) {
            var carIdx = kv[0], lap = kv[1].lap;
            return hd.fetchLapSamples(carIdx, lap).then(function (data) {
                return [carIdx, data];
            });
        });
        return Promise.all(promises).then(function (entries) {
            var out = new Map();
            entries.forEach(function (e) { out.set(e[0], e[1]); });
            return out;
        });
    }

    function redraw(lapData) {
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
            if (first || !sel || sel.lap == null) return;
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
        var entries = Array.from(window.HistoryDetail.state.driverSelection.entries());
        var cmpEntry = entries.find(function (kv) { return Number(kv[0]) !== refSel.carIdx; });
        if (!cmpEntry) return [];
        var cmpData = lapData.get(cmpEntry[0]);
        var refData = lapData.get(refSel.carIdx);
        if (!cmpData || !refData) return [];
        var deltaSeries = computeDeltaSeries(cmpData.samples, refData.samples, sess);
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

    // ---------- chart stack ----------

    function effectiveHeight(m) {
        var base = compareState.heightOverride[m.key] != null
            ? compareState.heightOverride[m.key]
            : m.height;
        return Math.max(18, Math.round(base * compareState.heightScale));
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
            html += '<div class="tc-chart-row" data-metric="' + m.key + '" style="--tc-row-h:' + h + 'px">'
                + '<div class="tc-chart-label">' + m.label + '</div>'
                + '<div class="tc-chart-svg-host"></div>'
                + '<div class="tc-resize-handle" data-metric="' + m.key + '" title="Drag to resize"></div>'
                + '</div>';
        });
        // Hover overlay spans the entire stack.
        html += '<div class="tc-hover-layer" id="tcHoverLayer">'
             + '<div class="tc-crosshair" id="tcCrosshair"></div>'
             + '</div>';
        host.innerHTML = html;

        var selections = Array.from(window.HistoryDetail.state.driverSelection.entries());

        visibleMetrics.forEach(function (m) {
            var row = host.querySelector('[data-metric="' + m.key + '"] .tc-chart-svg-host');
            row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, refIdx, xMin, xMax, sess, effectiveHeight(m));
            // Per-row value chip that follows the crosshair. Hidden until the user hovers.
            row.insertAdjacentHTML('beforeend',
                '<div class="tc-row-chip" data-metric="' + m.key + '" hidden></div>');
        });

        wireResizeHandles(host, lapData);
        wireHover(host, lapData, selections, refSamples, refIdx, xMin, xMax, sess);
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

    function renderChartSvg(metric, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess, H) {
        var W = 900;
        var PAD_T = 4, PAD_B = 16;
        var plotH = H - PAD_T - PAD_B;
        function x(d) { return (d - xMin) / Math.max(1, xMax - xMin) * W; }

        // Reference driver samples for overlays (DRS overlay on Speed; ERS bg band).
        var refDriverData = (refCarIdx != null && lapData) ? lapData.get(refCarIdx) : null;
        var refDriverSamples = refDriverData ? refDriverData.samples : null;

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
                + bandSvg + '</svg>';
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
            var driver = sess.drivers[carIdx];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';

            var values;
            if (metric.key === 'delta') {
                if (!refSamples) return;
                values = computeDeltaSeries(d.samples, refSamples, sess);
            } else {
                values = d.samples.map(function (s) { return { d: s.d, v: s[metric.key] || 0 }; });
            }
            values = values.filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
            if (values.length === 0) return;

            var pts = values.map(function (pt) {
                var vMin = metric.min, vMax = metric.max;
                if (metric.key === 'delta') {
                    // auto-scale ± max(|v|)
                    vMax = 1; vMin = -1;
                }
                var yv = PAD_T + plotH - (pt.v - vMin) / Math.max(0.0001, vMax - vMin) * plotH;
                return x(pt.d) + ',' + yv;
            });
            var roleClass = 'tc-line tc-line-extra';
            if (carIdx === refCarIdx) roleClass = 'tc-line tc-line-ref';
            else if (compareSeriesCount === 0) roleClass = 'tc-line tc-line-current';
            var markerAttr = roleClass.indexOf('tc-line-ref') >= 0 ? ' marker-mid="url(#tcMarkerRef)"' :
                (roleClass.indexOf('tc-line-current') >= 0 ? ' marker-mid="url(#tcMarkerCurrent)"' : ' marker-mid="url(#tcMarkerExtra)"');
            lines += '<polyline class="' + roleClass + '" stroke="' + color + '" points="' + pts.join(' ') + '"' + markerAttr + '/>';
            if (carIdx !== refCarIdx) compareSeriesCount++;
        });

        // Axis baseline.
        var baseY = PAD_T + plotH - (0 - metric.min) / Math.max(0.0001, metric.max - metric.min) * plotH;
        if (baseY >= PAD_T && baseY <= PAD_T + plotH) {
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

        // Y-axis min/max labels at the top-left and bottom-left corners of the plot.
        var axis = '';
        var ax = AXIS_LABELS[metric.key];
        if (ax && plotH > 24) {
            axis += '<text class="tc-axis-label" x="4" y="' + (PAD_T + 9) + '">' + ax.max + '</text>';
            axis += '<text class="tc-axis-label" x="4" y="' + (PAD_T + plotH - 2) + '">' + ax.min + '</text>';
        }

        var defs = '<defs>'
            + '<marker id="tcMarkerRef" markerWidth="4" markerHeight="4" refX="2" refY="2"><circle cx="2" cy="2" r="1" class="tc-line-marker-ref"/></marker>'
            + '<marker id="tcMarkerCurrent" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5"><rect x="1" y="1" width="3" height="3" class="tc-line-marker-current"/></marker>'
            + '<marker id="tcMarkerExtra" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5"><path d="M1 2.5 L4 2.5 M2.5 1 L2.5 4" class="tc-line-marker-extra"/></marker>'
            + '<pattern id="tcPatternRef" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" class="tc-line-pattern-ref"/></pattern>'
            + '<pattern id="tcPatternCurrent" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.7" class="tc-line-pattern-current"/></pattern>'
            + '<pattern id="tcPatternExtra" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6" class="tc-line-pattern-extra"/></pattern>'
            + '</defs>';
        return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
            + defs + ersBg + speedDrsOverlay + sectorMarkers + lines + axis + '</svg>';
    }

    // Resamples driverSamples onto reference sample distances and returns per-distance Δtime (seconds).
    function computeDeltaSeries(driverSamples, refSamples, sess) {
        var out = [];
        var segmentBoundaries = buildSegmentBoundaries(sess.meta, compareState.miniPerSector)
            .map(function (seg) { return seg.end; });

        for (var i = 0; i < refSamples.length; i++) {
            var ref = refSamples[i];
            var interp = interpAtDistance(driverSamples, ref.d);
            if (interp == null) continue;
            var delta = interp.t - ref.t;

            if (compareState.deltaMode === 'sector') {
                // Subtract the delta at the most recent sector boundary the ref has passed.
                var boundary = 0;
                for (var j = 0; j < segmentBoundaries.length; j++) {
                    if (ref.d >= segmentBoundaries[j]) boundary = segmentBoundaries[j];
                }
                if (boundary > 0) {
                    var interpAtBoundary = interpAtDistance(driverSamples, boundary);
                    var refAtBoundary = interpAtDistance(refSamples, boundary);
                    if (interpAtBoundary && refAtBoundary) {
                        delta -= (interpAtBoundary.t - refAtBoundary.t);
                    }
                }
            }
            out.push({ d: ref.d, v: delta });
        }
        return out;
    }

    // Linear interp of sample values at the given lapDistance. O(log n) would be nicer; linear
    // scan is fine for ~1000 samples/lap × a handful of drivers.
    function interpAtDistance(samples, targetD) {
        if (!samples || samples.length === 0) return null;
        if (targetD <= samples[0].d) return samples[0];
        if (targetD >= samples[samples.length - 1].d) return samples[samples.length - 1];
        for (var i = 1; i < samples.length; i++) {
            if (samples[i].d >= targetD) {
                var a = samples[i - 1], b = samples[i];
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
        }
        return samples[samples.length - 1];
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
        var markers = '';
        window.HistoryDetail.state.driverSelection.forEach(function (sel, carIdx) {
            var d = lapData && lapData.get(carIdx);
            if (!d || !d.motion || d.motion.length === 0) return;
            var driver = sess.drivers[carIdx];
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

        var folder = window.HistoryDetail.state.folder;
        var slug = window.HistoryDetail.state.slug;
        var svgUrl = '/api/sessions/' + encodeURIComponent(folder) + '/' + encodeURIComponent(slug) + '/track-svg';

        host.innerHTML = ''
            + '<div class="tc-map-stage">'
            +   '<object class="tc-map-outline" type="image/svg+xml" data="' + svgUrl + '"></object>'
            +   '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tc-map-svg" preserveAspectRatio="xMidYMid meet">'
            +     lines + markers
            +   '</svg>'
            + '</div>'
            + '<div class="tc-map-caption">Track map</div>';
    }

    // ---------- hover sync ----------

    function wireHover(host, lapData, selections, refSamples, refCarIdx, xMin, xMax, sess) {
        var overlay = host.querySelector('#tcHoverLayer');
        var crosshair = host.querySelector('#tcCrosshair');
        if (!overlay) return;

        var chips = Array.prototype.slice.call(host.querySelectorAll('.tc-row-chip'));
        var scheduled = false, lastX = 0;

        // Pre-compute per-driver interp sample + color + delta series at hover time.
        function resolvePerDriver(d) {
            var compareOrdinal = 0;
            return selections.map(function (kv) {
                var carIdx = kv[0];
                var data = lapData && lapData.get(carIdx);
                if (!data || !data.samples) return null;
                var driver = sess.drivers[carIdx];
                var color = (typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';
                var sample = interpAtDistance(data.samples, d);
                var deltaVal = null;
                if (carIdx !== refCarIdx && refSamples && data.samples) {
                    var refInterp = interpAtDistance(refSamples, d);
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

        function update() {
            scheduled = false;
            var rect = overlay.getBoundingClientRect();
            var pct = Math.max(0, Math.min(1, lastX / rect.width));
            var d = xMin + pct * (xMax - xMin);
            crosshair.style.left = (pct * 100) + '%';

            var perDriver = resolvePerDriver(d);

            chips.forEach(function (chip) {
                var metricKey = chip.dataset.metric;
                if (perDriver.length === 0) { chip.hidden = true; return; }
                var rows = perDriver.map(function (pd) {
                    var text = formatChipValue(metricKey, pd.sample, metricKey === 'delta' ? pd.delta : null);
                    return '<span class="tc-chip-dot" style="background:' + pd.color + '"></span>'
                        + '<span class="tc-chip-ref">' + escapeHtml(pd.chipLabel || (pd.isReference ? 'REF' : 'LAP')) + '</span>'
                        + '<span class="tc-chip-val">' + escapeHtml(text) + '</span>';
                }).join('<span class="tc-chip-sep"></span>');
                chip.innerHTML = rows;
                chip.hidden = false;
                // Chip is absolute-positioned inside the row's SVG host; track the crosshair x.
                var chipHost = chip.parentElement;
                var hostW = chipHost.clientWidth;
                var chipW = chip.offsetWidth || 80;
                chip.style.left = Math.max(2, Math.min(hostW - chipW - 2, pct * hostW + 6)) + 'px';
            });

            updateMapMarkers(d, lapData, sess);
            renderFocusPanel(perDriver, d);
        }

        overlay.addEventListener('mousemove', function (e) {
            var rect = overlay.getBoundingClientRect();
            lastX = e.clientX - rect.left;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(update);
            }
        });
        overlay.addEventListener('mouseleave', function () {
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
        renderFocusPanel([], null);
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
