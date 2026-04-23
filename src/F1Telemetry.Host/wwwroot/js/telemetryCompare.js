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
    };

    var METRICS = [
        { key: 'delta', label: 'Δ (s)', height: 70, getValue: null /* computed */, min: -1, max: 1 },
        { key: 'spd',   label: 'Speed (km/h)', height: 70, min: 0, max: 370 },
        { key: 'thr',   label: 'Throttle', height: 50, min: 0, max: 100 },
        { key: 'brk',   label: 'Brake', height: 50, min: 0, max: 100 },
        { key: 'str',   label: 'Steering', height: 50, min: -100, max: 100 },
        { key: 'gr',    label: 'Gear', height: 50, min: -1, max: 8 },
        { key: 'rpm',   label: 'RPM', height: 60, min: 0, max: 14000 },
    ];

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
    }

    // ---------- chart stack ----------

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

        var html = '';
        METRICS.forEach(function (m) {
            html += '<div class="tc-chart-row" data-metric="' + m.key + '">'
                + '<div class="tc-chart-label">' + m.label + '</div>'
                + '<div class="tc-chart-svg-host"></div>'
                + '</div>';
        });
        // Hover overlay spans the entire stack.
        html += '<div class="tc-hover-layer" id="tcHoverLayer">'
             + '<div class="tc-crosshair" id="tcCrosshair"></div>'
             + '<div class="tc-tooltip" id="tcTooltip"></div>'
             + '</div>';
        host.innerHTML = html;

        var selections = Array.from(window.HistoryDetail.state.driverSelection.entries());

        METRICS.forEach(function (m) {
            var row = host.querySelector('[data-metric="' + m.key + '"] .tc-chart-svg-host');
            row.innerHTML = renderChartSvg(m, lapData, selections, refSamples, xMin, xMax, sess);
        });

        wireHover(host, lapData, selections, refSamples, xMin, xMax, sess);
    }

    function renderChartSvg(metric, lapData, selections, refSamples, xMin, xMax, sess) {
        var W = 900, H = metric.height;
        var PAD_T = 4, PAD_B = 16;
        var plotH = H - PAD_T - PAD_B;
        function x(d) { return (d - xMin) / Math.max(1, xMax - xMin) * W; }

        var lines = '';
        var mins = [], maxs = [];
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
                values = d.samples.map(function (s) { return { d: s.d, v: s[metric.key] }; });
            }
            values = values.filter(function (pt) { return pt.d >= xMin && pt.d <= xMax; });
            if (values.length === 0) return;

            values.forEach(function (pt) { mins.push(pt.v); maxs.push(pt.v); });

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
            + sectorMarkers + lines + '</svg>';
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
                rows += '<div class="tc-tip-row">'
                    + '<span class="driver-dot" style="background:' + color + '"></span>'
                    + '<span class="tc-tip-label">' + escapeHtml(driver.name) + '</span>'
                    + '<span class="tc-tip-val">' + Math.round(s.spd) + 'kph · '
                    + Math.round(s.thr) + '% · '
                    + Math.round(s.brk) + '% · G' + s.gr + '</span>'
                    + '</div>';
            });
            tooltip.innerHTML = rows;
            tooltip.style.left = Math.min(rect.width - 220, pct * rect.width + 8) + 'px';

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
