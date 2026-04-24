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
        } catch (e) { /* ignore corrupt storage */ }
    }

    function persistState() {
        try {
            localStorage.setItem(PERSIST_KEY, JSON.stringify({
                hiddenMetrics: Array.from(compareState.hiddenMetrics),
                heightScale: compareState.heightScale,
                heightOverride: compareState.heightOverride,
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

    function render(body) {
        var sess = window.HistoryDetail.state.session;
        body.innerHTML = ''
            + '<div class="tc-layout">'
            +   '<div class="tc-side" id="tcSide"></div>'
            +   '<div class="tc-main">'
            +     '<div class="tc-sector-badges" id="tcBadges"></div>'
            +     '<div class="tc-charts" id="tcCharts"></div>'
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
        drawBadges(lapData);
        drawChartStack(lapData);
        drawTrackMap(lapData);
    }

    // ---------- sector badges ----------

    function drawBadges(lapData) {
        var host = document.getElementById('tcBadges');
        if (!host) return;
        var sess = window.HistoryDetail.state.session;
        var s2 = sess.meta.sector2StartM, s3 = sess.meta.sector3StartM;

        var html = '<div class="tc-delta-toggle">'
            + '<button class="tc-mode ' + (compareState.deltaMode === 'cumulative' ? 'active' : '') + '" data-mode="cumulative">Δ cumulative</button>'
            + '<button class="tc-mode ' + (compareState.deltaMode === 'sector' ? 'active' : '') + '" data-mode="sector">Δ per-sector</button>'
            + '</div>';

        // One badge per sector with inter-driver deltas.
        var refIdx = lapData && lapData.size > 0 ? lapData.keys().next().value : null;
        var refDriverLap = refIdx != null ? sess.drivers[refIdx] : null;
        var refLap = null;
        if (refDriverLap) {
            var sel = window.HistoryDetail.state.driverSelection.get(refIdx);
            refLap = (refDriverLap.laps || []).find(function (l) { return l.lapNum === sel.lap; });
        }

        ['s1', 's2', 's3'].forEach(function (key, i) {
            var label = 'S' + (i + 1);
            var refMs = refLap ? refLap[key + 'Ms'] : 0;
            var startM = i === 0 ? 0 : (i === 1 ? s2 : s3);
            var endM = i === 0 ? s2 : (i === 1 ? s3 : sess.meta.trackLengthM);
            html += '<button class="tc-badge" data-start="' + startM + '" data-end="' + endM + '">'
                + '<strong>' + label + '</strong> '
                + window.HistoryDetail.formatSectorTime(refMs)
                + '</button>';
        });
        html += '<button class="tc-badge tc-badge-reset" data-start="0" data-end="' + sess.meta.trackLengthM + '">Full Lap</button>';

        // --- Second row: metric visibility chips + height presets + reset-heights. ---
        html += '<div class="tc-metrics-toolbar">';
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
        var refIdx = lapData && lapData.size > 0 ? lapData.keys().next().value : null;
        var refSamples = refIdx != null ? lapData.get(refIdx).samples : null;

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
             + '<div class="tc-tooltip" id="tcTooltip"></div>'
             + '</div>';
        host.innerHTML = html;

        var selections = Array.from(window.HistoryDetail.state.driverSelection.entries());

        visibleMetrics.forEach(function (m) {
            var row = host.querySelector('[data-metric="' + m.key + '"] .tc-chart-svg-host');
            row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, xMin, xMax, sess, effectiveHeight(m));
        });

        wireResizeHandles(host, lapData);
        wireHover(host, lapData, selections, refSamples, xMin, xMax, sess);
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

    function renderChartSvg(metric, lapData, selections, refSamples, xMin, xMax, sess, H) {
        var W = 900;
        var PAD_T = 4, PAD_B = 16;
        var plotH = H - PAD_T - PAD_B;
        function x(d) { return (d - xMin) / Math.max(1, xMax - xMin) * W; }

        // Reference driver samples for overlays (DRS overlay on Speed; ERS bg band).
        var refCarIdx = selections.length > 0 ? selections[0][0] : null;
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
            lines += '<polyline class="tc-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
        });

        // Axis baseline.
        var baseY = PAD_T + plotH - (0 - metric.min) / Math.max(0.0001, metric.max - metric.min) * plotH;
        if (baseY >= PAD_T && baseY <= PAD_T + plotH) {
            lines += '<line class="tc-baseline" x1="0" x2="' + W + '" y1="' + baseY + '" y2="' + baseY + '"/>';
        }

        // Sector markers.
        var sectorMarkers = '';
        [sess.meta.sector2StartM, sess.meta.sector3StartM].forEach(function (s) {
            if (s >= xMin && s <= xMax) {
                sectorMarkers += '<line class="tc-sector-line" x1="' + x(s) + '" x2="' + x(s)
                    + '" y1="' + PAD_T + '" y2="' + (PAD_T + plotH) + '"/>';
            }
        });

        return '<svg class="tc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
            + ersBg + speedDrsOverlay + sectorMarkers + lines + '</svg>';
    }

    // Resamples driverSamples onto reference sample distances and returns per-distance Δtime (seconds).
    function computeDeltaSeries(driverSamples, refSamples, sess) {
        var out = [];
        var sectorBoundaries = [sess.meta.sector2StartM || 0, sess.meta.sector3StartM || 0];

        for (var i = 0; i < refSamples.length; i++) {
            var ref = refSamples[i];
            var interp = interpAtDistance(driverSamples, ref.d);
            if (interp == null) continue;
            var delta = interp.t - ref.t;

            if (compareState.deltaMode === 'sector') {
                // Subtract the delta at the most recent sector boundary the ref has passed.
                var boundary = 0;
                for (var j = 0; j < sectorBoundaries.length; j++) {
                    if (ref.d >= sectorBoundaries[j]) boundary = sectorBoundaries[j];
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

    function wireHover(host, lapData, selections, refSamples, xMin, xMax, sess) {
        var overlay = host.querySelector('#tcHoverLayer');
        var crosshair = host.querySelector('#tcCrosshair');
        var tooltip = host.querySelector('#tcTooltip');
        if (!overlay) return;

        var scheduled = false, lastX = 0;

        function update() {
            scheduled = false;
            var rect = overlay.getBoundingClientRect();
            var pct = Math.max(0, Math.min(1, lastX / rect.width));
            var d = xMin + pct * (xMax - xMin);

            crosshair.style.left = (pct * 100) + '%';

            var rows = '';
            rows += '<div class="tc-tip-row"><span class="tc-tip-label">Lap dist</span><span>' + d.toFixed(0) + ' m</span></div>';
            selections.forEach(function (kv) {
                var carIdx = kv[0];
                var data = lapData && lapData.get(carIdx);
                if (!data || !data.samples) return;
                var driver = sess.drivers[carIdx];
                var color = (typeof teamAccentColor === 'function') ? teamAccentColor(driver.teamId) : '#9aa0a6';
                var s = interpAtDistance(data.samples, d);
                if (!s) return;
                var ersMode = ERS_MODE_NAMES[s.ersMd || 0] || 'None';
                rows += '<div class="tc-tip-row">'
                    + '<span class="driver-dot" style="background:' + color + '"></span>'
                    + '<span class="tc-tip-label">' + escapeHtml(driver.name) + '</span>'
                    + '<span class="tc-tip-val">' + Math.round(s.spd) + 'kph · '
                    + Math.round(s.thr) + '% · '
                    + Math.round(s.brk) + '% · G' + s.gr + ' · '
                    + 'ERS ' + Math.round(s.ers || 0) + '% [' + ersMode + '] · '
                    + 'DRS ' + ((s.drs || 0) ? 'ON' : 'OFF')
                    + '</span>'
                    + '</div>';
            });
            tooltip.innerHTML = rows;
            var tipW = tooltip.offsetWidth || 220;
            tooltip.style.left = Math.max(0, Math.min(rect.width - tipW - 4, pct * rect.width + 8)) + 'px';

            // Update map markers.
            updateMapMarkers(d, lapData, sess);
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
            tooltip.innerHTML = '';
        });
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
