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
        closeEventsFilterPanel();
        state.session = null;
    }

    // ---------- sub-tab switching ----------

    function switchSubTab(id) {
        state.subTab = id;
        var tabs = document.querySelectorAll('.history-sidenav-item');
        tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.sub === id);
        });
        renderCurrentSubTab();
    }

    function renderCurrentSubTab() {
        var body = document.getElementById('historyDetailBody');
        if (!body) return;
        if (state.subTab !== 'events') closeEventsFilterPanel();
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

    // Session category drives cell layout.
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

        var bests = computeBests(sess.drivers);
        var pbByDriver = {};
        Object.keys(sess.drivers || {}).forEach(function (k) {
            pbByDriver[k] = personalBest(sess.drivers[k].laps);
        });

        var driverOrder = orderDriversForTable(cat, sess, isQuali && lapTimesState.virtualMode);
        var maxLap = computeMaxLap(sess.drivers);

        var toolbar = '';
        if (isQuali) {
            toolbar = '<div class="lt-toolbar">'
                + '<div class="lt-toggle">'
                + '<button class="lt-mode ' + (!lapTimesState.virtualMode ? 'active' : '') + '" data-mode="real">Real</button>'
                + '<button class="lt-mode ' + (lapTimesState.virtualMode ? 'active' : '') + '" data-mode="virtual">Virtual Best</button>'
                + '</div>'
                + '</div>';
        }

        var pivot = renderLapPivotTable(cat, sess, bests, pbByDriver, lapTimesState.virtualMode, driverOrder, maxLap);
        var virtualGrid = isQuali ? renderVirtualGrid(sess.drivers) : '';

        body.innerHTML =
            '<div class="lt-container">'
            + toolbar
            + pivot
            + virtualGrid
            + '</div>';

        body.querySelectorAll('.lt-mode').forEach(function (btn) {
            btn.addEventListener('click', function () {
                lapTimesState.virtualMode = btn.dataset.mode === 'virtual';
                renderLapTimes(body);
            });
        });

        var wrap = body.querySelector('.lap-grid-wrap');
        if (wrap) attachTyrePopupHandlers(wrap);
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

    // Race: final position from FinalClassification packet; fallback to best lap.
    // Quali/practice: best lap (virtual sum in virtualMode).
    function orderDriversForTable(cat, sess, useVirtual) {
        var drivers = sess.drivers || {};
        if (cat === 'race') {
            var fc = sess.finalClassification;
            var cd = fc && fc.classificationData;
            if (cd && cd.length) {
                var keys = Object.keys(drivers);
                var withPos = keys.map(function (k) {
                    var idx = Number(k);
                    var pos = (cd[idx] && cd[idx].position) ? cd[idx].position : 999;
                    return { key: k, pos: pos };
                });
                withPos.sort(function (a, b) { return a.pos - b.pos; });
                return withPos.map(function (r) { return r.key; });
            }
        }
        return orderDriversByBest(drivers, useVirtual);
    }

    function renderLapPivotTable(cat, sess, bests, pbByDriver, virtualMode, driverOrder, maxLap) {
        var drivers = sess.drivers || {};

        // Header: driver columns with team-color line + full name.
        var headCells = driverOrder.map(function (carIdx) {
            var d = drivers[carIdx];
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(d.teamId) : '#9aa0a6';
            var pb = pbByDriver[carIdx];
            var pbText = pb && pb.lap !== Infinity ? formatLapTime(pb.lap) : '—';
            return '<th class="lap-grid__driver-th" style="border-top-color:' + teamColor + '">'
                + '<div class="lap-grid__driver-name">' + escapeHtml(d.name || ('Car ' + carIdx)) + '</div>'
                + '<div class="lap-grid__driver-pb">PB ' + pbText + '</div>'
                + '</th>';
        }).join('');

        // Body: one row per lap.
        var rowsHtml = '';
        for (var lapNum = 1; lapNum <= maxLap; lapNum++) {
            var rowCls = rowFlagClass(lapNum, drivers, driverOrder);
            var cells = driverOrder.map(function (carIdx) {
                var lap = lapByNum(drivers[carIdx].laps, lapNum);
                if (!lap) return '<td class="lap-cell lap-cell--empty"><div class="lap-cell__inner">—</div></td>';
                return renderLapCell(lap, cat, bests, pbByDriver[carIdx], virtualMode);
            }).join('');
            rowsHtml += '<tr class="' + rowCls + '">'
                + '<th class="lap-grid__lap-th">' + lapNum + '</th>'
                + cells
                + '</tr>';
        }

        return ''
            + '<div class="lap-grid-wrap">'
            +   '<table class="lap-grid lap-grid--' + cat + '">'
            +     '<thead><tr>'
            +       '<th class="lap-grid__lap-th lap-grid__lap-th--head">Lap</th>'
            +       headCells
            +     '</tr></thead>'
            +     '<tbody>' + rowsHtml + '</tbody>'
            +   '</table>'
            + '</div>';
    }

    function lapByNum(laps, n) {
        if (!laps) return null;
        for (var i = 0; i < laps.length; i++) {
            if (laps[i].lapNum === n) return laps[i];
        }
        return null;
    }

    // Row background when SC / VSC / Red Flag was active for most drivers on this lap.
    function rowFlagClass(lapNum, drivers, driverOrder) {
        var counts = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        driverOrder.forEach(function (carIdx) {
            var lap = lapByNum(drivers[carIdx].laps, lapNum);
            if (!lap) return;
            counts.total++;
            if (lap.raceFlag && counts[lap.raceFlag] != null) counts[lap.raceFlag]++;
        });
        if (counts.total === 0) return '';
        var half = counts.total / 2;
        if (counts[4] >= half) return 'lap-row lap-row--rf';
        if (counts[2] >= half) return 'lap-row lap-row--sc';
        if (counts[3] >= half) return 'lap-row lap-row--vsc';
        if (counts[1] >= half) return 'lap-row lap-row--yellow';
        return 'lap-row';
    }

    // Main cell: time + tags on the left, tyre (+ sectors in quali) on the right.
    function renderLapCell(l, cat, bests, pb, virtualMode) {
        var invalid = !l.valid;
        var timeMs = l.lapTimeMs;
        var timeCls = 'lap-cell__time';
        if (invalid) timeCls += ' lap-cell__time--invalid';
        else if (bests.lap !== Infinity && timeMs === bests.lap) timeCls += ' lap-cell__time--sb';
        else if (pb && pb.lap !== Infinity && timeMs === pb.lap) timeCls += ' lap-cell__time--pb';

        var timeText = timeMs > 0 ? formatLapTime(timeMs) : '—';
        if (cat === 'qualifying' && virtualMode) {
            var vb = (pb && pb.s1 !== Infinity && pb.s2 !== Infinity && pb.s3 !== Infinity)
                ? (pb.s1 + pb.s2 + pb.s3) : 0;
            if (vb > 0) {
                timeText = formatLapTime(vb);
                timeCls = 'lap-cell__time lap-cell__time--virtual';
            }
        }

        var tags = lapTagsHtml(l, cat);
        var timeBlock = ''
            + '<div class="lap-cell__left">'
            +   '<div class="' + timeCls + '">' + timeText + '</div>'
            +   (tags ? '<div class="lap-cell__tags">' + tags + '</div>' : '')
            + '</div>';

        var rightBlocks = '';
        if (cat === 'qualifying') {
            rightBlocks += sectorsStackHtml(l, bests, pb);
        }
        rightBlocks += tyreCellHtml(l);

        var cellCls = 'lap-cell lap-cell--' + cat;
        if (invalid) cellCls += ' lap-cell--invalid';
        return '<td class="' + cellCls + '"><div class="lap-cell__inner">' + timeBlock + rightBlocks + '</div></td>';
    }

    function lapTagsHtml(l, cat) {
        var out = '';
        if (cat !== 'qualifying' && l.pit) {
            out += '<span class="lap-tag lap-tag--pit" title="Pit Stop">PIT</span>';
        }
        if (l.raceFlag === 2) out += '<span class="lap-tag lap-tag--sc" title="Safety Car">SC</span>';
        else if (l.raceFlag === 3) out += '<span class="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>';
        else if (l.raceFlag === 4) out += '<span class="lap-tag lap-tag--rf" title="Red Flag">RF</span>';
        else if (l.raceFlag === 1) out += '<span class="lap-tag lap-tag--yellow" title="Yellow">Y</span>';
        return out;
    }

    function sectorsStackHtml(l, bests, pb) {
        function seg(ms, bestField) {
            if (!ms || ms <= 0) {
                return '<span class="lap-sector lap-sector--empty">—</span>';
            }
            var cls = 'lap-sector';
            if (bests[bestField] !== Infinity && ms === bests[bestField]) cls += ' lap-sector--sb';
            else if (pb && pb[bestField] !== Infinity && ms === pb[bestField]) cls += ' lap-sector--pb';
            return '<span class="' + cls + '">' + formatSectorTime(ms) + '</span>';
        }
        return '<div class="lap-cell__sectors">'
            + seg(l.s1Ms, 's1')
            + seg(l.s2Ms, 's2')
            + seg(l.s3Ms, 's3')
            + '</div>';
    }

    function tyreCellHtml(l) {
        var visual = l.compoundVisual;
        var name = (typeof VISUAL_COMPOUNDS !== 'undefined' && VISUAL_COMPOUNDS[visual])
            ? VISUAL_COMPOUNDS[visual] : '?';
        var color = (typeof COMPOUND_DOT_COLORS !== 'undefined' && COMPOUND_DOT_COLORS[visual])
            ? COMPOUND_DOT_COLORS[visual] : '#666';
        var label = name.charAt(0);
        var wearArr = l.tyreWearEnd;
        var hasWear = wearArr && wearArr.length === 4;
        var avg = hasWear ? Math.round((wearArr[0] + wearArr[1] + wearArr[2] + wearArr[3]) / 4) : null;

        // tyreWearEnd order matches UDP spec: [RL, RR, FL, FR].
        // Encode wear data as data-* attributes — hover handler renders a floating popup
        // in <body> so it isn't clipped by the grid's overflow container.
        var dataAttrs = 'data-tyre-name="' + escapeHtml(name) + '"';
        if (l.tyreAge != null) dataAttrs += ' data-tyre-age="' + l.tyreAge + '"';
        if (hasWear) {
            dataAttrs += ' data-wear-fl="' + Math.round(wearArr[2]) + '"'
                      +  ' data-wear-fr="' + Math.round(wearArr[3]) + '"'
                      +  ' data-wear-rl="' + Math.round(wearArr[0]) + '"'
                      +  ' data-wear-rr="' + Math.round(wearArr[1]) + '"';
        }

        return '<div class="lap-cell__tyre" ' + dataAttrs + '>'
            + '<span class="compound-badge" style="background:' + color + '">' + label + '</span>'
            + (avg != null ? '<span class="lap-cell__wear">' + avg + '%</span>' : '')
            + '</div>';
    }

    // Singleton tyre-info popup floater rendered in <body>. Positioned relative to the
    // hovered .lap-cell__tyre element via getBoundingClientRect so it escapes the
    // lap-grid-wrap's overflow clipping.
    var tyrePopupEl = null;
    function ensureTyrePopupEl() {
        if (tyrePopupEl) return tyrePopupEl;
        tyrePopupEl = document.createElement('div');
        tyrePopupEl.className = 'tyre-popup';
        tyrePopupEl.style.display = 'none';
        document.body.appendChild(tyrePopupEl);
        return tyrePopupEl;
    }

    function showTyrePopup(anchor) {
        var popup = ensureTyrePopupEl();
        var name = anchor.getAttribute('data-tyre-name') || '';
        var age = anchor.getAttribute('data-tyre-age');
        var fl = anchor.getAttribute('data-wear-fl');
        if (fl == null) { hideTyrePopup(); return; }
        var fr = anchor.getAttribute('data-wear-fr');
        var rl = anchor.getAttribute('data-wear-rl');
        var rr = anchor.getAttribute('data-wear-rr');
        popup.innerHTML = ''
            + '<div class="tyre-popup__title">' + escapeHtml(name)
            +   (age != null ? ' <span class="tyre-popup__age">(' + age + ' laps)</span>' : '')
            + '</div>'
            + '<div class="tyre-popup__grid">'
            +   '<div class="tyre-popup__cell"><span class="tyre-popup__lbl">FL</span><span class="tyre-popup__val">' + fl + '%</span></div>'
            +   '<div class="tyre-popup__cell"><span class="tyre-popup__lbl">FR</span><span class="tyre-popup__val">' + fr + '%</span></div>'
            +   '<div class="tyre-popup__cell"><span class="tyre-popup__lbl">RL</span><span class="tyre-popup__val">' + rl + '%</span></div>'
            +   '<div class="tyre-popup__cell"><span class="tyre-popup__lbl">RR</span><span class="tyre-popup__val">' + rr + '%</span></div>'
            + '</div>';
        popup.style.display = 'block';
        var r = anchor.getBoundingClientRect();
        var pw = popup.offsetWidth;
        var ph = popup.offsetHeight;
        var x = r.right - pw;
        if (x < 8) x = r.left;
        if (x + pw > window.innerWidth - 8) x = window.innerWidth - pw - 8;
        var y = r.bottom + 6;
        if (y + ph > window.innerHeight - 8) y = r.top - ph - 6;
        popup.style.left = Math.max(8, x) + 'px';
        popup.style.top = Math.max(8, y) + 'px';
    }

    function hideTyrePopup() {
        if (tyrePopupEl) tyrePopupEl.style.display = 'none';
    }

    function attachTyrePopupHandlers(root) {
        root.addEventListener('mouseover', function (e) {
            var t = e.target.closest ? e.target.closest('.lap-cell__tyre') : null;
            if (t && root.contains(t)) showTyrePopup(t);
        });
        root.addEventListener('mouseout', function (e) {
            var t = e.target.closest ? e.target.closest('.lap-cell__tyre') : null;
            if (!t) return;
            var next = e.relatedTarget;
            if (next && next.closest && next.closest('.lap-cell__tyre') === t) return;
            hideTyrePopup();
        });
        root.addEventListener('scroll', hideTyrePopup, true);
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
            +   '<div class="pos-chart">'
            +     '<div class="pos-legend">'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--yellow"></span>Yellow flag</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--sc"></span>Safety car</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--vsc"></span>VSC</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--red"></span>Red flag</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--pit"></span>Pit stop</span>'
            +     '</div>'
            +     '<div class="pos-chart-wrap" id="posChart"></div>'
            +   '</div>'
            +   '<div class="pos-stints">'
            +     '<div class="pos-stints-title">Tyre stints</div>'
            +     '<div id="posStints"></div>'
            +   '</div>'
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

        // SVG dims (intrinsic); CSS scales it. Extra L/R pad = driver-code labels.
        var W = 960, H = 500, PAD_L = 58, PAD_R = 58, PAD_T = 32, PAD_B = 18;
        var plotW = W - PAD_L - PAD_R;
        var plotH = H - PAD_T - PAD_B;
        var lapStep = plotW / Math.max(1, totalLaps - 1);

        function x(lap) { return PAD_L + (lap - 1) * lapStep; }
        function y(pos) { return PAD_T + (pos - 1) / Math.max(1, totalDrivers - 1) * plotH; }

        // Race-flag bands: max flag per lap, collapsed into consecutive same-flag ranges.
        var flagByLap = {};
        (sess.events || []).forEach(function (e) {
            if (e.flag != null && e.lap != null) flagByLap[e.lap] = Math.max(flagByLap[e.lap] || 0, e.flag);
        });
        var bands = '';
        var bandClass = function (f) {
            return f === 2 ? 'pos-band-sc'
                : f === 3 ? 'pos-band-vsc'
                : f === 4 ? 'pos-band-red' : 'pos-band-yellow';
        };
        var groupStart = null, groupFlag = 0;
        for (var lap = 1; lap <= totalLaps + 1; lap++) {
            var f = flagByLap[lap] || 0;
            if (f !== groupFlag) {
                if (groupFlag > 0 && groupStart !== null) {
                    var xs = x(groupStart) - lapStep / 2;
                    var xe = x(lap - 1) + lapStep / 2;
                    bands += '<rect class="' + bandClass(groupFlag) + '" x="' + xs + '" y="' + PAD_T
                        + '" width="' + (xe - xs) + '" height="' + plotH + '"/>';
                }
                groupFlag = f;
                groupStart = f > 0 ? lap : null;
            }
        }

        // Grid lines + Y labels at every position (bold at 1/5/10/15/20), lap labels at top.
        var ticks = '';
        for (var p = 1; p <= totalDrivers; p++) {
            var yp = y(p);
            ticks += '<line class="pos-grid" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + yp + '" y2="' + yp + '"/>';
            if (p === 1 || p % 5 === 0 || p === totalDrivers) {
                ticks += '<text class="pos-ytick" x="' + (PAD_L - 8) + '" y="' + (yp + 4) + '" text-anchor="end">' + p + '</text>';
                ticks += '<text class="pos-ytick" x="' + (W - PAD_R + 8) + '" y="' + (yp + 4) + '" text-anchor="start">' + p + '</text>';
            }
        }
        for (var lx = 1; lx <= totalLaps; lx += 5) {
            ticks += '<line class="pos-grid pos-grid--v" x1="' + x(lx) + '" x2="' + x(lx) + '" y1="' + PAD_T + '" y2="' + (H - PAD_B) + '"/>';
            ticks += '<text class="pos-xtick" x="' + x(lx) + '" y="' + (PAD_T - 10) + '" text-anchor="middle">' + lx + '</text>';
        }
        if ((totalLaps - 1) % 5 !== 0) {
            ticks += '<text class="pos-xtick" x="' + x(totalLaps) + '" y="' + (PAD_T - 10) + '" text-anchor="middle">' + totalLaps + '</text>';
        }

        // Driver polylines + pit badges + end/start code labels.
        var lines = '';
        var markers = '';
        var labels = '';
        selected.forEach(function (k) {
            var d = sess.drivers[k];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
            var code = driverCode(d.name);
            var validLaps = (d.laps || []).filter(function (l) { return l.position > 0; });
            if (validLaps.length === 0) return;

            var pts = validLaps.map(function (l) { return x(l.lapNum) + ',' + y(l.position); });
            lines += '<polyline class="pos-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';

            (d.laps || []).forEach(function (l) {
                if (l.pit && l.position > 0) {
                    var cx = x(l.lapNum), cy = y(l.position);
                    markers += '<g class="pos-pit-badge">'
                        + '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + color + '" stroke="#fff" stroke-width="1"/>'
                        + '<text class="pos-pit-letter" x="' + cx + '" y="' + (cy + 2.5) + '" text-anchor="middle">P</text>'
                        + '</g>';
                }
            });

            var first = validLaps[0];
            var last = validLaps[validLaps.length - 1];
            labels += '<text class="pos-driver-label" x="' + (PAD_L - 10) + '" y="' + (y(first.position) + 4)
                + '" text-anchor="end" fill="' + color + '">' + escapeHtml(code) + '</text>';
            labels += '<text class="pos-driver-label" x="' + (W - PAD_R + 10) + '" y="' + (y(last.position) + 4)
                + '" text-anchor="start" fill="' + color + '">' + escapeHtml(code) + '</text>';
        });

        host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pos-svg" preserveAspectRatio="xMidYMid meet">'
            + bands + ticks + lines + markers + labels + '</svg>';
    }

    function driverCode(name) {
        if (!name) return '?';
        var parts = String(name).trim().split(/\s+/);
        var base = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        return base.substring(0, 3).toUpperCase();
    }

    function drawStintStrips() {
        var host = document.getElementById('posStints');
        if (!host) return;
        var sess = state.session;
        var selected = Array.from(state.driverSelection.keys()).filter(function (k) {
            return sess.drivers && sess.drivers[k];
        });
        if (selected.length === 0) {
            host.innerHTML = '<div class="history-placeholder">Select drivers to view stints.</div>';
            return;
        }

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

    var HISTORY_EVENT_FILTER_KEY = 'f1telemetry_event_filter_v1';
    var eventsState = {
        query: '',
        codeFilter: loadEventFilter(),
        panel: null,
        panelButton: null,
    };

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

    var EVENT_CODE_COLORS = {
        'SSTA': '#22c55e', 'SEND': '#22c55e', 'LGOT': '#22c55e', 'CHQF': '#22c55e',
        'FTLP': '#a855f7', 'RCWN': '#c084fc',
        'PENA': '#ef4444', 'DTSV': '#ef4444', 'SGSV': '#ef4444', 'RDFL': '#ef4444',
        'SCAR': '#eab308', 'COLL': '#f59e0b', 'FLBK': '#f59e0b',
        'DRSE': '#38bdf8', 'DRSD': '#38bdf8', 'SPTP': '#38bdf8', 'STLG': '#38bdf8',
        'OVTK': '#fb923c', 'RTMT': '#fb923c', 'TMPT': '#fb923c',
        'BUTN': '#6b7280',
    };

    function loadEventFilter() {
        try {
            var raw = localStorage.getItem(HISTORY_EVENT_FILTER_KEY);
            if (raw) {
                var saved = JSON.parse(raw);
                var filter = {};
                Object.keys(EVENT_NAMES).forEach(function (code) {
                    filter[code] = saved[code] !== undefined ? saved[code] : (code !== 'BUTN');
                });
                return filter;
            }
        } catch (_) { /* ignore */ }

        var defaults = {};
        Object.keys(EVENT_NAMES).forEach(function (code) {
            defaults[code] = code !== 'BUTN';
        });
        return defaults;
    }

    function saveEventFilter() {
        localStorage.setItem(HISTORY_EVENT_FILTER_KEY, JSON.stringify(eventsState.codeFilter));
    }

    function closeEventsFilterPanel() {
        if (eventsState.panel) {
            eventsState.panel.remove();
            eventsState.panel = null;
            if (eventsState.panelButton) eventsState.panelButton.classList.remove('active');
            eventsState.panelButton = null;
        }
    }

    function onEventsPanelOutsideClick(e) {
        if (!eventsState.panel) return;
        var button = eventsState.panelButton;
        if (eventsState.panel.contains(e.target)) return;
        if (button && (button === e.target || button.contains(e.target))) return;
        closeEventsFilterPanel();
    }

    function openEventsFilterPanel(button, body, events) {
        closeEventsFilterPanel();

        var panel = document.createElement('div');
        panel.className = 'event-filter-panel';

        var html = '<div class="event-filter-actions">'
            + '<button class="event-filter-action-btn" data-ef-action="all">All</button>'
            + '<button class="event-filter-action-btn" data-ef-action="none">None</button></div>';
        Object.keys(EVENT_NAMES).forEach(function (code) {
            var checked = eventsState.codeFilter[code] !== false ? 'checked' : '';
            var codeCol = EVENT_CODE_COLORS[code] || 'var(--accent-blue)';
            html += '<label class="event-filter-item"><input type="checkbox" data-event-code="' + code + '" ' + checked + '>'
                + '<span class="event-filter-code" style="color:' + codeCol + '">' + code + '</span>'
                + EVENT_NAMES[code] + '</label>';
        });
        panel.innerHTML = html;
        panel.addEventListener('click', function (ev) { ev.stopPropagation(); });

        document.body.appendChild(panel);
        var rect = button.getBoundingClientRect();
        panel.style.top = (rect.bottom + 4) + 'px';
        panel.style.left = Math.max(4, rect.right - 260) + 'px';

        panel.querySelectorAll('input[data-event-code]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                eventsState.codeFilter[cb.dataset.eventCode] = cb.checked;
                saveEventFilter();
                updateEventFilterHint(body);
                renderEventRows(body, events);
            });
        });

        var all = panel.querySelector('[data-ef-action="all"]');
        if (all) {
            all.addEventListener('click', function () {
                Object.keys(EVENT_NAMES).forEach(function (code) { eventsState.codeFilter[code] = true; });
                panel.querySelectorAll('input[data-event-code]').forEach(function (cb) { cb.checked = true; });
                saveEventFilter();
                updateEventFilterHint(body);
                renderEventRows(body, events);
            });
        }

        var none = panel.querySelector('[data-ef-action="none"]');
        if (none) {
            none.addEventListener('click', function () {
                Object.keys(EVENT_NAMES).forEach(function (code) { eventsState.codeFilter[code] = false; });
                panel.querySelectorAll('input[data-event-code]').forEach(function (cb) { cb.checked = false; });
                saveEventFilter();
                updateEventFilterHint(body);
                renderEventRows(body, events);
            });
        }

        eventsState.panel = panel;
        eventsState.panelButton = button;
        button.classList.add('active');
    }

    function updateEventFilterHint(body) {
        if (!body) return;
        var selectedCount = Object.keys(EVENT_NAMES).reduce(function (acc, code) {
            return acc + (eventsState.codeFilter[code] === false ? 0 : 1);
        }, 0);
        var hint = body.querySelector('.ev-filter-hint');
        if (!hint) return;
        hint.textContent = 'Event filters (' + selectedCount + '/' + Object.keys(EVENT_NAMES).length + ')';
        hint.title = 'Selected event types: ' + selectedCount;
    }

    function renderEvents(body) {
        var sess = state.session;
        var events = sess.events || [];

        body.innerHTML = ''
            + '<div class="ev-toolbar">'
            +   '<div class="ev-tools">'
            +     '<button class="event-filter-toggle ev-filter-toggle" id="evFilterBtn" title="Filter events" aria-label="Filter events">'
            +       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>'
            +     '</button>'
            +     '<span class="ev-filter-hint">Event filters</span>'
            +   '</div>'
            +   '<input type="search" class="ev-search" placeholder="Filter driver…"/>'
            + '</div>'
            + '<table class="ev-table"><thead>'
            +   '<tr><th>Time</th><th>Lap</th><th>Event</th><th>Driver</th><th>Details</th></tr>'
            + '</thead><tbody id="evTbody"></tbody></table>';

        closeEventsFilterPanel();
        var filterButton = body.querySelector('#evFilterBtn');
        if (filterButton) {
            filterButton.addEventListener('click', function (e) {
                e.stopPropagation();
                if (eventsState.panel) {
                    closeEventsFilterPanel();
                    return;
                }
                openEventsFilterPanel(filterButton, body, events);
            });
        }

        if (!eventsState._outsideClickBound) {
            document.addEventListener('click', onEventsPanelOutsideClick);
            eventsState._outsideClickBound = true;
        }

        updateEventFilterHint(body);

        if (filterButton) filterButton.classList.remove('active');

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
        var query = eventsState.query;

        var rows = events.filter(function (e) {
            if (eventsState.codeFilter[e.code] === false) return false;
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
        var sub = e.target.closest('.history-sidenav-item');
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
