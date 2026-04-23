// History Mode — session detail view controller.
// Four sub-tabs: Lap Times / Positions / Telemetry Compare / Events. Owned modules:
//   - renderLapTimes, renderPositions, renderTelemetryCompare, renderEvents
//     (defined in the same file for now; extract later if file grows > 800 lines)
//   - DriverPicker: shared component, rendered into the side rail of Positions / Compare.
// State lives on the module (not window) so switching to Live tab doesn't tear it down.
(function () {
    'use strict';

    var state = {
        folder: null,
        slug: null,
        session: null,               // full session detail JSON (from /api/sessions/{folder}/{slug})
        subTab: 'laptimes',
        // Map<carIdx, { lap: number, ghost: bool }>. `lap` = selected lap for Compare.
        driverSelection: new Map(),
        lapSamplesCache: new Map(),  // key: carIdx + ':' + lap
    };

    // ---------- public API ----------

    function open(folder, slug, weekendName) {
        state.folder = folder;
        state.slug = slug;
        state.session = null;
        state.driverSelection = new Map();
        state.lapSamplesCache = new Map();

        var list = document.getElementById('historySessionList');
        var detail = document.getElementById('historyDetailView');
        if (list) list.hidden = true;
        if (detail) detail.hidden = false;

        setBreadcrumb(weekendName || folder, slug);
        ensureActionsBar();
        switchSubTab(state.subTab || 'laptimes');

        fetch('/api/sessions/' + encodeURIComponent(folder) + '/' + encodeURIComponent(slug))
            .then(function (r) {
                if (!r.ok) throw new Error('fetch failed: ' + r.status);
                return r.json();
            })
            .then(function (data) {
                state.session = data;
                // Default driver selection: player car only, best valid lap.
                var playerIdx = data.meta ? data.meta.playerCarIndex : null;
                if (playerIdx != null && data.drivers && data.drivers[playerIdx]) {
                    state.driverSelection.set(Number(playerIdx), {
                        lap: fastestValidLap(data.drivers[playerIdx].laps),
                        ghost: false,
                    });
                }
                renderCurrentSubTab();
            })
            .catch(function (err) {
                var body = document.getElementById('historyDetailBody');
                if (body) body.innerHTML = '<div class="history-empty"><p>Failed to load session: ' + escapeHtml(String(err.message || err)) + '</p></div>';
            });
    }

    function close() {
        var list = document.getElementById('historySessionList');
        var detail = document.getElementById('historyDetailView');
        if (list) list.hidden = false;
        if (detail) detail.hidden = true;
        state.session = null;
    }

    // ---------- sub-tab switching ----------

    function switchSubTab(id) {
        state.subTab = id;
        var tabs = document.querySelectorAll('.history-subtab');
        tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.sub === id);
        });
        renderCurrentSubTab();
    }

    function renderCurrentSubTab() {
        var body = document.getElementById('historyDetailBody');
        if (!body) return;
        if (!state.session) {
            body.innerHTML = '<div class="history-empty"><p>Loading session…</p></div>';
            return;
        }
        switch (state.subTab) {
            case 'laptimes':  renderLapTimes(body); break;
            case 'positions': renderPositions(body); break;
            case 'compare':   renderTelemetryCompare(body); break;
            case 'events':    renderEvents(body); break;
            default:          body.innerHTML = '';
        }
    }

    // ---------- placeholder renderers (filled in Phases C/D/E/H) ----------

    // ---------- Phase C: Lap Times ----------

    // Session category drives column set.
    function sessionCategory(type) {
        if (type >= 1 && type <= 4) return 'practice';
        if (type >= 5 && type <= 14) return 'qualifying';
        if (type >= 15 && type <= 17) return 'race';
        if (type === 18) return 'time_trial';
        return 'unknown';
    }

    // Lap Times local state (toggles for quali). Re-created on each open.
    var lapTimesState = { virtualMode: false };

    function renderLapTimes(body) {
        var sess = state.session;
        var cat = sessionCategory(sess.meta.sessionType);
        var isQuali = cat === 'qualifying';

        // Compute field bests across all drivers.
        var bests = computeBests(sess.drivers);

        var toolbar = '';
        if (isQuali) {
            toolbar = '<div class="lt-toolbar">'
                + '<div class="lt-toggle">'
                + '<button class="lt-mode ' + (!lapTimesState.virtualMode ? 'active' : '') + '" data-mode="real">Real</button>'
                + '<button class="lt-mode ' + (lapTimesState.virtualMode ? 'active' : '') + '" data-mode="virtual">Virtual Best</button>'
                + '</div>'
                + '</div>';
        }

        // Driver tables.
        var driverHtml = '';
        var driverOrder = orderDriversByBest(sess.drivers, isQuali && lapTimesState.virtualMode);
        driverOrder.forEach(function (carIdx) {
            driverHtml += renderDriverLapTable(sess.drivers[carIdx], cat, bests);
        });

        // Virtual vs actual grid (only in quali).
        var virtualGrid = '';
        if (isQuali) {
            virtualGrid = renderVirtualGrid(sess.drivers);
        }

        body.innerHTML =
            '<div class="lt-container">'
            + toolbar
            + '<div class="lt-main">'
            +   '<div class="lt-drivers">' + driverHtml + '</div>'
            +   virtualGrid
            + '</div>'
            + '</div>';

        // Toggle handler.
        body.querySelectorAll('.lt-mode').forEach(function (btn) {
            btn.addEventListener('click', function () {
                lapTimesState.virtualMode = btn.dataset.mode === 'virtual';
                renderLapTimes(body);
            });
        });
    }

    function computeBests(drivers) {
        var best = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
        if (!drivers) return best;
        Object.keys(drivers).forEach(function (k) {
            (drivers[k].laps || []).forEach(function (l) {
                if (l.valid && l.lapTimeMs > 0 && l.lapTimeMs < best.lap) best.lap = l.lapTimeMs;
                if (l.s1Ms > 0 && l.s1Ms < best.s1) best.s1 = l.s1Ms;
                if (l.s2Ms > 0 && l.s2Ms < best.s2) best.s2 = l.s2Ms;
                if (l.s3Ms > 0 && l.s3Ms < best.s3) best.s3 = l.s3Ms;
            });
        });
        return best;
    }

    function personalBest(laps) {
        var pb = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
        (laps || []).forEach(function (l) {
            if (l.valid && l.lapTimeMs > 0 && l.lapTimeMs < pb.lap) pb.lap = l.lapTimeMs;
            if (l.s1Ms > 0 && l.s1Ms < pb.s1) pb.s1 = l.s1Ms;
            if (l.s2Ms > 0 && l.s2Ms < pb.s2) pb.s2 = l.s2Ms;
            if (l.s3Ms > 0 && l.s3Ms < pb.s3) pb.s3 = l.s3Ms;
        });
        return pb;
    }

    function virtualBestMs(laps) {
        var pb = personalBest(laps);
        if (pb.s1 === Infinity || pb.s2 === Infinity || pb.s3 === Infinity) return Infinity;
        return pb.s1 + pb.s2 + pb.s3;
    }

    function orderDriversByBest(drivers, useVirtual) {
        if (!drivers) return [];
        var keys = Object.keys(drivers);
        keys.sort(function (a, b) {
            var la = useVirtual ? virtualBestMs(drivers[a].laps) : personalBest(drivers[a].laps).lap;
            var lb = useVirtual ? virtualBestMs(drivers[b].laps) : personalBest(drivers[b].laps).lap;
            return la - lb;
        });
        return keys;
    }

    function renderDriverLapTable(driver, cat, bests) {
        var pb = personalBest(driver.laps);
        var teamColor = (typeof teamAccentColor === 'function')
            ? teamAccentColor(driver.teamId) : '#9aa0a6';

        var head = '';
        if (cat === 'race') {
            head = '<tr><th>Lap</th><th>Time</th><th>Comp</th><th>Wear</th><th>Pit</th><th>Pos</th><th>Gap</th><th>Flag</th></tr>';
        } else if (cat === 'qualifying') {
            head = '<tr><th>Lap</th><th>Time</th><th>S1</th><th>S2</th><th>S3</th><th>Comp</th><th>Wear</th><th>Valid</th></tr>';
        } else {
            head = '<tr><th>Lap</th><th>Time</th><th>Comp</th><th>Wear</th><th>Valid</th></tr>';
        }

        var rows = (driver.laps || []).map(function (l) {
            return renderLapRow(l, cat, bests, pb);
        }).join('');

        return ''
            + '<div class="lt-driver-block">'
            +   '<div class="lt-driver-header">'
            +     '<span class="driver-dot" style="background:' + teamColor + '"></span>'
            +     '<span class="lt-driver-name">' + escapeHtml(driver.name) + '</span>'
            +     '<span class="lt-driver-best">PB ' + formatLapTime(pb.lap === Infinity ? 0 : pb.lap) + '</span>'
            +   '</div>'
            +   '<table class="lt-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>'
            + '</div>';
    }

    function renderLapRow(l, cat, bests, pb) {
        var rowCls = l.valid ? '' : 'lt-invalid';
        if (cat === 'race' && l.raceFlag === 4) rowCls += ' lt-red-flag-row';

        function timeCell(ms, bestField) {
            if (!ms || ms <= 0) return '<td class="lt-cell">—</td>';
            var cls = 'lt-cell';
            if (bests[bestField] !== Infinity && ms === bests[bestField]) cls += ' lt-purple';
            else if (pb[bestField] !== Infinity && ms === pb[bestField]) cls += ' lt-green';
            var s = (bestField === 'lap') ? formatLapTime(ms) : formatSectorTime(ms);
            return '<td class="' + cls + '">' + s + '</td>';
        }

        var compoundBadge = compoundBadgeHtml(l.compoundVisual);
        var wear = tyreWearSummary(l.tyreWearEnd);

        if (cat === 'race') {
            return '<tr class="' + rowCls + '">'
                 + '<td>' + l.lapNum + '</td>'
                 + timeCell(l.lapTimeMs, 'lap')
                 + '<td>' + compoundBadge + '</td>'
                 + '<td>' + wear + '</td>'
                 + '<td>' + (l.pit ? 'P' : '') + '</td>'
                 + '<td>' + (l.position || '') + '</td>'
                 + '<td>' + (l.gapToLeaderMs != null ? '+' + (l.gapToLeaderMs / 1000).toFixed(3) : '') + '</td>'
                 + '<td>' + raceFlagIcon(l.raceFlag) + '</td>'
                 + '</tr>';
        }
        if (cat === 'qualifying') {
            return '<tr class="' + rowCls + '">'
                 + '<td>' + l.lapNum + '</td>'
                 + timeCell(l.lapTimeMs, 'lap')
                 + timeCell(l.s1Ms, 's1')
                 + timeCell(l.s2Ms, 's2')
                 + timeCell(l.s3Ms, 's3')
                 + '<td>' + compoundBadge + '</td>'
                 + '<td>' + wear + '</td>'
                 + '<td>' + (l.valid ? '✓' : '✗') + '</td>'
                 + '</tr>';
        }
        return '<tr class="' + rowCls + '">'
             + '<td>' + l.lapNum + '</td>'
             + timeCell(l.lapTimeMs, 'lap')
             + '<td>' + compoundBadge + '</td>'
             + '<td>' + wear + '</td>'
             + '<td>' + (l.valid ? '✓' : '✗') + '</td>'
             + '</tr>';
    }

    function raceFlagIcon(flag) {
        if (flag == null || flag === 0) return '';
        if (flag === 2) return '<span class="flag-icon flag-sc" title="Safety Car">SC</span>';
        if (flag === 3) return '<span class="flag-icon flag-vsc" title="Virtual Safety Car">VSC</span>';
        if (flag === 4) return '<span class="flag-icon flag-red" title="Red Flag">RED</span>';
        if (flag === 1) return '<span class="flag-icon flag-yellow" title="Yellow">Y</span>';
        return '';
    }

    function compoundBadgeHtml(visualCompound) {
        var name = (typeof VISUAL_COMPOUNDS !== 'undefined' && VISUAL_COMPOUNDS[visualCompound])
            ? VISUAL_COMPOUNDS[visualCompound] : '?';
        var color = (typeof COMPOUND_DOT_COLORS !== 'undefined' && COMPOUND_DOT_COLORS[visualCompound])
            ? COMPOUND_DOT_COLORS[visualCompound] : '#666';
        var label = name.charAt(0);
        return '<span class="compound-badge" style="background:' + color + '" title="' + escapeHtml(name) + '">' + label + '</span>';
    }

    function tyreWearSummary(wearArr) {
        if (!wearArr || wearArr.length !== 4) return '';
        var avg = (wearArr[0] + wearArr[1] + wearArr[2] + wearArr[3]) / 4;
        return Math.round(avg) + '%';
    }

    function renderVirtualGrid(drivers) {
        if (!drivers) return '';
        var rows = Object.keys(drivers).map(function (carIdx) {
            var d = drivers[carIdx];
            return {
                carIdx: Number(carIdx),
                name: d.name,
                teamId: d.teamId,
                actual: personalBest(d.laps).lap,
                virtual: virtualBestMs(d.laps),
            };
        });

        var actualSorted = rows.slice().sort(function (a, b) { return a.actual - b.actual; });
        var virtualSorted = rows.slice().sort(function (a, b) { return a.virtual - b.virtual; });
        var actualPos = {}, virtualPos = {};
        actualSorted.forEach(function (r, i) { actualPos[r.carIdx] = i + 1; });
        virtualSorted.forEach(function (r, i) { virtualPos[r.carIdx] = i + 1; });

        var html = '<div class="lt-virtual-grid">'
            + '<div class="lt-virtual-title">Virtual Best Grid</div>'
            + '<table class="lt-table">'
            + '<thead><tr><th>Driver</th><th>Actual</th><th>Virtual</th><th>Δ</th></tr></thead><tbody>';
        virtualSorted.forEach(function (r) {
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(r.teamId) : '#9aa0a6';
            var delta = actualPos[r.carIdx] - virtualPos[r.carIdx];
            var arrow = delta > 0 ? '<span class="delta-up">▲' + delta + '</span>'
                       : delta < 0 ? '<span class="delta-down">▼' + (-delta) + '</span>'
                       : '<span class="delta-same">–</span>';
            html += '<tr>'
                + '<td><span class="driver-dot" style="background:' + teamColor + '"></span> ' + escapeHtml(r.name) + '</td>'
                + '<td>P' + actualPos[r.carIdx] + ' — ' + formatLapTime(r.actual === Infinity ? 0 : r.actual) + '</td>'
                + '<td>P' + virtualPos[r.carIdx] + ' — ' + formatLapTime(r.virtual === Infinity ? 0 : r.virtual) + '</td>'
                + '<td>' + arrow + '</td>'
                + '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }
    // ---------- Phase D: Positions ----------

    function renderPositions(body) {
        var sess = state.session;
        var totalLaps = (sess.meta && sess.meta.totalLaps) || computeMaxLap(sess.drivers);
        if (!totalLaps) totalLaps = 1;

        // Pre-select all drivers with at least one completed lap on first render.
        if (state.driverSelection.size <= 1 && sess.drivers) {
            Object.keys(sess.drivers).forEach(function (k) {
                if ((sess.drivers[k].laps || []).length > 0) {
                    if (!state.driverSelection.has(Number(k))) {
                        state.driverSelection.set(Number(k), { lap: null, ghost: false });
                    }
                }
            });
        }

        body.innerHTML = '<div class="pos-layout">'
            + '<div class="pos-side" id="posSide"></div>'
            + '<div class="pos-main">'
            +   '<div class="pos-chart" id="posChart"></div>'
            +   '<div class="pos-stints" id="posStints"></div>'
            + '</div>'
            + '</div>';

        var side = body.querySelector('#posSide');
        var picker = DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: false,
            onChange: function () { drawPositionChart(); drawStintStrips(); },
        });
        side.appendChild(picker);

        drawPositionChart();
        drawStintStrips();
    }

    function computeMaxLap(drivers) {
        var max = 0;
        if (!drivers) return 0;
        Object.keys(drivers).forEach(function (k) {
            (drivers[k].laps || []).forEach(function (l) {
                if (l.lapNum > max) max = l.lapNum;
            });
        });
        return max;
    }

    function drawPositionChart() {
        var host = document.getElementById('posChart');
        if (!host) return;
        var sess = state.session;
        var selected = Array.from(state.driverSelection.keys()).filter(function (k) {
            return sess.drivers && sess.drivers[k];
        });
        if (selected.length === 0) {
            host.innerHTML = '<div class="history-placeholder">Select drivers to plot.</div>';
            return;
        }

        var totalLaps = (sess.meta && sess.meta.totalLaps) || computeMaxLap(sess.drivers);
        if (!totalLaps) totalLaps = 1;
        var totalDrivers = Math.max(20, Object.keys(sess.drivers || {}).length);

        // SVG dims (intrinsic); CSS scales it. X pad leaves room for lap numbers & Y labels.
        var W = 800, H = 360, PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 28;
        var plotW = W - PAD_L - PAD_R;
        var plotH = H - PAD_T - PAD_B;

        function x(lap) { return PAD_L + (lap - 1) / Math.max(1, totalLaps - 1) * plotW; }
        function y(pos) { return PAD_T + (pos - 1) / Math.max(1, totalDrivers - 1) * plotH; }

        // Race-flag bands: collect per-lap max flag across all drivers.
        var flagByLap = {};
        (sess.events || []).forEach(function (e) {
            if (e.flag != null && e.lap != null) flagByLap[e.lap] = Math.max(flagByLap[e.lap] || 0, e.flag);
        });

        var bands = '';
        Object.keys(flagByLap).forEach(function (lap) {
            var lapN = Number(lap);
            var flag = flagByLap[lapN];
            var cls = flag === 2 ? 'pos-band-sc' : flag === 3 ? 'pos-band-vsc' : flag === 4 ? 'pos-band-red' : 'pos-band-yellow';
            bands += '<rect class="' + cls + '" x="' + (x(lapN) - 4) + '" y="' + PAD_T
                + '" width="8" height="' + plotH + '"/>';
        });

        // Y-axis tick labels (P1, P5, P10, P15, P20).
        var ticks = '';
        [1, 5, 10, 15, 20].forEach(function (p) {
            if (p > totalDrivers) return;
            ticks += '<text class="pos-ytick" x="' + (PAD_L - 6) + '" y="' + (y(p) + 4) + '" text-anchor="end">P' + p + '</text>';
            ticks += '<line class="pos-grid" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + y(p) + '" y2="' + y(p) + '"/>';
        });
        // X-axis lap labels every 5.
        for (var lx = 1; lx <= totalLaps; lx += 5) {
            ticks += '<text class="pos-xtick" x="' + x(lx) + '" y="' + (H - PAD_B + 16) + '" text-anchor="middle">' + lx + '</text>';
        }

        // Driver polylines + pit markers.
        var lines = '';
        var markers = '';
        selected.forEach(function (k) {
            var d = sess.drivers[k];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
            var pts = (d.laps || []).filter(function (l) { return l.position > 0; })
                .map(function (l) { return x(l.lapNum) + ',' + y(l.position); });
            if (pts.length === 0) return;
            lines += '<polyline class="pos-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';

            (d.laps || []).forEach(function (l) {
                if (l.pit) {
                    var cx = x(l.lapNum), cy = y(l.position);
                    markers += '<polygon class="pos-pit-marker" fill="' + color + '" points="'
                        + cx + ',' + (cy - 5) + ' ' + (cx - 4) + ',' + (cy + 3) + ' ' + (cx + 4) + ',' + (cy + 3) + '"/>';
                }
            });
        });

        host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pos-svg" preserveAspectRatio="xMidYMid meet">'
            + bands + ticks + lines + markers + '</svg>';
    }

    function drawStintStrips() {
        var host = document.getElementById('posStints');
        if (!host) return;
        var sess = state.session;
        var selected = Array.from(state.driverSelection.keys()).filter(function (k) {
            return sess.drivers && sess.drivers[k];
        });
        if (selected.length === 0) { host.innerHTML = ''; return; }

        var totalLaps = (sess.meta && sess.meta.totalLaps) || computeMaxLap(sess.drivers);
        if (!totalLaps) totalLaps = 1;

        var html = '<div class="stint-grid">';
        selected.forEach(function (k) {
            var d = sess.drivers[k];
            var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
            var stints = stintsForDriver(sess, k);
            var bars = '';
            var lastEnd = 0;
            stints.forEach(function (st) {
                var startLap = lastEnd + 1;
                var endLap = st.endLap;
                var widthPct = (endLap - startLap + 1) / totalLaps * 100;
                var leftPct = (startLap - 1) / totalLaps * 100;
                var color = (typeof COMPOUND_DOT_COLORS !== 'undefined' && COMPOUND_DOT_COLORS[st.visual])
                    ? COMPOUND_DOT_COLORS[st.visual] : '#666';
                bars += '<span class="stint-bar" style="left:' + leftPct + '%;width:' + widthPct
                    + '%;background:linear-gradient(90deg,' + color + ' 0%,rgba(0,0,0,0.5) 100%)"'
                    + ' title="L' + startLap + '-L' + endLap + '"></span>';
                lastEnd = endLap;
            });
            html += '<div class="stint-row-label"><span class="driver-dot" style="background:' + teamColor + '"></span>'
                + escapeHtml(d.name) + '</div>'
                + '<div class="stint-row-bars">' + bars + '</div>';
        });
        html += '</div>';
        host.innerHTML = html;
    }

    function stintsForDriver(sess, carIdx) {
        // Prefer the authoritative SessionHistoryPacket, fall back to per-lap compound changes.
        var hist = sess.lapHistories && sess.lapHistories[carIdx];
        if (hist && hist.tyreStintsHistoryData && hist.tyreStintsHistoryData.length > 0) {
            return hist.tyreStintsHistoryData.map(function (s) {
                return { endLap: s.endLap, actual: s.tyreActualCompound, visual: s.tyreVisualCompound };
            });
        }
        var driver = sess.drivers && sess.drivers[carIdx];
        if (!driver || !driver.laps) return [];
        var stints = [];
        var cur = null;
        driver.laps.forEach(function (l) {
            if (!cur || cur.visual !== l.compoundVisual) {
                if (cur) stints.push(cur);
                cur = { endLap: l.lapNum, actual: l.compoundActual, visual: l.compoundVisual };
            } else {
                cur.endLap = l.lapNum;
            }
        });
        if (cur) stints.push(cur);
        return stints;
    }
    function renderTelemetryCompare(body) {
        if (window.TelemetryCompare && window.TelemetryCompare.render) {
            window.TelemetryCompare.render(body);
        } else {
            body.innerHTML = '<div class="history-placeholder">Telemetry Compare module not loaded.</div>';
        }
    }
    // ---------- Phase H: Events ----------

    var eventsState = { filter: 'all', query: '' };

    var EVENT_NAMES = {
        'SSTA': 'Session Start', 'SEND': 'Session End',
        'FTLP': 'Fastest Lap', 'RTMT': 'Retirement',
        'DRSE': 'DRS Enabled', 'DRSD': 'DRS Disabled',
        'TMPT': 'Teammate in Pits', 'CHQF': 'Chequered Flag',
        'RCWN': 'Race Winner', 'PENA': 'Penalty', 'SPTP': 'Speed Trap',
        'STLG': 'Start Lights', 'LGOT': 'Lights Out',
        'DTSV': 'DT Pen Served', 'SGSV': 'Stop-Go Served',
        'FLBK': 'Flashback', 'BUTN': 'Buttons',
        'OVTK': 'Overtake', 'SCAR': 'Safety Car',
        'COLL': 'Collision', 'RDFL': 'Red Flag',
    };

    function categoryOf(code) {
        if (['SCAR', 'RDFL'].includes(code)) return 'flags';
        if (code === 'OVTK') return 'overtakes';
        if (code === 'PENA') return 'penalties';
        if (code === 'FTLP') return 'fastest';
        if (code === 'DRSE' || code === 'DRSD') return 'drs';
        return 'other';
    }

    function renderEvents(body) {
        var sess = state.session;
        var events = sess.events || [];

        body.innerHTML = ''
            + '<div class="ev-toolbar">'
            +   '<div class="ev-chips">'
            +     '<button class="ev-chip" data-f="all">All</button>'
            +     '<button class="ev-chip" data-f="flags">Flags</button>'
            +     '<button class="ev-chip" data-f="overtakes">Overtakes</button>'
            +     '<button class="ev-chip" data-f="penalties">Penalties</button>'
            +     '<button class="ev-chip" data-f="fastest">Fastest Laps</button>'
            +     '<button class="ev-chip" data-f="drs">DRS</button>'
            +   '</div>'
            +   '<input type="search" class="ev-search" placeholder="Filter driver…"/>'
            + '</div>'
            + '<table class="ev-table"><thead>'
            +   '<tr><th>Time</th><th>Lap</th><th>Event</th><th>Driver</th><th>Details</th></tr>'
            + '</thead><tbody id="evTbody"></tbody></table>';

        body.querySelectorAll('.ev-chip').forEach(function (c) {
            if (c.dataset.f === eventsState.filter) c.classList.add('active');
            c.addEventListener('click', function () {
                eventsState.filter = c.dataset.f;
                body.querySelectorAll('.ev-chip').forEach(function (x) { x.classList.toggle('active', x === c); });
                renderEventRows(body, events);
            });
        });
        var search = body.querySelector('.ev-search');
        search.value = eventsState.query;
        search.addEventListener('input', function () {
            eventsState.query = search.value.toLowerCase();
            renderEventRows(body, events);
        });

        renderEventRows(body, events);
    }

    function renderEventRows(body, events) {
        var sess = state.session;
        var tbody = body.querySelector('#evTbody');
        if (!tbody) return;
        var filter = eventsState.filter;
        var query = eventsState.query;

        var rows = events.filter(function (e) {
            if (filter !== 'all' && categoryOf(e.code) !== filter) return false;
            if (query) {
                var name = e.carIdx != null && sess.drivers && sess.drivers[e.carIdx]
                    ? sess.drivers[e.carIdx].name.toLowerCase() : '';
                if (!name.includes(query)) return false;
            }
            return true;
        }).map(function (e) {
            var driver = e.carIdx != null && sess.drivers ? sess.drivers[e.carIdx] : null;
            var dot = driver
                ? '<span class="driver-dot" style="background:' + (typeof teamAccentColor === 'function' ? teamAccentColor(driver.teamId) : '#9aa0a6') + '"></span> '
                : '';
            return '<tr>'
                + '<td>' + formatSessionTime(e.timeS) + '</td>'
                + '<td>' + (e.lap || '—') + '</td>'
                + '<td><strong>' + (EVENT_NAMES[e.code] || e.code) + '</strong></td>'
                + '<td>' + dot + escapeHtml(driver ? driver.name : '') + '</td>'
                + '<td>' + formatEventDetails(e, sess) + '</td>'
                + '</tr>';
        });

        tbody.innerHTML = rows.join('') || '<tr><td colspan="5" class="ev-empty">No events match.</td></tr>';
    }

    function formatSessionTime(s) {
        if (s == null) return '—';
        var m = Math.floor(s / 60);
        var rest = (s % 60).toFixed(0).padStart(2, '0');
        return m + ':' + rest;
    }

    function formatEventDetails(e, sess) {
        var d = e.details;
        if (!d) return '';
        switch (e.code) {
            case 'FTLP': return formatLapTime((d.lapTime || 0) * 1000);
            case 'SPTP': return (d.speed || 0).toFixed(1) + ' km/h';
            case 'PENA': return 'Type ' + d.penaltyType + (d.time ? ' — ' + d.time + 's' : '');
            case 'OVTK':
                var a = sess.drivers[d.overtakingVehicleIdx];
                var b = sess.drivers[d.beingOvertakenVehicleIdx];
                return (a ? a.name : '?') + ' ← ' + (b ? b.name : '?');
            case 'SCAR':
                var t = d.safetyCarType === 2 ? 'Virtual SC' : d.safetyCarType === 1 ? 'Full SC' : 'SC';
                var ev = d.eventType === 0 ? 'Deployed' : d.eventType === 1 ? 'Ending' : '';
                return t + (ev ? ' — ' + ev : '');
            case 'RDFL': return 'Red Flag';
            case 'RTMT': return 'Retired';
            default: return '';
        }
    }

    // ---------- breadcrumb ----------

    function setBreadcrumb(weekendName, sessionSlug) {
        var detail = document.getElementById('historyDetailView');
        if (!detail) return;
        var w = detail.querySelector('.history-bc-weekend');
        var s = detail.querySelector('.history-bc-session');
        if (w) w.textContent = weekendName;
        if (s) s.textContent = sessionSlug;
    }

    // ---------- Phase F: Export/Import modal ----------

    function ensureActionsBar() {
        var bc = document.querySelector('.history-breadcrumb');
        if (!bc || bc.querySelector('.history-actions')) return;
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        var actions = document.createElement('span');
        actions.className = 'history-actions';
        actions.innerHTML = ''
            + '<button class="history-action-btn" data-act="export">Export Driver…</button>'
            + '<button class="history-action-btn" data-act="import">Import Ghost…</button>';
        bc.appendChild(spacer);
        bc.appendChild(actions);
        actions.addEventListener('click', function (e) {
            var btn = e.target.closest('.history-action-btn');
            if (!btn) return;
            if (btn.dataset.act === 'export') openExportModal();
            else if (btn.dataset.act === 'import') openImportModal();
        });
    }

    function openModal(title, bodyHtml, onConfirm) {
        var overlay = document.createElement('div');
        overlay.className = 'history-modal-overlay';
        overlay.innerHTML = ''
            + '<div class="history-modal">'
            +   '<div class="history-modal-header">' + escapeHtml(title)
            +     '<button class="history-modal-close">&times;</button>'
            +   '</div>'
            +   '<div class="history-modal-body">' + bodyHtml + '</div>'
            +   '<div class="history-modal-footer">'
            +     '<button class="history-modal-cancel">Cancel</button>'
            +     '<button class="history-modal-confirm">OK</button>'
            +   '</div>'
            + '</div>';
        document.body.appendChild(overlay);

        function dismiss() { overlay.remove(); }
        overlay.querySelector('.history-modal-close').addEventListener('click', dismiss);
        overlay.querySelector('.history-modal-cancel').addEventListener('click', dismiss);
        overlay.querySelector('.history-modal-confirm').addEventListener('click', function () {
            Promise.resolve(onConfirm(overlay)).then(dismiss, function (err) {
                var body = overlay.querySelector('.history-modal-body');
                body.insertAdjacentHTML('beforeend', '<div class="history-modal-error">' + escapeHtml(String(err)) + '</div>');
            });
        });
    }

    function openExportModal() {
        var drivers = state.session && state.session.drivers;
        if (!drivers) return;
        var rows = Object.keys(drivers).map(function (k) {
            var d = drivers[k];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
            return '<label class="export-row">'
                + '<input type="radio" name="exportDriver" value="' + k + '"/>'
                + '<span class="driver-dot" style="background:' + color + '"></span>'
                + escapeHtml(d.name) + ' (' + d.lapCount + ' laps)'
                + '</label>';
        }).join('');
        openModal('Export Driver', rows, function (overlay) {
            var sel = overlay.querySelector('input[name="exportDriver"]:checked');
            if (!sel) throw new Error('pick a driver');
            var url = '/api/sessions/' + encodeURIComponent(state.folder)
                + '/' + encodeURIComponent(state.slug)
                + '/export?carIdx=' + sel.value;
            var a = document.createElement('a');
            a.href = url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
    }

    function openImportModal() {
        var body = '<p style="margin-top:0">Pick a ghost JSON exported from another session. Track must match.</p>'
            + '<input type="file" id="ghostFile" accept=".json" />';
        openModal('Import Ghost', body, function (overlay) {
            var fileInput = overlay.querySelector('#ghostFile');
            if (!fileInput.files || fileInput.files.length === 0) throw new Error('pick a file');
            var file = fileInput.files[0];
            var url = '/api/history/import?folder=' + encodeURIComponent(state.folder)
                + '&slug=' + encodeURIComponent(state.slug);
            return file.arrayBuffer().then(function (buf) {
                return fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: buf,
                });
            }).then(function (r) {
                if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
                return r.json();
            }).then(function (res) {
                // Slot the ghost driver into state.session.drivers under a synthetic carIdx.
                var ghostKey = 100 + Math.floor(Math.random() * 100);
                state.session.drivers[ghostKey] = Object.assign({}, res.driver, {
                    name: '[G] ' + res.driver.name,
                });
                state.driverSelection.set(ghostKey, {
                    lap: fastestValidLap(res.driver.laps),
                    ghost: true,
                });
                renderCurrentSubTab();
            });
        });
    }

    // ---------- DriverPicker component ----------
    // opts: { drivers: {carIdx: {...}}, supportLapSelector: bool, allowGhosts: bool, onChange: fn }
    // Returns a DOM node the caller appends somewhere. Re-renderable via .refresh() on the node.
    function DriverPicker(opts) {
        var container = document.createElement('div');
        container.className = 'history-driver-picker';

        function render() {
            var rows = Object.keys(opts.drivers || {}).sort(function (a, b) {
                return Number(a) - Number(b);
            });
            var html = '<div class="driver-picker-header">Drivers</div>';
            rows.forEach(function (carIdx) {
                var d = opts.drivers[carIdx];
                var teamColor = (typeof teamAccentColor === 'function')
                    ? teamAccentColor(d.teamId) : '#9aa0a6';
                var sel = state.driverSelection.get(Number(carIdx));
                var checked = sel ? 'checked' : '';
                var ghostBadge = (sel && sel.ghost) ? '<span class="driver-ghost-badge">G</span>' : '';
                html += '<label class="driver-row" data-car="' + carIdx + '">'
                      + '<input type="checkbox" class="driver-check" ' + checked + ' />'
                      + '<span class="driver-dot" style="background:' + teamColor + '"></span>'
                      + '<span class="driver-name">' + escapeHtml(d.name || ('Car ' + carIdx)) + '</span>'
                      + ghostBadge;
                if (opts.supportLapSelector) {
                    html += '<select class="driver-lap-select">';
                    (d.laps || []).forEach(function (l) {
                        var selAttr = (sel && sel.lap === l.lapNum) ? ' selected' : '';
                        var lapLabel = 'L' + l.lapNum + ' — ' + formatLapTime(l.lapTimeMs)
                                     + (l.valid ? '' : ' ✗');
                        html += '<option value="' + l.lapNum + '"' + selAttr + '>'
                              + escapeHtml(lapLabel) + '</option>';
                    });
                    html += '</select>';
                }
                html += '</label>';
            });
            container.innerHTML = html;

            container.querySelectorAll('.driver-check').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var row = cb.closest('.driver-row');
                    var carIdx = Number(row.dataset.car);
                    if (cb.checked) {
                        var d = opts.drivers[carIdx];
                        var existing = state.driverSelection.get(carIdx);
                        state.driverSelection.set(carIdx, {
                            lap: existing ? existing.lap : fastestValidLap(d.laps),
                            ghost: existing ? existing.ghost : false,
                        });
                    } else {
                        state.driverSelection.delete(carIdx);
                    }
                    if (opts.onChange) opts.onChange();
                });
            });
            container.querySelectorAll('.driver-lap-select').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    var row = sel.closest('.driver-row');
                    var carIdx = Number(row.dataset.car);
                    var existing = state.driverSelection.get(carIdx) || { ghost: false };
                    existing.lap = Number(sel.value);
                    state.driverSelection.set(carIdx, existing);
                    if (opts.onChange) opts.onChange();
                });
            });
        }

        render();
        container.refresh = render;
        return container;
    }

    // ---------- helpers ----------

    function fastestValidLap(laps) {
        if (!laps || laps.length === 0) return null;
        var best = null;
        for (var i = 0; i < laps.length; i++) {
            var l = laps[i];
            if (!l.valid) continue;
            if (best == null || l.lapTimeMs < best.lapTimeMs) best = l;
        }
        return best ? best.lapNum : laps[0].lapNum;
    }

    function formatLapTime(ms) {
        if (!ms || ms <= 0) return '—';
        var m = Math.floor(ms / 60000);
        var s = ((ms % 60000) / 1000).toFixed(3);
        return m + ':' + (s.padStart(6, '0'));
    }

    function formatSectorTime(ms) {
        if (!ms || ms <= 0) return '—';
        return (ms / 1000).toFixed(3);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Lazy sample fetch keyed by (carIdx, lap).
    function fetchLapSamples(carIdx, lap) {
        var key = carIdx + ':' + lap;
        if (state.lapSamplesCache.has(key)) {
            return Promise.resolve(state.lapSamplesCache.get(key));
        }
        var url = '/api/sessions/' + encodeURIComponent(state.folder) + '/'
                + encodeURIComponent(state.slug) + '/lap-samples?carIdx=' + carIdx + '&lap=' + lap;
        return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                state.lapSamplesCache.set(key, data);
                return data;
            });
    }

    // ---------- wire up sub-tab click handlers once ----------
    document.addEventListener('click', function (e) {
        var sub = e.target.closest('.history-subtab');
        if (sub) {
            switchSubTab(sub.dataset.sub);
            return;
        }
        var back = e.target.closest('.history-back');
        if (back) close();
    });

    // ---------- expose ----------
    window.HistoryDetail = {
        open: open,
        close: close,
        get state() { return state; },
        DriverPicker: DriverPicker,
        formatLapTime: formatLapTime,
        formatSectorTime: formatSectorTime,
        fetchLapSamples: fetchLapSamples,
    };
})();
