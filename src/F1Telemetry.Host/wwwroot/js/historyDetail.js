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
        compareState: { referenceCarIdx: null, referenceLap: null },
        lapSamplesCache: new Map(),  // key: carIdx + ':' + lap
    };

    // ---------- public API ----------

    function open(folder, slug, weekendName) {
        state.folder = folder;
        state.slug = slug;
        state.session = null;
        state.driverSelection = new Map();
        state.compareState = { referenceCarIdx: null, referenceLap: null };
        state.lapSamplesCache = new Map();

        var list = document.getElementById('historyListView') || document.getElementById('historySessionList');
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
                updateHistorySubTabsVisibility();
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
        var list = document.getElementById('historyListView') || document.getElementById('historySessionList');
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


    function isRaceSession() {
        return state.session && sessionCategory((state.session.meta || {}).sessionType) === 'race';
    }

    function updateHistorySubTabsVisibility() {
        var posTab = document.querySelector('.history-sidenav-item[data-sub="positions"]');
        if (!posTab) return;
        var show = isRaceSession();
        posTab.hidden = !show;
        if (!show && state.subTab === 'positions') {
            switchSubTab('laptimes');
        }
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

    // Which sub-columns appear under each driver's column group, per session category.
    // The table itself is rendered by the same code for every category — only this spec
    // + which renderers we call differ.
    var LAP_COLUMNS_BY_CAT = {
        practice:   ['time', 'wear'],
        qualifying: ['time', 'sectors', 'wear'],
        race:       ['time', 'delta', 'wear', 'perf'],
        time_trial: ['time', 'sectors', 'wear'],
        unknown:    ['time', 'wear'],
    };

    var SUB_COL_LABELS = {
        time: 'Time', sectors: 'Sec', wear: 'Wear', delta: 'Δ', perf: 'Perf',
    };

    // Delta classification (seconds) relative to REF lap within a stint.
    var DELTA_THRESHOLDS = { neutral: 0.8, warn: 1.5 };

    function renderLapPivotTable(cat, sess, bests, pbByDriver, virtualMode, driverOrder, maxLap) {
        var drivers = sess.drivers || {};
        var cols = LAP_COLUMNS_BY_CAT[cat] || LAP_COLUMNS_BY_CAT.unknown;
        var colCount = cols.length;

        // Race-only: precompute REF lap per (driver, stint) so every cell can just look it up.
        var refIndex = cat === 'race' ? buildRefIndex(driverOrder, drivers) : null;

        // Top header row: one <th> per driver, colspan = number of sub-columns.
        var topCells = driverOrder.map(function (carIdx) {
            var d = drivers[carIdx];
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(d.teamId) : '#9aa0a6';
            var pb = pbByDriver[carIdx];
            var pbText = pb && pb.lap !== Infinity ? formatLapTime(pb.lap) : '—';
            return '<th class="lap-grid__driver-th" colspan="' + colCount + '" style="border-top-color:' + teamColor + '">'
                + '<div class="lap-grid__driver-name">' + escapeHtml(d.name || ('Car ' + carIdx)) + '</div>'
                + '<div class="lap-grid__driver-pb">PB ' + pbText + '</div>'
                + '</th>';
        }).join('');

        // Second header row: sub-column labels per driver.
        var subCells = driverOrder.map(function () {
            return cols.map(function (key) {
                return '<th class="lap-grid__sub-th lap-grid__sub-th--' + key + '">' + SUB_COL_LABELS[key] + '</th>';
            }).join('');
        }).join('');

        // Body: one row per lap.
        var rowsHtml = '';
        for (var lapNum = 1; lapNum <= maxLap; lapNum++) {
            var rowCls = rowFlagClass(lapNum, drivers, driverOrder);
            var cells = driverOrder.map(function (carIdx) {
                var lap = lapByNum(drivers[carIdx].laps, lapNum);
                if (!lap) {
                    var filler = '';
                    for (var k = 0; k < colCount; k++) {
                        filler += '<td class="lap-cell lap-cell--empty lap-sub--' + cols[k] + '">—</td>';
                    }
                    return filler;
                }
                return renderLapCells(lap, cat, cols, bests, pbByDriver[carIdx], virtualMode,
                    refIndex ? refIndex[carIdx] : null);
            }).join('');
            rowsHtml += '<tr class="' + rowCls + '">'
                + '<th class="lap-grid__lap-th">' + lapNum + '</th>'
                + cells
                + '</tr>';
        }

        return ''
            + '<div class="lap-grid-wrap">'
            +   '<table class="lap-grid lap-grid--' + cat + '">'
            +     '<thead>'
            +       '<tr class="lap-grid__head-row lap-grid__head-row--drivers">'
            +         '<th class="lap-grid__lap-th lap-grid__lap-th--head" rowspan="2">Lap</th>'
            +         topCells
            +       '</tr>'
            +       '<tr class="lap-grid__head-row lap-grid__head-row--sub">'
            +         subCells
            +       '</tr>'
            +     '</thead>'
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

    // Emits one <td> per sub-column listed in `cols`. Each renderer receives the same
    // (lap, ctx) bundle and decides what to draw.
    function renderLapCells(l, cat, cols, bests, pb, virtualMode, refForDriver) {
        var ctx = { cat: cat, bests: bests, pb: pb, virtualMode: virtualMode, refForDriver: refForDriver };
        var out = '';
        for (var i = 0; i < cols.length; i++) {
            var key = cols[i];
            switch (key) {
                case 'time':    out += timeCellHtml(l, ctx); break;
                case 'sectors': out += sectorsCellHtml(l, ctx); break;
                case 'wear':    out += wearCellHtml(l); break;
                case 'delta':   out += deltaCellHtml(l, ctx); break;
                case 'perf':    out += perfCellHtml(l); break;
                default:        out += '<td class="lap-cell lap-sub--' + key + '">—</td>';
            }
        }
        return out;
    }

    function timeCellHtml(l, ctx) {
        var invalid = !l.valid;
        var timeMs = l.lapTimeMs;
        var timeCls = 'lap-cell__time';
        if (invalid) timeCls += ' lap-cell__time--invalid';
        else if (ctx.bests.lap !== Infinity && timeMs === ctx.bests.lap) timeCls += ' lap-cell__time--sb';
        else if (ctx.pb && ctx.pb.lap !== Infinity && timeMs === ctx.pb.lap) timeCls += ' lap-cell__time--pb';

        var timeText = timeMs > 0 ? formatLapTime(timeMs) : '—';
        if (ctx.cat === 'qualifying' && ctx.virtualMode) {
            var vb = (ctx.pb && ctx.pb.s1 !== Infinity && ctx.pb.s2 !== Infinity && ctx.pb.s3 !== Infinity)
                ? (ctx.pb.s1 + ctx.pb.s2 + ctx.pb.s3) : 0;
            if (vb > 0) {
                timeText = formatLapTime(vb);
                timeCls = 'lap-cell__time lap-cell__time--virtual';
            }
        }

        var tags = lapTagsHtml(l, ctx.cat);
        var cellCls = 'lap-cell lap-sub--time';
        if (invalid) cellCls += ' lap-cell--invalid';
        return '<td class="' + cellCls + '">'
            + '<div class="' + timeCls + '">' + timeText + '</div>'
            + (tags ? '<div class="lap-cell__tags">' + tags + '</div>' : '')
            + '</td>';
    }

    function lapTagsHtml(l, cat) {
        var out = '';
        if (cat !== 'qualifying' && l.pit) {
            out += '<span class="lap-tag lap-tag--pit" title="Pit Stop">PIT</span>';
        }
        if (cat === 'race' && l.blueFlag) {
            out += '<span class="lap-tag lap-tag--blue" title="Blue Flag">B</span>';
        }
        if (l.raceFlag === 2) out += '<span class="lap-tag lap-tag--sc" title="Safety Car">SC</span>';
        else if (l.raceFlag === 3) out += '<span class="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>';
        else if (l.raceFlag === 4) out += '<span class="lap-tag lap-tag--rf" title="Red Flag">RF</span>';
        else if (l.raceFlag === 1) out += '<span class="lap-tag lap-tag--yellow" title="Yellow">Y</span>';
        return out;
    }

    function sectorsCellHtml(l, ctx) {
        function seg(ms, bestField) {
            if (!ms || ms <= 0) {
                return '<span class="lap-sector lap-sector--empty">—</span>';
            }
            var cls = 'lap-sector';
            if (ctx.bests[bestField] !== Infinity && ms === ctx.bests[bestField]) cls += ' lap-sector--sb';
            else if (ctx.pb && ctx.pb[bestField] !== Infinity && ms === ctx.pb[bestField]) cls += ' lap-sector--pb';
            return '<span class="' + cls + '">' + formatSectorTime(ms) + '</span>';
        }
        return '<td class="lap-cell lap-sub--sectors">'
            + '<div class="lap-cell__sectors">'
            +   seg(l.s1Ms, 's1') + seg(l.s2Ms, 's2') + seg(l.s3Ms, 's3')
            + '</div>'
            + '</td>';
    }

    // The <td> itself carries the `.lap-cell__tyre` class + data-* attrs that
    // attachTyrePopupHandlers looks for, so the existing popup works without changes.
    function wearCellHtml(l) {
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
        var dataAttrs = 'data-tyre-name="' + escapeHtml(name) + '"';
        if (l.tyreAge != null) dataAttrs += ' data-tyre-age="' + l.tyreAge + '"';
        if (hasWear) {
            dataAttrs += ' data-wear-fl="' + Math.round(wearArr[2]) + '"'
                      +  ' data-wear-fr="' + Math.round(wearArr[3]) + '"'
                      +  ' data-wear-rl="' + Math.round(wearArr[0]) + '"'
                      +  ' data-wear-rr="' + Math.round(wearArr[1]) + '"';
        }

        return '<td class="lap-cell lap-sub--wear lap-cell__tyre" ' + dataAttrs + '>'
            + '<div class="lap-cell__wear-inner">'
            +   '<span class="compound-badge" style="background:' + color + '">' + label + '</span>'
            +   (avg != null ? '<span class="lap-cell__wear">' + avg + '%</span>' : '')
            + '</div>'
            + '</td>';
    }

    function deltaCellHtml(l, ctx) {
        var ref = ctx.refForDriver;
        if (!ref) return '<td class="lap-cell lap-sub--delta">—</td>';
        var info = ref.byLap && ref.byLap[l.lapNum];
        if (!info) return '<td class="lap-cell lap-sub--delta">—</td>';

        // Out-lap of the stint — no meaningful reference.
        if (info.stintLapIdx === 1) {
            return '<td class="lap-cell lap-sub--delta lap-delta--outlap">—</td>';
        }
        // In-lap (pit stop on this lap) carries pit-lane time that would dwarf any stint
        // degradation — render a placeholder instead of a misleading huge delta.
        if (l.pit) {
            return '<td class="lap-cell lap-sub--delta lap-delta--outlap">—</td>';
        }
        // The REF lap itself.
        if (info.isRef) {
            var cls = 'lap-delta lap-delta--ref';
            var title = 'Reference lap for this stint';
            if (info.refUnderSc || info.refFallback) {
                cls += ' lap-delta--ref--dirty';
                title = info.refUnderSc
                    ? 'REF was chosen under SC/VSC — delta values may be optimistic'
                    : 'Fallback REF — no clean laps in the stint start';
            }
            return '<td class="lap-cell lap-sub--delta"><span class="' + cls + '" title="' + title + '">REF</span></td>';
        }
        // Missing / zero lap time → no comparison.
        if (!l.lapTimeMs || !info.refLapTimeMs) {
            return '<td class="lap-cell lap-sub--delta">—</td>';
        }

        var delta = (l.lapTimeMs - info.refLapTimeMs) / 1000;
        var deltaCls = 'lap-delta';
        if (delta < 0) deltaCls += ' lap-delta--faster';
        else if (delta <= DELTA_THRESHOLDS.neutral) deltaCls += ' lap-delta--neutral';
        else if (delta <= DELTA_THRESHOLDS.warn) deltaCls += ' lap-delta--warn';
        else deltaCls += ' lap-delta--bad';

        var sign = delta >= 0 ? '+' : '';
        var text = sign + delta.toFixed(3);
        var cellCls = 'lap-cell lap-sub--delta';
        if (!l.valid || l.pit) cellCls += ' lap-cell--invalid';
        return '<td class="' + cellCls + '"><span class="' + deltaCls + '">' + text + '</span></td>';
    }

    function perfCellHtml(l) {
        var p = l.perf;
        if (!p) return '<td class="lap-cell lap-sub--perf">—</td>';

        var perfPct = typeof p.perfPct === 'number'
            ? Math.max(0, Math.min(100, Math.round(p.perfPct)))
            : null;
        if (perfPct == null) return '<td class="lap-cell lap-sub--perf">—</td>';
        var ersPct = typeof p.ersUsagePct === 'number'
            ? Math.max(0, Math.min(100, Math.round(p.ersUsagePct)))
            : 0;
        var drsPct = typeof p.drsUsagePct === 'number'
            ? Math.max(0, Math.min(100, Math.round(p.drsUsagePct)))
            : 0;

        var title = 'Performance ' + perfPct + '%'
            + ' · ERS usage ' + ersPct + '%'
            + ' · DRS usage ' + drsPct + '%'
            + (p.drsZoneBased ? ' (track zones)' : ' (whole-lap fallback)');
        var tone = perfPct >= 75 ? 'push' : (perfPct >= 40 ? 'cruise' : 'save');

        var cellCls = 'lap-cell lap-sub--perf';
        if (l.pit || l.raceFlag === 2 || l.raceFlag === 3) cellCls += ' lap-cell--muted';
        return '<td class="' + cellCls + '" title="' + title + '">'
            + '<span class="lap-perf-badge lap-perf--' + tone + '">' + perfPct + '%</span>'
            + '</td>';
    }

    // Maps lapNum → stint info for one driver, so deltaCellHtml can look up the REF lap
    // in O(1). Stints are split on pit-in between adjacent laps (matches the spec) with a
    // fallback to compound changes for sessions where pit bits are missing.
    function raceStintsForDriver(sess, carIdx) {
        var driver = sess.drivers && sess.drivers[carIdx];
        if (!driver || !driver.laps || driver.laps.length === 0) return [];
        var laps = driver.laps.slice().sort(function (a, b) { return a.lapNum - b.lapNum; });
        var stints = [];
        var current = { startLap: laps[0].lapNum, endLap: laps[0].lapNum,
                        visual: laps[0].compoundVisual, actual: laps[0].compoundActual,
                        laps: [laps[0]] };
        for (var i = 1; i < laps.length; i++) {
            var prev = laps[i - 1];
            var l = laps[i];
            var splitOnPit = !!prev.pit;
            var splitOnCompound = l.compoundVisual !== prev.compoundVisual;
            if (splitOnPit || splitOnCompound) {
                stints.push(current);
                current = { startLap: l.lapNum, endLap: l.lapNum,
                            visual: l.compoundVisual, actual: l.compoundActual,
                            laps: [l] };
            } else {
                current.endLap = l.lapNum;
                current.laps.push(l);
            }
        }
        stints.push(current);
        return stints;
    }

    // Picks the REF lap of a stint per the product spec:
    //  - skip the out-lap (stint position 1)
    //  - prefer the best valid clean lap within the first 3 laps (positions 2..4)
    //  - widen to the first 5 (positions 2..6) if none
    //  - then drop the SC/VSC filter and flag refUnderSc
    //  - finally fall back to the out-lap itself
    function pickRefLap(stintLaps) {
        if (!stintLaps || stintLaps.length === 0) return null;
        function isClean(l) { return l.valid && l.raceFlag !== 2 && l.raceFlag !== 3; }
        function argminBy(list, sel) {
            var best = null;
            for (var i = 0; i < list.length; i++) {
                if (best == null || sel(list[i]) < sel(best)) best = list[i];
            }
            return best;
        }
        function byLapTime(l) { return l.lapTimeMs > 0 ? l.lapTimeMs : Infinity; }

        // Out-lap is stint position 1 → slice starts at index 1.
        var pool = stintLaps.slice(1, 4).filter(isClean);
        if (pool.length === 0) pool = stintLaps.slice(1, 6).filter(isClean);
        if (pool.length > 0) {
            var best = argminBy(pool, byLapTime);
            return { refLapNum: best.lapNum, refLapTimeMs: best.lapTimeMs };
        }

        var dirty = stintLaps.slice(1, 6).filter(function (l) { return l.valid; });
        if (dirty.length > 0) {
            var bestDirty = argminBy(dirty, byLapTime);
            return { refLapNum: bestDirty.lapNum, refLapTimeMs: bestDirty.lapTimeMs, refUnderSc: true };
        }

        var firstLap = stintLaps[0];
        return { refLapNum: firstLap.lapNum, refLapTimeMs: firstLap.lapTimeMs, refFallback: true };
    }

    // Builds { carIdx -> { byLap: {lapNum -> { stintLapIdx, refLapNum, refLapTimeMs, isRef, refUnderSc, refFallback }}}}.
    function buildRefIndex(driverOrder, drivers) {
        var out = {};
        driverOrder.forEach(function (carIdx) {
            var stints = raceStintsForDriver({ drivers: drivers }, carIdx);
            var byLap = {};
            stints.forEach(function (stint) {
                var ref = pickRefLap(stint.laps);
                stint.laps.forEach(function (l, idx) {
                    byLap[l.lapNum] = {
                        stintLapIdx: idx + 1,
                        refLapNum: ref ? ref.refLapNum : null,
                        refLapTimeMs: ref ? ref.refLapTimeMs : 0,
                        isRef: ref ? l.lapNum === ref.refLapNum : false,
                        refUnderSc: ref ? !!ref.refUnderSc : false,
                        refFallback: ref ? !!ref.refFallback : false,
                    };
                });
            });
            out[carIdx] = { byLap: byLap };
        });
        return out;
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
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--sc"></span>SC</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--vsc"></span>VSC</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--red"></span>Red Flag</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--pit"></span>Pitstop</span>'
            +     '</div>'
            +     '<div class="pos-chart-wrap" id="posChart"></div>'
            +   '</div>'
            + '</div>'
            + '</div>';

        var side = body.querySelector('#posSide');
        var picker = DriverPicker({
            drivers: sess.drivers,
            supportLapSelector: false,
            hideHeader: true,
            skipReferenceRadios: true,
            onChange: function () { drawPositionChart(); },
        });
        side.appendChild(picker);

        drawPositionChart();
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

        // Race-flag bands (SC/VSC/Red only): max flag per lap, collapsed into consecutive same-flag ranges.
        var flagByLap = {};
        (sess.events || []).forEach(function (e) {
            if (e.flag != null && e.lap != null && (e.flag === 2 || e.flag === 3 || e.flag === 4)) {
                flagByLap[e.lap] = Math.max(flagByLap[e.lap] || 0, e.flag);
            }
        });
        var bands = '';
        var bandClass = function (f) {
            return f === 2 ? 'pos-band-sc'
                : f === 3 ? 'pos-band-vsc'
                : 'pos-band-red';
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
        for (var lx = 1; lx <= totalLaps; lx++) {
            var majorLap = (lx === 1 || lx % 5 === 0 || lx === totalLaps);
            ticks += '<line class="pos-grid pos-grid--v' + (majorLap ? ' pos-grid--v-major' : '')
                + '" x1="' + x(lx) + '" x2="' + x(lx) + '" y1="' + PAD_T + '" y2="' + (H - PAD_B) + '"/>';
            if (majorLap) {
                ticks += '<text class="pos-xtick" x="' + x(lx) + '" y="' + (PAD_T - 10) + '" text-anchor="middle">' + lx + '</text>';
            }
        }

        // Driver polylines + pit badges + end/start code labels.
        var lines = '';
        var markers = '';
        var labels = '';
        selected.forEach(function (k) {
            var d = sess.drivers[k];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
            var code = driverCode(d.name);
            var racePos = getDriverRacePosition(sess, Number(k));
            var validLaps = (d.laps || []).filter(function (l) { return l.position > 0; });
            if (validLaps.length === 0) return;

            var pts = validLaps.map(function (l) { return x(l.lapNum) + ',' + y(l.position); });
            lines += '<polyline class="pos-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';

            (d.laps || []).forEach(function (l) {
                if (isPitLap(l) && l.position > 0) {
                    var cx = x(l.lapNum), cy = y(l.position);
                    markers += '<g class="pos-pit-badge">'
                        + '<rect x="' + (cx - 5.5) + '" y="' + (cy - 5.5) + '" width="11" height="11" rx="2.5" ry="2.5" fill="' + color + '" stroke="#fff" stroke-width="1"/>'
                        + '<text class="pos-pit-letter" x="' + cx + '" y="' + (cy + 2.4) + '" text-anchor="middle">P</text>'
                        + '</g>';
                }
            });

            var first = validLaps[0];
            var last = validLaps[validLaps.length - 1];
            labels += '<text class="pos-driver-label" x="' + (PAD_L - 10) + '" y="' + (y(first.position) + 4)
                + '" text-anchor="end" fill="' + color + '">' + escapeHtml(code) + '</text>';
            labels += '<text class="pos-driver-label" x="' + (W - PAD_R + 10) + '" y="' + (y(last.position) + 4)
                + '" text-anchor="start" fill="' + color + '">' + escapeHtml(code) + (racePos ? ' P' + racePos : '') + '</text>';
        });

        host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pos-svg" preserveAspectRatio="xMidYMid meet">'
            + bands + ticks + lines + markers + labels + '</svg>';
    }

    function driverCode(name) {
        if (!name) return '?';
        var short = shortDriverName(name);
        var normalized = String(short).replace(/[^A-Za-z0-9]/g, '');
        if (normalized.length >= 3) return normalized.substring(0, 3).toUpperCase();
        var words = String(name).trim().split(/\s+/).filter(Boolean);
        var initials = words.map(function (w) { return w.charAt(0); }).join('');
        if (initials.length >= 3) return initials.substring(0, 3).toUpperCase();
        return (normalized || initials || '?').toUpperCase();
    }

    function shortDriverName(name) {
        var raw = String(name || '').trim();
        if (!raw) return 'Unknown';
        var bracketMatch = raw.match(/\[([A-Za-z0-9]{3,})\]/);
        if (bracketMatch) return bracketMatch[1].toUpperCase();
        if (/^[A-Za-z0-9_]{2,16}$/.test(raw) && raw.indexOf(' ') < 0) return raw;
        var parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            var first = parts[0].charAt(0).toUpperCase();
            var last = parts[parts.length - 1];
            if (last.length <= 3) return (first + '. ' + last).trim();
            return (first + '. ' + last.substring(0, 12)).trim();
        }
        return raw.length > 12 ? raw.substring(0, 12) : raw;
    }

    function getDriverRacePosition(sess, carIdx) {
        var cd = sess && sess.finalClassification && sess.finalClassification.classificationData;
        if (cd && cd[carIdx] && cd[carIdx].position > 0) return Number(cd[carIdx].position);
        return null;
    }

    function isPitLap(lap) {
        if (!lap) return false;
        if (lap.pit === true || lap.inPit === true || lap.pitInLap === true || lap.pitStop === true) return true;
        var pitStatus = Number(lap.pitStatus);
        return pitStatus === 1 || pitStatus === 2;
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
    var eventsState = {
        query: '',
        codeFilter: loadEventFilter(),
        panel: null,
        panelButton: null,
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
    var PENALTY_TYPES = {
        0: 'Drive through', 1: 'Stop Go', 2: 'Grid penalty', 3: 'Penalty reminder',
        4: 'Time penalty', 5: 'Warning', 6: 'Disqualified', 7: 'Removed from formation lap',
        8: 'Parked too long timer', 9: 'Tyre regulations', 10: 'This lap invalidated',
        11: 'This and next lap invalidated', 12: 'This lap invalidated without reason',
        13: 'This and next lap invalidated without reason', 14: 'This and previous lap invalidated',
        15: 'This and previous lap invalidated without reason', 16: 'Retired', 17: 'Black flag timer',
    };
    var INFRINGEMENT_TYPES = {
        0: 'Blocking by slow driving', 1: 'Blocking by wrong way driving', 2: 'Reversing off the start line',
        3: 'Big collision', 4: 'Small collision', 5: 'Collision: failed to hand back position (single)',
        6: 'Collision: failed to hand back position (multiple)', 7: 'Corner cutting gained time',
        8: 'Corner cutting overtake (single)', 9: 'Corner cutting overtake (multiple)', 10: 'Crossed pit exit lane',
        11: 'Ignoring blue flags', 12: 'Ignoring yellow flags', 13: 'Ignoring drive through',
        14: 'Too many drive throughs', 15: 'Drive through reminder: serve within N laps',
        16: 'Drive through reminder: serve this lap', 17: 'Pit lane speeding', 18: 'Parked for too long',
        19: 'Ignoring tyre regulations', 20: 'Too many penalties', 21: 'Multiple warnings',
        22: 'Approaching disqualification', 23: 'Tyre regulations select (single)',
        24: 'Tyre regulations select (multiple)', 25: 'Lap invalidated: corner cutting',
        26: 'Lap invalidated: running wide', 27: 'Running wide: gained time (minor)',
        28: 'Running wide: gained time (significant)', 29: 'Running wide: gained time (extreme)',
        30: 'Lap invalidated: wall riding', 31: 'Lap invalidated: flashback used',
        32: 'Lap invalidated: reset to track', 33: 'Blocking the pitlane', 34: 'Jump start',
        35: 'Safety car: collision', 36: 'Safety car: illegal overtake', 37: 'Safety car: exceeding allowed pace',
        38: 'Virtual safety car: exceeding allowed pace', 39: 'Formation lap: below allowed speed',
        40: 'Formation lap: parking', 41: 'Retired: mechanical failure', 42: 'Retired: terminally damaged',
        43: 'Safety car: falling too far back', 44: 'Black flag timer', 45: 'Unserved stop go penalty',
        46: 'Unserved drive through penalty', 47: 'Engine component change', 48: 'Gearbox change',
        49: 'Parc Fermé change', 50: 'League grid penalty', 51: 'Retry penalty',
        52: 'Illegal time gain', 53: 'Mandatory pitstop', 54: 'Attribute assigned',
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
            + '<div class="ev-table-wrap">'
            +   '<table class="ev-table"><thead>'
            +     '<tr><th class="ev-col-time">Time</th><th class="ev-col-lap">Lap</th><th class="ev-col-event">Event</th><th class="ev-col-driver">Driver</th><th class="ev-col-details">Details</th></tr>'
            +   '</thead><tbody id="evTbody"></tbody></table>'
            + '</div>';

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
            var codeColor = EVENT_CODE_COLORS[e.code] || 'var(--text-dim)';
            var codeChip = '<span class="ev-code-chip" style="color:' + codeColor
                + ';border-color:' + codeColor + '">' + escapeHtml(e.code) + '</span>';
            return '<tr style="--event-color:' + codeColor + '">'
                + '<td data-label="Time">' + formatSessionTime(e.timeS) + '</td>'
                + '<td data-label="Lap">' + (e.lap || '—') + '</td>'
                + '<td data-label="Event">' + codeChip + '<span class="ev-name">' + (EVENT_NAMES[e.code] || e.code) + '</span></td>'
                + '<td data-label="Driver">' + dot + escapeHtml(driver ? driver.name : '—') + '</td>'
                + '<td data-label="Details">' + (formatEventDetails(e, sess) || '<span class="ev-muted">—</span>') + '</td>'
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
            case 'TMPT':
            case 'RTMT':
            case 'RCWN':
            case 'DTSV':
            case 'SGSV':
                var driver = sess.drivers && d.vehicleIdx != null ? sess.drivers[d.vehicleIdx] : null;
                return driver ? driver.name : '';
            case 'SPTP': return (d.speed || 0).toFixed(1) + ' km/h';
            case 'STLG': return 'Lights: ' + (d.numLights || 0);
            case 'FLBK': return 'Frame ' + (d.flashbackFrameIdentifier || 0)
                + (d.flashbackSessionTime != null ? ' — ' + d.flashbackSessionTime.toFixed(1) + 's' : '');
            case 'BUTN': return 'Status: 0x' + Number(d.buttonStatus || 0).toString(16).toUpperCase();
            case 'COLL':
                var carA = sess.drivers && d.vehicle1Idx != null ? sess.drivers[d.vehicle1Idx] : null;
                var carB = sess.drivers && d.vehicle2Idx != null ? sess.drivers[d.vehicle2Idx] : null;
                return (carA ? carA.name : ('Car #' + d.vehicle1Idx)) + ' × ' + (carB ? carB.name : ('Car #' + d.vehicle2Idx));
            case 'PENA':
                var penTypeName = PENALTY_TYPES[d.penaltyType] || ('Penalty #' + d.penaltyType);
                var infTypeName = INFRINGEMENT_TYPES[d.infringementType] || ('Infr. #' + d.infringementType);
                var offender = sess.drivers && d.vehicleIdx != null ? sess.drivers[d.vehicleIdx] : null;
                var other = sess.drivers && d.otherVehicleIdx != null ? sess.drivers[d.otherVehicleIdx] : null;
                var penParts = [penTypeName, infTypeName];
                if (d.time) penParts.push(d.time + 's');
                if (d.lapNum) penParts.push('Lap ' + d.lapNum);
                if (offender) penParts.push('Driver: ' + offender.name);
                if (other && d.otherVehicleIdx !== d.vehicleIdx) penParts.push('Other: ' + other.name);
                return penParts.join(' — ');
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
        var confirmBtn = overlay.querySelector('.history-modal-confirm');
        if (typeof onConfirm === 'function') {
            confirmBtn.addEventListener('click', function () {
                Promise.resolve(onConfirm(overlay)).then(dismiss, function (err) {
                    var body = overlay.querySelector('.history-modal-body');
                    body.insertAdjacentHTML('beforeend', '<div class="history-modal-error">' + escapeHtml(String(err)) + '</div>');
                });
            });
        } else {
            confirmBtn.addEventListener('click', dismiss);
        }
        return overlay;
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
    // opts: { drivers, supportLapSelector, compareCardMode, allowGhosts, hideHeader, skipReferenceRadios, onChange }
    // Returns a DOM node the caller appends somewhere. Re-renderable via .refresh() on the node.
    function DriverPicker(opts) {
        var container = document.createElement('div');
        container.className = 'history-driver-picker';

        function rowsSorted() {
            return Object.keys(opts.drivers || {}).sort(function (a, b) { return Number(a) - Number(b); });
        }

        function nextCompareSelectionKey() {
            var key = 1000;
            while (state.driverSelection.has(key)) key++;
            return key;
        }

        function openCompareLapModal() {
            var rows = rowsSorted();
            if (!rows.length) return;
            var parts = [
                '<div class="tc-lap-modal">',
                '<p class="tc-lap-modal-title">Tap a driver to expand their laps. Laps already in the compare list are omitted.</p>',
                '<div class="tc-lap-accordion" id="tcLapAccordion" role="list">',
            ];
            rows.forEach(function (carIdx) {
                var d = opts.drivers[carIdx];
                var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
                var racePos = getDriverRacePosition(state.session, Number(carIdx));
                var name = escapeHtml(shortDriverName(d.name || ('Car ' + carIdx)));
                parts.push(
                    '<div class="tc-lap-acc-item" data-car="' + carIdx + '" role="listitem">'
                    + '<button type="button" class="tc-lap-acc-trigger" aria-expanded="false">'
                    + '<span class="driver-dot" style="background:' + teamColor + '"></span>'
                    + '<span class="tc-lap-acc-name">' + (racePos ? '<span class="driver-race-pos">P' + racePos + '</span> ' : '') + name + '</span>'
                    + '<span class="tc-lap-acc-chevron" aria-hidden="true"></span>'
                    + '</button>'
                    + '<div class="tc-lap-acc-panel" id="tc-acc-panel-' + carIdx + '" hidden></div>'
                    + '</div>'
                );
            });
            parts.push('</div></div>');
            var overlay = openModal('Add lap to compare', parts.join(''), null);
            if (!overlay) return;
            overlay.classList.add('history-modal-overlay--compare-laps');
            overlay.querySelector('.history-modal-footer').style.display = 'none';
            var accordion = overlay.querySelector('#tcLapAccordion');

            function isLapDuplicate(carIdx, lapNum) {
                var dup = false;
                state.driverSelection.forEach(function (sel) {
                    if (dup || !sel || sel.lap == null) return;
                    var src = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
                    if (src === Number(carIdx) && Number(sel.lap) === Number(lapNum)) dup = true;
                });
                return dup;
            }

            function wireLapButtons(panel) {
                panel.querySelectorAll('.tc-lap-option').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var pickedCar = Number(btn.dataset.car);
                        var pickedLap = Number(btn.dataset.lap);
                        if (isLapDuplicate(pickedCar, pickedLap)) return;
                        var key = nextCompareSelectionKey();
                        state.driverSelection.set(key, { lap: pickedLap, ghost: false, sourceCarIdx: pickedCar, hidden: false });
                        if (opts.onChange) opts.onChange();
                        overlay.remove();
                    });
                });
            }

            function fillPanelIfNeeded(carIdx, panel) {
                if (panel.getAttribute('data-filled') === '1') return;
                var d = opts.drivers[carIdx];
                if (!d) {
                    panel.innerHTML = '<div class="tc-lap-empty">No driver data.</div>';
                    panel.setAttribute('data-filled', '1');
                    return;
                }
                var laps = (d.laps || []).slice().sort(function (a, b) { return Number(a.lapNum) - Number(b.lapNum); });
                var html = '<div class="tc-lap-acc-laps">';
                var count = 0;
                laps.forEach(function (l) {
                    if (isLapDuplicate(carIdx, l.lapNum)) return;
                    count++;
                    var tyre = l.compound || l.tyreCompound || l.tyre || '—';
                    html += '<button type="button" class="tc-lap-option" data-car="' + carIdx + '" data-lap="' + l.lapNum + '">'
                        + '<span class="tc-lap-option-main">Lap ' + l.lapNum + '</span>'
                        + '<span class="tc-lap-option-meta">' + escapeHtml(formatLapTime(l.lapTimeMs) + ' · ' + String(tyre)) + (l.valid ? '' : ' · invalid') + '</span>'
                        + '</button>';
                });
                html += '</div>';
                if (count === 0) {
                    html = '<div class="tc-lap-empty">No laps left to add for this driver (or no lap data).</div>';
                }
                panel.innerHTML = html;
                panel.setAttribute('data-filled', '1');
                wireLapButtons(panel);
            }

            accordion.querySelectorAll('.tc-lap-acc-trigger').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var item = btn.closest('.tc-lap-acc-item');
                    if (!item) return;
                    var carIdx = Number(item.dataset.car);
                    var panel = item.querySelector('.tc-lap-acc-panel');
                    if (!panel) return;
                    var wasOpen = item.classList.contains('is-open');
                    accordion.querySelectorAll('.tc-lap-acc-item').forEach(function (it) {
                        it.classList.remove('is-open');
                        var t = it.querySelector('.tc-lap-acc-trigger');
                        var p = it.querySelector('.tc-lap-acc-panel');
                        if (t) t.setAttribute('aria-expanded', 'false');
                        if (p) p.hidden = true;
                    });
                    if (!wasOpen) {
                        fillPanelIfNeeded(carIdx, panel);
                        item.classList.add('is-open');
                        btn.setAttribute('aria-expanded', 'true');
                        panel.hidden = false;
                    }
                });
            });
        }

        function render() {
            var rows = rowsSorted();
            if (opts.compareCardMode) {
                var selected = [];
                state.driverSelection.forEach(function (sel, carIdx) {
                    if (!sel || sel.lap == null) return;
                    var sourceCarIdx = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : carIdx);
                    if (opts.drivers[sourceCarIdx]) selected.push({ key: Number(carIdx), sourceCarIdx: sourceCarIdx, sel: sel });
                });
                selected.sort(function (a, b) { return a.sourceCarIdx - b.sourceCarIdx || a.sel.lap - b.sel.lap; });
                var cards = '<div class="driver-picker-header">Compare laps</div><div class="tc-lap-card-list">';
                selected.forEach(function (item) {
                    var d = opts.drivers[item.sourceCarIdx];
                    var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
                    var isRef = state.compareState && Number(state.compareState.referenceCarIdx) === item.key && Number(state.compareState.referenceLap) === Number(item.sel.lap);
                    var isHidden = !!item.sel.hidden;
                    cards += '<div class="tc-lap-card ' + (isHidden ? 'is-muted' : '') + '" data-car="' + item.key + '"><div class="tc-lap-card-top">'
                        + '<span class="driver-dot" style="background:' + teamColor + '"></span>'
                        + '<span>' + escapeHtml(shortDriverName(d.name || ('Car ' + item.sourceCarIdx))) + '</span>'
                        + (isRef ? '<span class="driver-ref-badge">REF</span>' : '')
                        + '<span class="tc-lap-card-actions">'
                        + '<button type="button" class="tc-lap-card-ref" data-act="set-ref" data-car="' + item.key + '" title="Set as reference lap">Set REF</button>'
                        + '<button type="button" class="tc-lap-card-vis" data-act="vis" data-car="' + item.key + '" title="Show/hide lap">👁</button>'
                        + '<button type="button" class="tc-lap-card-remove" data-act="remove" data-car="' + item.key + '" title="Remove lap">×</button>'
                        + '</span></div><div class="tc-lap-card-lap">Lap ' + item.sel.lap + '</div></div>';
                });
                cards += '<button type="button" class="tc-lap-card tc-lap-card-add" id="tcAddLapCard"><span>+</span></button></div>';
                container.innerHTML = cards;
                container.querySelector('#tcAddLapCard').addEventListener('click', openCompareLapModal);
                container.querySelectorAll('.tc-lap-card[data-car]').forEach(function (card) {
                    card.addEventListener('click', function (ev) {
                        if (ev.target && ev.target.closest('[data-act]')) return;
                        var key = Number(card.dataset.car);
                        var sel = state.driverSelection.get(key);
                        if (!sel) return;
                        sel.hidden = !sel.hidden;
                        state.driverSelection.set(key, sel);
                        render();
                        if (opts.onChange) opts.onChange();
                    });
                });
                container.querySelectorAll('[data-act="remove"]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var key = Number(btn.dataset.car);
                        state.driverSelection.delete(key);
                        if (state.compareState && Number(state.compareState.referenceCarIdx) === key) {
                            state.compareState.referenceCarIdx = null;
                            state.compareState.referenceLap = null;
                        }
                        render();
                        if (opts.onChange) opts.onChange();
                    });
                });
                container.querySelectorAll('[data-act="set-ref"]').forEach(function (btn) {
                    btn.addEventListener('click', function (ev) {
                        ev.stopPropagation();
                        var key = Number(btn.dataset.car);
                        var sel = state.driverSelection.get(key);
                        if (!sel || sel.lap == null) return;
                        if (!state.compareState) state.compareState = { referenceCarIdx: null, referenceLap: null };
                        state.compareState.referenceCarIdx = key;
                        state.compareState.referenceLap = sel.lap;
                        render();
                        if (opts.onChange) opts.onChange();
                    });
                });
                container.querySelectorAll('[data-act="vis"]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var key = Number(btn.dataset.car);
                        var sel = state.driverSelection.get(key);
                        if (!sel) return;
                        sel.hidden = !sel.hidden;
                        state.driverSelection.set(key, sel);
                        render();
                        if (opts.onChange) opts.onChange();
                    });
                });
                return;
            }
            // default picker (History Positions, etc.)
            var html = '';
            if (!opts.hideHeader) {
                html += '<div class="driver-picker-header">Drivers</div>';
            }
            var skipRefRadios = !!opts.skipReferenceRadios;
            rows.forEach(function (carIdx) { /* unchanged */
                var d = opts.drivers[carIdx];
                var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId) : '#9aa0a6';
                var racePos = getDriverRacePosition(state.session, Number(carIdx));
                var sel = state.driverSelection.get(Number(carIdx));
                var isSelected = !!sel && (!opts.supportLapSelector || sel.lap != null);
                var checked = isSelected ? 'checked' : '';
                var ghostBadge = (sel && sel.ghost) ? '<span class="driver-ghost-badge">G</span>' : '';
                var isRef = !!sel && state.compareState && Number(state.compareState.referenceCarIdx) === Number(carIdx) && Number(state.compareState.referenceLap) === Number(sel.lap);
                var refBadge = isRef ? '<span class="driver-ref-badge">REF</span>' : '';
                var refRadio = skipRefRadios ? ''
                    : '<input type="radio" name="driver-reference" class="driver-ref" ' + (isRef ? 'checked' : '') + ' title="Set as Reference" />';
                html += '<label class="driver-row" data-car="' + carIdx + '">' + '<input type="checkbox" class="driver-check" ' + checked + ' />' + refRadio + '<span class="driver-dot" style="background:' + teamColor + '"></span>' + '<span class="driver-name">' + (racePos ? '<span class="driver-race-pos">P' + racePos + '</span> ' : '') + escapeHtml(shortDriverName(d.name || ('Car ' + carIdx))) + '</span>' + ghostBadge + refBadge;
                if (opts.supportLapSelector) {
                    html += '<select class="driver-lap-select">';
                    (d.laps || []).forEach(function (l) { var selAttr = (sel && sel.lap === l.lapNum) ? ' selected' : ''; var lapLabel = 'L' + l.lapNum + ' — ' + formatLapTime(l.lapTimeMs) + (l.valid ? '' : ' ✗'); html += '<option value="' + l.lapNum + '"' + selAttr + '>' + escapeHtml(lapLabel) + '</option>'; });
                    html += '</select>';
                }
                html += '</label>';
            });
            container.innerHTML = html;
            container.querySelectorAll('.driver-check').forEach(function (cb) { cb.addEventListener('change', function () { var row = cb.closest('.driver-row'); var carIdx = Number(row.dataset.car); if (cb.checked) { var d = opts.drivers[carIdx]; var existing = state.driverSelection.get(carIdx); state.driverSelection.set(carIdx, { lap: existing ? existing.lap : fastestValidLap(d.laps), ghost: existing ? existing.ghost : false }); } else { state.driverSelection.delete(carIdx); } if (opts.onChange) opts.onChange(); }); });
            container.querySelectorAll('.driver-lap-select').forEach(function (sel) { sel.addEventListener('change', function () { var row = sel.closest('.driver-row'); var carIdx = Number(row.dataset.car); var existing = state.driverSelection.get(carIdx) || { ghost: false }; existing.lap = Number(sel.value); state.driverSelection.set(carIdx, existing); if (opts.onChange) opts.onChange(); }); });
            container.querySelectorAll('.driver-ref').forEach(function (rb) { rb.addEventListener('change', function () { if (!rb.checked) return; var row = rb.closest('.driver-row'); var carIdx = Number(row.dataset.car); var existing = state.driverSelection.get(carIdx); if (!existing || existing.lap == null) return; state.compareState.referenceCarIdx = carIdx; state.compareState.referenceLap = existing.lap; if (opts.onChange) opts.onChange(); }); });
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
            .then(function (r) {
                if (!r.ok) {
                    return r.json().catch(function () { return {}; }).then(function (j) {
                        throw new Error(j.error || j.message || ('HTTP ' + r.status));
                    });
                }
                return r.json();
            })
            .then(function (data) {
                state.lapSamplesCache.set(key, data);
                return data;
            })
            .catch(function (err) {
                if (window.console && console.warn) console.warn('fetchLapSamples', key, err);
                return { samples: [], motion: [], error: String(err.message || err) };
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
