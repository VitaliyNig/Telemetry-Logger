// History Mode — session detail view controller.
// Four sub-tabs: Lap Times / Lap Chart / Telemetry Compare / Events. Owned modules:
//   - renderLapTimes, renderPositions, renderTelemetryCompare, renderEvents
//     (defined in the same file for now; extract later if file grows > 800 lines)
//   - DriverPicker: Telemetry Compare sidebar; Lap Chart toggles visibility on chart labels instead.
// State lives on the module (not window) so switching to Live tab doesn't tear it down.
(function () {
    'use strict';

    var state = {
        folder: null,
        slug: null,
        session: null,               // full session detail JSON (from /api/sessions/{folder}/{slug})
        subTab: 'laptimes',
        // Map<carIdx, { lap, ghost?, hidden?, posHidden? }>. Compare uses `hidden`; Lap Chart uses `posHidden`.
        driverSelection: new Map(),
        compareState: { referenceCarIdx: null, referenceLap: null },
        lapSamplesCache: new Map(),  // key: carIdx + ':' + lap
    };

    /** Lap Chart resize + vertical pan helpers (module-local; not persisted on state.session). */
    var posChartResizeObserver = null;
    var posChartResizeDebounceTimer = null;

    function disconnectPosChartResize() {
        if (posChartResizeObserver) {
            posChartResizeObserver.disconnect();
            posChartResizeObserver = null;
        }
        if (posChartResizeDebounceTimer) {
            clearTimeout(posChartResizeDebounceTimer);
            posChartResizeDebounceTimer = null;
        }
    }

    /** Read scroll/max from chart wrap; optionally adjust range input visibility. */
    function syncPosChartVerticalPan() {
        var wrap = document.getElementById('posChart');
        var pan = document.getElementById('posChartVPan');
        var rng = document.getElementById('posChartVRange');
        if (!wrap || !pan || !rng) return;
        var maxScroll = wrap.scrollHeight - wrap.clientHeight;
        if (maxScroll <= 2) {
            rng.max = '0';
            rng.value = '0';
            pan.setAttribute('hidden', '');
            return;
        }
        pan.removeAttribute('hidden');
        rng.max = String(Math.max(1, Math.round(maxScroll)));
        rng.value = String(Math.round(Math.min(Number(rng.max), wrap.scrollTop)));
    }

    function setupPosChartResizeObserver() {
        disconnectPosChartResize();
        var wrap = document.getElementById('posChart');
        if (!wrap || typeof ResizeObserver === 'undefined') return;
        posChartResizeObserver = new ResizeObserver(function () {
            if (state.subTab !== 'positions') return;
            clearTimeout(posChartResizeDebounceTimer);
            posChartResizeDebounceTimer = setTimeout(function () {
                if (state.subTab !== 'positions') return;
                var w = document.getElementById('posChart');
                if (!w) return;
                var maxS = w.scrollHeight - w.clientHeight;
                var ratio = maxS > 1 ? w.scrollTop / maxS : 0;
                drawPositionChart();
                w = document.getElementById('posChart');
                if (w && w.scrollHeight - w.clientHeight > 1) {
                    var newMax = w.scrollHeight - w.clientHeight;
                    w.scrollTop = ratio * newMax;
                }
                syncPosChartVerticalPan();
            }, 50);
        });
        posChartResizeObserver.observe(wrap);
    }

    // ---------- public API ----------

    /** Canonical deep-link for the current detail state: #history/{folder}/{slug}/{subtab}. */
    function historyHash() {
        return '#history/' + encodeURIComponent(state.folder)
            + '/' + encodeURIComponent(state.slug)
            + '/' + encodeURIComponent(state.subTab || 'laptimes');
    }

    /**
     * Route-driven open (hashchange / initial load). Idempotent: when the requested session
     * is already on screen only the sub-tab is synced, so the hashchange that open() itself
     * triggers never causes a second fetch.
     */
    function openRoute(folder, slug, subTab) {
        var sub = subTab || state.subTab || 'laptimes';
        var detail = document.getElementById('historyDetailView');
        var visible = detail && !detail.hidden;
        if (visible && state.folder === folder && state.slug === slug) {
            if (state.subTab !== sub) switchSubTab(sub);
            return;
        }
        state.subTab = sub;
        open(folder, slug, null);
    }

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
        // Until meta loads, treat session type as unknown: hide Lap Chart so FP/Q/etc. never flash it.
        updateHistorySubTabsVisibility();
        switchSubTab(state.subTab || 'laptimes');

        // Deep link. A real hash push (not replaceState) so browser Back returns to the grid.
        if (!window.__routeApplying && location.hash !== historyHash()) {
            location.hash = historyHash();
        }

        fetch('/api/sessions/' + encodeURIComponent(folder) + '/' + encodeURIComponent(slug))
            .then(function (r) {
                if (!r.ok) throw new Error('fetch failed: ' + r.status);
                return r.json();
            })
            .then(function (data) {
                state.session = data;
                // Deep-linked opens don't know the weekend display name; fill it from meta.
                if (!weekendName && data.meta && data.meta.trackName) {
                    setBreadcrumb(data.meta.trackName, slug);
                }
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
        disconnectPosChartResize();
        state.session = null;
        // Drop the detail deep-link. replaceState: no hashchange, the UI is already closed.
        if (!window.__routeApplying && location.hash.indexOf('#history/') === 0) {
            history.replaceState(null, '', '#history');
        }
    }

    // ---------- sub-tab switching ----------

    function switchSubTab(id) {
        state.subTab = id;
        var tabs = document.querySelectorAll('.history-sidenav-item');
        tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.sub === id);
        });
        // Keep the deep-link current. replaceState so sub-tab hops don't spam browser history.
        if (!window.__routeApplying && state.folder && location.hash.indexOf('#history/') === 0) {
            history.replaceState(null, '', historyHash());
        }
        renderCurrentSubTab();
    }

    function renderCurrentSubTab() {
        var body = document.getElementById('historyDetailBody');
        if (!body) return;
        if (state.subTab !== 'positions') disconnectPosChartResize();
        if (state.subTab !== 'events') closeEventsFilterPanel();
        // The Charts/Map mode toggle lives in the breadcrumb header but only applies
        // to the Compare tab — clear it whenever another sub-tab takes over.
        if (state.subTab !== 'compare') {
            var modeSlot = document.getElementById('historyHeaderModeSlot');
            if (modeSlot) modeSlot.innerHTML = '';
        }
        if (!state.session) {
            disconnectPosChartResize();
            body.innerHTML = '<div class="history-empty"><p>Loading session…</p></div>';
            return;
        }
        switch (state.subTab) {
            case 'laptimes':  renderLapTimes(body); break;
            case 'results':   renderResults(body); break;
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

    /** Resolves practice / quali / race / time_trial from meta. TT is also detected from slug
     *  or name so older logs where sessionType was wrong or missing still get the right grid. */
    function resolveSessionCategory(meta) {
        if (!meta) return 'unknown';
        var t = meta.sessionType;
        if (typeof t === 'number' && !isNaN(t) && t !== 0) {
            return sessionCategory(t);
        }
        var slug = (meta.sessionTypeSlug || meta.sessionSlug || '').toLowerCase();
        if (slug === 'time_trial' || slug === 'timetrial') return 'time_trial';
        var name = (meta.sessionTypeName || '').trim().toLowerCase();
        if (name === 'time trial' || name.indexOf('time trial') === 0) return 'time_trial';
        return 'unknown';
    }

    function isRaceSession() {
        var meta = state.session && state.session.meta;
        if (!meta) return false;
        var t = meta.sessionType;
        if (typeof t === 'number' && !isNaN(t)) {
            return sessionCategory(t) === 'race';
        }
        // Fallback for odd payloads: filename slug / display name from logger.
        var slug = (meta.sessionTypeSlug || meta.sessionSlug || '').toLowerCase();
        if (slug === 'race' || slug === 'race2' || slug === 'race3') return true;
        var name = (meta.sessionTypeName || '').trim().toLowerCase();
        if (name === 'race' || name === 'race 2' || name === 'race 3') return true;
        return false;
    }

    function updateHistorySubTabsVisibility() {
        var posTab = document.querySelector('.history-sidenav-item[data-sub="positions"]');
        if (posTab) {
            var show = isRaceSession();
            posTab.hidden = !show;
            if (!show && state.subTab === 'positions') {
                switchSubTab('laptimes');
            }
        }
        var resTab = document.querySelector('.history-sidenav-item[data-sub="results"]');
        if (resTab) {
            var showRes = sessionHasFinalData();
            resTab.hidden = !showRes;
            if (!showRes && state.subTab === 'results') {
                switchSubTab('laptimes');
            }
        }
    }

    /** True when at least one driver has a final-classification entry (per-driver `final`
     *  backfill or the raw FinalClassification packet snapshot). */
    function sessionHasFinalData() {
        var sess = state.session;
        if (!sess) return false;
        var drivers = sess.drivers || {};
        var keys = Object.keys(drivers);
        for (var i = 0; i < keys.length; i++) {
            if (finalEntryFor(sess, Number(keys[i]))) return true;
        }
        return false;
    }

    function renderLapTimes(body) {
        var sess = state.session;
        var cat = resolveSessionCategory(sess.meta);
        var isQuali = cat === 'qualifying';
        var isTT = cat === 'time_trial';

        var bests = computeBests(sess.drivers);
        var pbByDriver = {};
        Object.keys(sess.drivers || {}).forEach(function (k) {
            pbByDriver[k] = personalBest(sess.drivers[k].laps);
        });

        var driverOrder = orderDriversForTable(cat, sess, false);
        var maxLap = computeMaxLap(sess.drivers);

        var toolbar = '';
        if (isTT) {
            toolbar = '<div class="lt-toolbar lt-toolbar--tt">'
                + '<p class="lt-tt-hint">Lap time and sectors. Column PB Δ is the gap vs your best valid lap in this session (time trial has no tyre wear).</p>'
                + '</div>';
        }

        var redClearAfterLap = redFlagClearedAfterLap(sess);
        var pivot = renderLapPivotTable(cat, sess, bests, pbByDriver, false, driverOrder, maxLap, redClearAfterLap);
        var virtualGrid = isQuali ? renderVirtualGrid(sess.drivers) : '';

        body.innerHTML =
            '<div class="lt-container">'
            + toolbar
            + pivot
            + virtualGrid
            + '</div>';

        var wrap = body.querySelector('.lap-grid-wrap');
        if (wrap) attachTyrePopupHandlers(wrap);
    }

    function computeBests(drivers) {
        var best = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
        if (!drivers) return best;
        Object.keys(drivers).forEach(function (k) {
            (drivers[k].laps || []).forEach(function (l) {
                if (l.valid && l.lapTimeMs > 0 && l.lapTimeMs < best.lap) best.lap = l.lapTimeMs;
                if (l.valid && l.s1Ms > 0 && l.s1Ms < best.s1) best.s1 = l.s1Ms;
                if (l.valid && l.s2Ms > 0 && l.s2Ms < best.s2) best.s2 = l.s2Ms;
                if (l.valid && l.s3Ms > 0 && l.s3Ms < best.s3) best.s3 = l.s3Ms;
            });
        });
        return best;
    }

    function personalBest(laps, requireSectors) {
        var pb = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
        (laps || []).forEach(function (l) {
            var hasSectors = l.s1Ms > 0 && l.s2Ms > 0 && l.s3Ms > 0;
            if (l.valid && l.lapTimeMs > 0 && (!requireSectors || hasSectors) && l.lapTimeMs < pb.lap) pb.lap = l.lapTimeMs;
            if (l.valid && l.s1Ms > 0 && l.s1Ms < pb.s1) pb.s1 = l.s1Ms;
            if (l.valid && l.s2Ms > 0 && l.s2Ms < pb.s2) pb.s2 = l.s2Ms;
            if (l.valid && l.s3Ms > 0 && l.s3Ms < pb.s3) pb.s3 = l.s3Ms;
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

    // Sort by session result for every category: 1st place left, last right.
    // Race uses sortDriversByFinalPosition (handles DNF/DSQ/Retired). For
    // practice/quali we prefer the final-classification position if the game
    // emitted one; otherwise we fall back to best-lap order. TT is single-car
    // so best-lap order is already a faithful "session result".
    function orderDriversForTable(cat, sess, useVirtual) {
        var drivers = sess.drivers || {};
        var keys = Object.keys(drivers);
        if (cat === 'race') {
            return keys.sort(function (a, b) {
                return sortDriversByFinalPosition(sess, Number(a), Number(b));
            });
        }
        if (cat === 'practice' || cat === 'qualifying') {
            var byBest = orderDriversByBest(drivers, useVirtual);
            var bestRank = {};
            byBest.forEach(function (k, i) { bestRank[k] = i; });
            return keys.slice().sort(function (a, b) {
                var ca = getClassificationEntry(sess, Number(a));
                var cb = getClassificationEntry(sess, Number(b));
                var pa = ca && ca.position > 0 ? Number(ca.position) : 0;
                var pb = cb && cb.position > 0 ? Number(cb.position) : 0;
                if (pa && pb) return pa - pb;
                if (pa) return -1;
                if (pb) return 1;
                return bestRank[a] - bestRank[b];
            });
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
        // No tyre wear in TT — gap vs session personal best (valid laps only).
        time_trial: ['time', 'sectors', 'tt_delta'],
        unknown:    ['time', 'wear'],
    };

    var SUB_COL_LABELS = {
        time: 'Time', sectors: 'Sec', wear: 'Wear', delta: 'Δ', perf: 'Perf', tt_delta: 'PB Δ',
    };

    // Delta classification (seconds) relative to REF lap within a stint.
    var DELTA_THRESHOLDS = { neutral: 0.8, warn: 1.5 };

    function renderLapPivotTable(cat, sess, bests, pbByDriver, virtualMode, driverOrder, maxLap, redClearAfterLap) {
        var drivers = sess.drivers || {};
        var cols = LAP_COLUMNS_BY_CAT[cat] || LAP_COLUMNS_BY_CAT.unknown;
        var colCount = cols.length;

        // Race-only: precompute REF lap per (driver, stint) so every cell can just look it up.
        var refIndex = cat === 'race' ? buildRefIndex(driverOrder, drivers) : null;

        // Top header row: one <th> per driver, colspan = number of sub-columns.
        var topCells = driverOrder.map(function (carIdx) {
            var d = drivers[carIdx];
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
            var pb = pbByDriver[carIdx];
            var pbText = pb && pb.lap !== Infinity ? formatLapTime(pb.lap) : '—';
            return '<th class="lap-grid__driver-th" colspan="' + colCount + '" style="border-top-color:' + teamColor + '">'
                + '<div class="lap-grid__driver-name">' + escapeHtml(d.name || ('Car ' + carIdx)) + '</div>'
                + '<div class="lap-grid__driver-pb">PB ' + pbText + '</div>'
                + '</th>';
        }).join('');

        // Second header row: sub-column labels per driver.
        var subCells = driverOrder.map(function () {
            return cols.map(function (key, idx) {
                var lastCls = (idx === cols.length - 1) ? ' lap-grid__sub-th--last' : '';
                return '<th class="lap-grid__sub-th lap-grid__sub-th--' + key + lastCls + '">' + SUB_COL_LABELS[key] + '</th>';
            }).join('');
        }).join('');

        // Body: one row per lap.
        var rowsHtml = '';
        for (var lapNum = 1; lapNum <= maxLap; lapNum++) {
            var rowCls = rowFlagClass(lapNum, drivers, driverOrder, redClearAfterLap);
            var cells = driverOrder.map(function (carIdx) {
                var lap = lapByNum(drivers[carIdx].laps, lapNum);
                if (!lap) {
                    var filler = '';
                    for (var k = 0; k < colCount; k++) {
                        var lastCls = (k === colCount - 1) ? ' lap-sub--last' : '';
                        filler += '<td class="lap-cell lap-cell--empty lap-sub--' + cols[k] + lastCls + '">—</td>';
                    }
                    return filler;
                }
                return renderLapCells(lap, cat, cols, bests, pbByDriver[carIdx], virtualMode,
                    refIndex ? refIndex[carIdx] : null, drivers, carIdx, redClearAfterLap);
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

    // Accept both numeric and string enum values from history payloads.
    function normalizeRaceFlag(flag) {
        if (flag == null) return 0;
        if (typeof flag === 'number') return flag;
        var text = String(flag).trim().toLowerCase();
        if (!text) return 0;
        if (text === '0' || text === 'green') return 0;
        if (text === '1' || text === 'yellow') return 1;
        if (text === '2' || text === 'sc' || text === 'safetycar' || text === 'safety_car' || text === 'safety car') return 2;
        if (text === '3' || text === 'vsc' || text === 'virtualsafetycar' || text === 'virtual_safety_car' || text === 'virtual safety car') return 3;
        if (text === '4' || text === 'red' || text === 'redflag' || text === 'red_flag' || text === 'red flag') return 4;
        return 0;
    }

    // Row background when SC / VSC / Red Flag was active for most drivers on this lap.
    // Older logs have a sticky Red flag bug: once RDFL fires, every subsequent lap's
    // raceFlag is recorded as Red because CurrentRaceFlag was never reset on restart.
    // The race-restart sequence is RDFL → ... → LGOT (lights out for the rolling start).
    // Treat any LGOT after a RDFL (or that fires after the first Red lap) as the clear
    // signal: lap rows past that point should ignore Red and fall back to the next flag.
    function redFlagClearedAfterLap(sess) {
        var events = (sess && sess.events) || [];
        var sawRed = false, restartTime = null;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (e.code === 'RDFL') sawRed = true;
            else if (sawRed && e.code === 'LGOT' && e.timeS != null) { restartTime = Number(e.timeS); break; }
        }
        if (restartTime == null) return null;
        var bestLap = null, bestDt = Infinity;
        for (var j = 0; j < events.length; j++) {
            var o = events[j];
            if (o.lap == null || o.timeS == null) continue;
            var dt = Math.abs(Number(o.timeS) - restartTime);
            if (dt < bestDt) { bestDt = dt; bestLap = Number(o.lap); }
        }
        return bestLap;
    }

    function rowFlagClass(lapNum, drivers, driverOrder, redClearAfterLap) {
        var redIsSticky = redClearAfterLap != null && lapNum > redClearAfterLap;
        var counts = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        driverOrder.forEach(function (carIdx) {
            var lap = lapByNum(drivers[carIdx].laps, lapNum);
            if (!lap) return;
            counts.total++;
            var raceFlag = normalizeRaceFlag(lap.raceFlag);
            if (redIsSticky && raceFlag === 4) return; // ignore stale Red after restart
            if (raceFlag && counts[raceFlag] != null) counts[raceFlag]++;
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
    function renderLapCells(l, cat, cols, bests, pb, virtualMode, refForDriver, drivers, carIdx, redClearAfterLap) {
        var ctx = { cat: cat, bests: bests, pb: pb, virtualMode: virtualMode, refForDriver: refForDriver, redClearAfterLap: redClearAfterLap, driverLaps: drivers && drivers[carIdx] ? drivers[carIdx].laps : null };
        var out = '';
        for (var i = 0; i < cols.length; i++) {
            var key = cols[i];
            var cellHtml = '';
            switch (key) {
                case 'time':     cellHtml = timeCellHtml(l, ctx); break;
                case 'sectors':  cellHtml = sectorsCellHtml(l, ctx); break;
                case 'wear':     cellHtml = wearCellHtml(l); break;
                case 'delta':    cellHtml = deltaCellHtml(l, ctx); break;
                case 'perf':     cellHtml = perfCellHtml(l); break;
                case 'tt_delta': cellHtml = timeTrialBestDeltaCellHtml(l, pb); break;
                default:         cellHtml = '<td class="lap-cell lap-sub--' + key + '">—</td>';
            }
            if (i === cols.length - 1 && cellHtml.indexOf('class="') !== -1) {
                cellHtml = cellHtml.replace('class="', 'class="lap-sub--last ');
            }
            out += cellHtml;
        }
        return out;
    }

    /** Δ (seconds) vs the driver's best valid lap in this session (Time Trial). */
    function timeTrialBestDeltaCellHtml(l, pb) {
        if (!pb || pb.lap === Infinity) {
            return '<td class="lap-cell lap-sub--tt_delta lap-tt-delta--na" title="No valid lap in session">—</td>';
        }
        if (!l.valid || !l.lapTimeMs) {
            return '<td class="lap-cell lap-sub--tt_delta lap-cell--invalid">—</td>';
        }
        var delta = (l.lapTimeMs - pb.lap) / 1000;
        var deltaCls = 'lap-delta';
        if (delta < 0) deltaCls += ' lap-delta--faster';
        else if (delta <= DELTA_THRESHOLDS.neutral) deltaCls += ' lap-delta--neutral';
        else if (delta <= DELTA_THRESHOLDS.warn) deltaCls += ' lap-delta--warn';
        else deltaCls += ' lap-delta--bad';
        var sign = delta >= 0 ? '+' : '';
        var text = sign + delta.toFixed(3);
        var title = 'Δ vs session PB (' + formatLapTime(pb.lap) + ')';
        return '<td class="lap-cell lap-sub--tt_delta" title="' + escapeHtml(title) + '">'
            + '<span class="' + deltaCls + '">' + text + '</span></td>';
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

        var tags = lapTagsHtml(l, ctx.cat, ctx.redClearAfterLap, ctx.driverLaps);
        var cellCls = 'lap-cell lap-sub--time';
        if (invalid) cellCls += ' lap-cell--invalid';
        return '<td class="' + cellCls + '">'
            + '<div class="' + timeCls + '">' + timeText + '</div>'
            + (tags ? '<div class="lap-cell__tags">' + tags + '</div>' : '')
            + '</td>';
    }

    function lapTagsHtml(l, cat, redClearAfterLap, driverLaps) {
        var out = '';
        var raceFlag = normalizeRaceFlag(l.raceFlag);
        // Strip stale Red carried over by older logs that never cleared CurrentRaceFlag on restart.
        if (raceFlag === 4 && redClearAfterLap != null && Number(l.lapNum) > redClearAfterLap) {
            raceFlag = 0;
        }
        if (cat !== 'qualifying' && l.pit) {
            out += '<span class="lap-tag lap-tag--pit" title="Pit Stop">PIT</span>';
        } else if (cat !== 'qualifying' && driverLaps) {
            var prevLap = lapByNum(driverLaps, Number(l.lapNum) - 1);
            if (prevLap && prevLap.pit) {
                out += '<span class="lap-tag lap-tag--out" title="Out lap (after pit)">OUT</span>';
            }
        }
        if (cat === 'race' && l.blueFlag) {
            out += '<span class="lap-tag lap-tag--blue" title="Blue Flag">B</span>';
        }
        if (raceFlag === 2) out += '<span class="lap-tag lap-tag--sc" title="Safety Car">SC</span>';
        else if (raceFlag === 3) out += '<span class="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>';
        else if (raceFlag === 4) out += '<span class="lap-tag lap-tag--rf" title="Red Flag">RF</span>';
        else if (raceFlag === 1) out += '<span class="lap-tag lap-tag--yellow" title="Yellow">Y</span>';
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

    function hexToRgb(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16)
        ];
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (v) {
            var h = Math.round(v).toString(16);
            return h.length === 1 ? '0' + h : h;
        }).join('');
    }
    function interpolateColor(c1, c2, t) {
        var a = hexToRgb(c1), b = hexToRgb(c2);
        return rgbToHex(
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        );
    }
    function wearColorFor(avg) {
        var stops = [
            [10, '#B6F2B6'], [20, '#CFF7B0'], [30, '#E8FCA8'], [40, '#FFF7A1'],
            [50, '#FFE89C'], [60, '#FFD3A1'], [70, '#FFBFA1'], [80, '#FFA8A8'],
            [90, '#FF8A8A'], [100, '#D97A7A']
        ];
        if (avg <= 10) return stops[0][1];
        if (avg >= 100) return stops[stops.length - 1][1];
        for (var i = 0; i < stops.length - 1; i++) {
            var t1 = stops[i][0], c1 = stops[i][1];
            var t2 = stops[i + 1][0], c2 = stops[i + 1][1];
            if (avg >= t1 && avg <= t2) {
                return interpolateColor(c1, c2, (avg - t1) / (t2 - t1));
            }
        }
        return stops[stops.length - 1][1];
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

        var wearColor = avg != null ? wearColorFor(avg) : '#666';

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
            +   '<span class="wear-badge" style="background:' + color + '">' + escapeHtml(label) + '</span>'
            +   (avg != null ? '<span class="wear-badge" style="background:' + wearColor + '">' + avg + '%</span>' : '')
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

    // Drives the perf badge fill — light grey-blue (low) → brand purple (high).
    // Mirrors wearColorFor: 10 hand-picked stops at 10..100 % with linear interpolation
    // between adjacent stops; values below 10 % clamp to the lightest stop.
    function perfColorFor(pct) {
        var stops = [
            [10, '#B8C4D6'], [20, '#B5B5D9'], [30, '#B1A7DD'], [40, '#AE98E0'],
            [50, '#AB89E4'], [60, '#A87AE7'], [70, '#A56CEB'], [80, '#A15DEE'],
            [90, '#9E4EF2'], [100, '#9B3FF5']
        ];
        if (pct <= 10) return stops[0][1];
        if (pct >= 100) return stops[stops.length - 1][1];
        for (var i = 0; i < stops.length - 1; i++) {
            var t1 = stops[i][0], c1 = stops[i][1];
            var t2 = stops[i + 1][0], c2 = stops[i + 1][1];
            if (pct >= t1 && pct <= t2) {
                return interpolateColor(c1, c2, (pct - t1) / (t2 - t1));
            }
        }
        return stops[stops.length - 1][1];
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

        var boostLabel = p.straightMode ? 'SM usage ' : 'DRS usage ';
        var title = 'Performance ' + perfPct + '%'
            + ' · ERS usage ' + ersPct + '%'
            + ' · ' + boostLabel + drsPct + '%'
            + (p.drsZoneBased ? ' (track zones)' : ' (whole-lap fallback)');
        // Harvest efficiency (only emitted for format 2026+ sessions, where the game ships
        // m_ersHarvestLimitPerLap). Surfaces as an extra tooltip line so the perf badge
        // stays single-number while strategists get the harvest-cap detail on hover.
        // Overtake (Boost) share — informational, 2026 sessions only (null otherwise).
        if (typeof p.overtakeUsagePct === 'number') {
            title += ' · Overtake ' + p.overtakeUsagePct + '%';
        }
        if (typeof p.harvEfficiencyPct === 'number') {
            title += ' · Harvest ' + p.harvEfficiencyPct + '%';
            if (typeof p.harvUsedMJ === 'number' && typeof p.harvCapMJ === 'number') {
                title += ' (' + p.harvUsedMJ.toFixed(2) + ' / ' + p.harvCapMJ.toFixed(2) + ' MJ)';
            }
        }
        var bg = perfColorFor(perfPct);

        var cellCls = 'lap-cell lap-sub--perf';
        var raceFlag = normalizeRaceFlag(l.raceFlag);
        if (l.pit || raceFlag === 2 || raceFlag === 3) cellCls += ' lap-cell--muted';
        return '<td class="' + cellCls + '" title="' + title + '">'
            + '<span class="lap-perf-badge" style="background:' + bg + '">' + perfPct + '%</span>'
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
        function isClean(l) {
            var raceFlag = normalizeRaceFlag(l.raceFlag);
            return l.valid && raceFlag !== 2 && raceFlag !== 3;
        }
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
        var raceFlag = normalizeRaceFlag(flag);
        if (raceFlag === 0) return '';
        if (raceFlag === 2) return '<span class="flag-icon flag-sc" title="Safety Car">SC</span>';
        if (raceFlag === 3) return '<span class="flag-icon flag-vsc" title="Virtual Safety Car">VSC</span>';
        if (raceFlag === 4) return '<span class="flag-icon flag-red" title="Red Flag">RED</span>';
        if (raceFlag === 1) return '<span class="flag-icon flag-yellow" title="Yellow">Y</span>';
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
            var pb = personalBest(d.laps, true);
            return {
                carIdx: Number(carIdx),
                name: d.name,
                teamId: d.teamId,
                liveryColorHex: d.liveryColorHex,
                actual: pb.lap,
                virtual: virtualBestMs(d.laps),
            };
        }).filter(function (r) { return r.actual !== Infinity; });

        if (rows.length === 0) return '';

        var actualSorted = rows.slice().sort(function (a, b) { return a.actual - b.actual; });
        var virtualSorted = rows.slice().sort(function (a, b) { return a.virtual - b.virtual; });
        var actualPos = {}, virtualPos = {};
        actualSorted.forEach(function (r, i) { actualPos[r.carIdx] = i + 1; });
        virtualSorted.forEach(function (r, i) { virtualPos[r.carIdx] = i + 1; });

        var html = '<div class="lt-virtual-grid">'
            + '<div class="lt-virtual-title">Virtual Best Grid</div>'
            + '<div class="lt-virtual-table-wrap">'
            + '<table class="lt-virtual-table">'
            + '<thead><tr>'
            + '<th class="lt-virtual-th lt-virtual-th--pos">Pos</th>'
            + '<th>Driver</th>'
            + '<th class="lt-virtual-th lt-virtual-th--time">Actual</th>'
            + '<th class="lt-virtual-th lt-virtual-th--time">Virtual</th>'
            + '<th class="lt-virtual-th lt-virtual-th--delta">Δ Pos</th>'
            + '<th class="lt-virtual-th lt-virtual-th--time">Δ Time</th>'
            + '</tr></thead><tbody>';
        virtualSorted.forEach(function (r, idx) {
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(r.teamId, r.liveryColorHex) : '#9aa0a6';
            var aPos = actualPos[r.carIdx];
            var vPos = virtualPos[r.carIdx];
            var deltaPos = aPos - vPos;
            var arrow = deltaPos > 0 ? '<span class="delta-up">▲ ' + deltaPos + '</span>'
                       : deltaPos < 0 ? '<span class="delta-down">▼ ' + (-deltaPos) + '</span>'
                       : '<span class="delta-same">–</span>';

            var deltaTimeMs = r.virtual !== Infinity ? r.virtual - r.actual : null;
            var deltaTimeText = deltaTimeMs != null && deltaTimeMs >= 0
                ? '+' + (deltaTimeMs / 1000).toFixed(3)
                : deltaTimeMs != null ? (deltaTimeMs / 1000).toFixed(3) : '—';
            var deltaTimeCls = 'lt-virtual-delta-time';
            if (deltaTimeMs != null) {
                if (deltaTimeMs <= 0) deltaTimeCls += ' lt-virtual-delta-time--faster';
                else deltaTimeCls += ' lt-virtual-delta-time--slower';
            }

            var actualText = formatLapTime(r.actual === Infinity ? 0 : r.actual);
            var virtualText = formatLapTime(r.virtual === Infinity ? 0 : r.virtual);

            var rowCls = 'lt-virtual-row';
            if (idx === 0) rowCls += ' lt-virtual-row--leader';

            html += '<tr class="' + rowCls + '" style="border-left-color:' + teamColor + '">'
                + '<td class="lt-virtual-cell lt-virtual-cell--pos"><span class="lt-virtual-pos">' + vPos + '</span></td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--driver">' + escapeHtml(r.name) + '</td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--time">' + actualText + '</td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--time">' + virtualText + '</td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--delta">' + arrow + '</td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--time"><span class="' + deltaTimeCls + '">' + deltaTimeText + '</span></td>'
                + '</tr>';
        });
        html += '</tbody></table></div></div>';
        return html;
    }

    // ---------- Results (final classification) ----------

    /** m_resultStatus display names (0/1/2 never make it through finalEntryFor's filter). */
    var RESULT_STATUS_NAMES = {
        3: 'Finished', 4: 'DNF', 5: 'DSQ', 6: 'Not classified', 7: 'Retired',
    };

    /** m_resultReason display names (FinalClassification packet). */
    var RESULT_REASON_NAMES = {
        1: 'Retired', 2: 'Finished', 3: 'Terminal damage', 4: 'Inactive',
        5: 'Not enough laps completed', 6: 'Black flagged', 7: 'Red flagged',
        8: 'Mechanical failure', 9: 'Session skipped', 10: 'Session simulated',
    };

    /** "23:45.678" / "1:23:45.678" for total race time in seconds. */
    function formatRaceTimeS(totalS) {
        if (!totalS || totalS <= 0) return '—';
        var ms = Math.round(totalS * 1000);
        var h = Math.floor(ms / 3600000);
        var m = Math.floor((ms % 3600000) / 60000);
        var s = ((ms % 60000) / 1000).toFixed(3);
        return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m))
            + ':' + s.padStart(6, '0');
    }

    function renderResults(body) {
        var sess = state.session;
        var drivers = (sess && sess.drivers) || {};
        var isRace = resolveSessionCategory(sess.meta) === 'race';

        var rows = Object.keys(drivers).map(function (k) {
            var carIdx = Number(k);
            return { carIdx: carIdx, driver: drivers[k], cls: finalEntryFor(sess, carIdx) };
        }).filter(function (r) { return r.cls != null; });

        if (!rows.length) {
            body.innerHTML = '<div class="history-empty"><p>No final classification recorded for this session.</p></div>';
            return;
        }

        rows.sort(function (a, b) { return sortDriversByFinalPosition(sess, a.carIdx, b.carIdx); });

        // Winner reference for the Time/Gap column (race only). Official time = race time + penalties.
        var winner = rows.find(function (r) { return isFinishedResultStatus(r.cls.resultStatus); });
        var winnerOfficialS = winner ? Number(winner.cls.totalRaceTime) + Number(winner.cls.penaltiesTime || 0) : 0;
        var winnerLaps = winner ? Number(winner.cls.numLaps) : 0;

        // Purple highlight for the fastest race lap among classified drivers.
        var bestLapMs = Infinity;
        rows.forEach(function (r) {
            var bl = Number(r.cls.bestLapTimeInMs);
            if (bl > 0 && bl < bestLapMs) bestLapMs = bl;
        });

        var html = '<div class="res-container"><div class="lt-virtual-table-wrap">'
            + '<table class="lt-virtual-table res-table">'
            + '<thead><tr>'
            + '<th class="lt-virtual-th lt-virtual-th--pos">Pos</th>'
            + '<th>Driver</th>'
            + (isRace ? '<th class="lt-virtual-th lt-virtual-th--delta">Grid</th>' : '')
            + '<th class="lt-virtual-th">Laps</th>'
            + '<th class="lt-virtual-th lt-virtual-th--time">Best Lap</th>'
            + (isRace
                ? '<th class="lt-virtual-th lt-virtual-th--time">Time / Gap</th>'
                  + '<th class="lt-virtual-th">Stops</th>'
                  + '<th class="lt-virtual-th">Pen</th>'
                  + '<th class="lt-virtual-th">Pts</th>'
                : '')
            + '<th class="res-th--status">Status</th>'
            + '</tr></thead><tbody>';

        rows.forEach(function (r, idx) {
            var c = r.cls;
            var d = r.driver;
            var teamColor = (typeof teamAccentColor === 'function')
                ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
            var rs = Number(c.resultStatus);
            var finished = isFinishedResultStatus(rs);

            // Grid delta: ▲ gained, ▼ lost.
            var gridHtml = '';
            if (isRace) {
                var grid = Number(c.gridPosition);
                var deltaPos = grid > 0 ? grid - Number(c.position) : 0;
                var arrow = deltaPos > 0 ? ' <span class="delta-up">▲' + deltaPos + '</span>'
                          : deltaPos < 0 ? ' <span class="delta-down">▼' + (-deltaPos) + '</span>'
                          : '';
                gridHtml = '<td class="lt-virtual-cell lt-virtual-cell--delta">' + (grid > 0 ? grid : '—') + arrow + '</td>';
            }

            // Time / Gap: winner absolute, lead-lap finishers +gap, lapped +N lap(s), non-finishers —.
            var timeHtml = '';
            if (isRace) {
                var timeText = '—';
                if (finished) {
                    var officialS = Number(c.totalRaceTime) + Number(c.penaltiesTime || 0);
                    if (winner && r.carIdx === winner.carIdx) {
                        timeText = formatRaceTimeS(officialS);
                    } else if (winner && Number(c.numLaps) === winnerLaps && officialS > winnerOfficialS) {
                        timeText = '+' + (officialS - winnerOfficialS).toFixed(3);
                    } else if (winner && Number(c.numLaps) < winnerLaps) {
                        var down = winnerLaps - Number(c.numLaps);
                        timeText = '+' + down + ' lap' + (down === 1 ? '' : 's');
                    } else {
                        timeText = formatRaceTimeS(officialS);
                    }
                }
                timeHtml = '<td class="lt-virtual-cell lt-virtual-cell--time">' + timeText + '</td>';
            }

            var blMs = Number(c.bestLapTimeInMs);
            var bestLapCls = 'lt-virtual-cell lt-virtual-cell--time'
                + (blMs > 0 && blMs === bestLapMs ? ' res-best-lap--overall' : '');

            var statusText = RESULT_STATUS_NAMES[rs] || ('Status ' + rs);
            var reason = Number(c.resultReason);
            if (!finished && reason > 0 && reason !== 2 && RESULT_REASON_NAMES[reason]) {
                statusText += ' — ' + RESULT_REASON_NAMES[reason];
            }

            var penHtml = isRace
                ? '<td class="lt-virtual-cell">'
                  + (Number(c.penaltiesTime) > 0 ? '+' + Number(c.penaltiesTime) + 's' : '—')
                  + '</td>'
                : '';

            var rowCls = 'lt-virtual-row' + (idx === 0 && finished ? ' lt-virtual-row--leader' : '')
                + (!finished ? ' res-row--dnf' : '');

            html += '<tr class="' + rowCls + '" style="border-left-color:' + teamColor + '">'
                + '<td class="lt-virtual-cell lt-virtual-cell--pos"><span class="lt-virtual-pos">' + Number(c.position) + '</span></td>'
                + '<td class="lt-virtual-cell lt-virtual-cell--driver">' + escapeHtml(d.name) + '</td>'
                + gridHtml
                + '<td class="lt-virtual-cell">' + (Number(c.numLaps) > 0 ? Number(c.numLaps) : '—') + '</td>'
                + '<td class="' + bestLapCls + '">' + formatLapTime(blMs) + '</td>'
                + timeHtml
                + (isRace ? '<td class="lt-virtual-cell">' + (Number(c.numPitStops) || 0) + '</td>' : '')
                + penHtml
                + (isRace ? '<td class="lt-virtual-cell">' + (Number(c.points) || 0) + '</td>' : '')
                + '<td class="lt-virtual-cell res-cell--status">' + escapeHtml(statusText) + '</td>'
                + '</tr>';
        });

        html += '</tbody></table></div></div>';
        body.innerHTML = html;
    }

    // ---------- Phase D: Lap Chart ----------

    function ensurePositionsDriverSelections(sess) {
        if (!sess || !sess.drivers) return;
        Object.keys(sess.drivers).forEach(function (k) {
            var carIdx = Number(k);
            var d = sess.drivers[k];
            if (!(d.laps || []).length) return;
            if (!state.driverSelection.has(carIdx)) {
                state.driverSelection.set(carIdx, { lap: null, ghost: false, posHidden: false });
            } else {
                var sel = state.driverSelection.get(carIdx);
                if (typeof sel.posHidden !== 'boolean') sel.posHidden = false;
                state.driverSelection.set(carIdx, sel);
            }
        });
    }

    function positionsLineHidden(carIdx) {
        var sel = state.driverSelection.get(carIdx);
        return !!(sel && sel.posHidden);
    }

    function approxMonoLabelWidth(chars, fontSizePx) {
        return Math.max(String(chars || '').length, 2) * fontSizePx * 0.62;
    }

    // Small eye SVG for positions chart (stroke matches driver color).
    function svgPositionEyeMarkup(isHidden, strokeColor) {
        var esc = escapeHtml(String(strokeColor || '#ccc'));
        var open = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" class="pos-eye-svg" aria-hidden="true">'
            + '<path stroke="' + esc + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" stroke="' + esc + '" stroke-width="2"/></svg>';
        var off = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" class="pos-eye-svg pos-eye-svg--off" aria-hidden="true">'
            + '<path stroke="' + esc + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            + 'd="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8 .55-1 1.72-3.52 6.94-9.88M14.12 14.12a3 3 0 11-4.24-4.24M10.73 5.08A10 10 0 0112 4c7 0 11 8 11 8 .55 1.33 3.93 11.93 11 23M3 3l18 18"/></svg>';
        return isHidden ? off : open;
    }

    function renderPositions(body) {
        var sess = state.session;
        ensurePositionsDriverSelections(sess);

        body.innerHTML = '<div class="pos-layout">'
            + '<div class="pos-sidebar" id="posSidebar"></div>'
            + '<div class="pos-main">'
            +   '<div class="pos-chart">'
            +     '<div class="pos-legend">'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--sc"></span>SC</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--vsc"></span>VSC</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--red"></span>Red Flag</span>'
            +       '<span class="pos-legend-item"><span class="pos-legend-chip pos-legend-chip--pit"></span>Pitstop</span>'
            +     '</div>'
            +     '<div class="pos-chart-frame">'
            +       '<div class="pos-chart-wrap" id="posChart"></div>'
            +       '<div class="pos-chart-v-pan" id="posChartVPan" hidden>'
            +         '<input type="range" id="posChartVRange" class="pos-chart-v-range" '
            +         'aria-label="Scroll chart vertically" value="0" />'
            +       '</div>'
            +     '</div>'
            +   '</div>'
            + '</div>'
            + '</div>';

        renderPosSidebar();
        drawPositionChart();
        attachPosChartInteractions();
        setupPosChartResizeObserver();
        syncPosChartVerticalPan();
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (state.subTab !== 'positions') return;
                var wc = document.getElementById('posChart');
                if (!wc) return;
                var maxS = wc.scrollHeight - wc.clientHeight;
                var ratio = maxS > 1 ? wc.scrollTop / maxS : 0;
                drawPositionChart();
                wc = document.getElementById('posChart');
                if (wc && wc.scrollHeight - wc.clientHeight > 1) {
                    var nm = wc.scrollHeight - wc.clientHeight;
                    wc.scrollTop = ratio * nm;
                }
                syncPosChartVerticalPan();
            });
        });
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

    // Prefer the highest lap that actually has time data (matches Lap Times pivot).
    // F1 25's SessionPacket.TotalLaps is one larger than the racing lap count emitted in
    // LapData (formation lap appears to be counted in TotalLaps but never gets its own
    // lapNum row), so trusting meta directly produces a chart that's +1 lap wider than
    // the real race. Fall back to meta only when no driver has any timed lap recorded yet.
    function positionChartTotalLaps(sess) {
        var completedMax = 0;
        var drivers = sess && sess.drivers ? sess.drivers : null;
        Object.keys(drivers || {}).forEach(function (k) {
            (drivers[k].laps || []).forEach(function (l) {
                if (!l || !l.lapNum) return;
                var hasTime = Number(l.lapTimeMs || 0) > 0
                    || Number(l.s1Ms || 0) > 0
                    || Number(l.s2Ms || 0) > 0
                    || Number(l.s3Ms || 0) > 0;
                if (hasTime && l.lapNum > completedMax) completedMax = l.lapNum;
            });
        });
        if (completedMax > 0) return completedMax;

        var metaLaps = Number(sess && sess.meta ? sess.meta.totalLaps : 0) || 0;
        if (metaLaps > 0) return metaLaps;

        return computeMaxLap(drivers);
    }

    function renderPosSidebar() {
        var sidebar = document.getElementById('posSidebar');
        if (!sidebar) return;
        var sess = state.session;
        var roster = Object.keys(sess.drivers || {}).map(Number).filter(function (ci) {
            var d = sess.drivers[ci];
            return (d.laps || []).some(function (l) { return l.position > 0; });
        }).sort(function (a, b) { return sortDriversByFinalPosition(sess, a, b); });
        if (roster.length === 0) { sidebar.innerHTML = ''; return; }

        var html = '<div class="pos-sidebar-header">Drivers</div>';
        roster.forEach(function (carIdx) {
            var d = sess.drivers[carIdx];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
            var hidden = positionsLineHidden(carIdx);
            var code = driverCode(d.name);
            var name = shortDriverName(d.name) || 'Unknown';
            var cls = hidden ? ' is-hidden' : '';
            html += '<div class="pos-sidebar-row' + cls + '" data-pos-sidebar-toggle="' + carIdx + '">'
                + '<span class="pos-sidebar-swatch" style="background:' + color + '"></span>'
                + '<span class="pos-sidebar-code">' + escapeHtml(code) + '</span>'
                + '<span class="pos-sidebar-name">' + escapeHtml(name) + '</span>'
                + '<span class="pos-sidebar-eye">' + svgPositionEyeMarkup(hidden, color) + '</span>'
                + '</div>';
        });
        sidebar.innerHTML = html;
    }

    function drawPositionChart() {
        var host = document.getElementById('posChart');
        if (!host) return;
        var sess = state.session;

        function rosterSorted() {
            var keys = Object.keys(sess.drivers || {}).map(Number)
                .filter(function (ci) {
                    var d = sess.drivers[ci];
                    return (d.laps || []).some(function (l) { return l.position > 0; });
                });
            keys.sort(function (a, b) { return sortDriversByFinalPosition(sess, a, b); });
            return keys;
        }

        var roster = rosterSorted();
        if (roster.length === 0) {
            host.innerHTML = '<div class="history-placeholder">No position data.</div>';
            return;
        }

        var totalLaps = positionChartTotalLaps(sess);
        if (!totalLaps) totalLaps = 1;
        var totalDrivers = Math.max(20, Object.keys(sess.drivers || {}).length);

        // viewBox width W vs wrap width hostWidthPx: painted scale svgCssScale = hostWidthPx / W (≤1).
        // Text uses user-space font-size = labelPx × (W/hostWidthPx) so screen size stays ~labelPx regardless of scaling.
        // W never forced to 960 on narrow layouts (that used to shrink all typography horizontally).
        var PAD_L = 64, PAD_R = 16, PAD_T = 32, PAD_B = 18;
        var MIN_ROW_PX = 12;
        var MAX_ROW_PX = 38;
        var MIN_LAP_COL_PX = 5.5;

        var hostWidthPx = Math.max(280, Math.round(host.clientWidth || 320));
        var hostHeightMeasured = host.clientHeight || 0;

        var minPlotFx = MIN_LAP_COL_PX * Math.max(1, totalLaps - 1);
        var W = Math.max(hostWidthPx, Math.ceil(PAD_L + PAD_R + minPlotFx));
        var svgCssScale = hostWidthPx / W;

        function fontSzUser(labelPxScr) {
            var u = (Number(labelPxScr) * W) / hostWidthPx;
            return String(Number(u.toPrecision(8)));
        }
        var fAxis = fontSzUser(11);
        var fPitLt = fontSzUser(6.5);

        var POS_Y_TICK_X = 22;

        var segments = Math.max(1, totalDrivers - 1);
        var padTbPx = (PAD_T + PAD_B) * svgCssScale;
        var availPlotPxBase = hostHeightMeasured > 12 ? hostHeightMeasured - padTbPx : 260;
        var availPlotPx = Math.max(55, availPlotPxBase);

        var idealRowPx = availPlotPx / segments;
        var rowPx = Math.min(MAX_ROW_PX, Math.max(MIN_ROW_PX, idealRowPx));
        var plotH_px = rowPx * segments;

        var plotW = W - PAD_L - PAD_R;
        var plotH = plotH_px / svgCssScale;
        var H = PAD_T + plotH + PAD_B;
        var lapStep = plotW / Math.max(1, totalLaps - 1);

        function x(lap) { return PAD_L + (lap - 1) * lapStep; }
        function y(pos) { return PAD_T + (pos - 1) / Math.max(1, totalDrivers - 1) * plotH; }

        // Race-flag bands: Yellow=1, SC=2, VSC=3, Red=4.
        // Older logs recorded session-wide flag events (RDFL, SCAR) with no `lap` because the
        // game emits them without a vehicle index. For those, derive the lap from `timeS` by
        // looking at the nearest event that does carry a lap (SPTP/OVTK/etc. are emitted
        // densely enough to give a within-1-lap mapping without needing the formation-lap
        // offset that pure cumulative lap-times would require).
        var events = sess.events || [];
        function resolveEventLap(e) {
            if (e.lap != null) return Number(e.lap);
            if (e.timeS == null) return null;
            var t = Number(e.timeS);
            var bestLap = null, bestDt = Infinity;
            for (var i = 0; i < events.length; i++) {
                var o = events[i];
                if (o.lap == null || o.timeS == null) continue;
                var dt = Math.abs(Number(o.timeS) - t);
                if (dt < bestDt) { bestDt = dt; bestLap = Number(o.lap); }
            }
            return bestLap;
        }

        var flagByLap = {};
        events.forEach(function (e) {
            if (e.flag == null || (e.flag !== 2 && e.flag !== 3 && e.flag !== 4)) return;
            var lap = resolveEventLap(e);
            if (lap == null || lap > totalLaps) return;
            flagByLap[lap] = Math.max(flagByLap[lap] || 0, e.flag);
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

        // Grid: horizontal line for every race position; Y labels every 5th + first/last
        var ticks = '';
        for (var p = 1; p <= totalDrivers; p++) {
            var yp = y(p);
            ticks += '<line class="pos-grid" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + yp + '" y2="' + yp + '"/>';
            if (p === 1 || p % 5 === 0 || p === totalDrivers) {
                ticks += '<text class="pos-ytick" font-size="' + fAxis + '" x="' + POS_Y_TICK_X + '" y="' + (yp + 4) + '" text-anchor="end">' + p + '</text>';
            }
        }
        for (var lx = 1; lx <= totalLaps; lx++) {
            var majorLap = (lx === 1 || lx % 5 === 0 || lx === totalLaps);
            ticks += '<line class="pos-grid pos-grid--v' + (majorLap ? ' pos-grid--v-major' : '')
                + '" x1="' + x(lx) + '" x2="' + x(lx) + '" y1="' + PAD_T + '" y2="' + (H - PAD_B) + '"/>';
            if (majorLap) {
                ticks += '<text class="pos-xtick" font-size="' + fAxis + '" x="' + x(lx) + '" y="' + (PAD_T - 10) + '" text-anchor="middle">' + lx + '</text>';
            }
        }

        // Pre-compute pit offsets so multiple pits on same lap don't overlap
        var pitByLap = {};
        roster.forEach(function (carIdx) {
            var d = sess.drivers[carIdx];
            (d.laps || []).forEach(function (l) {
                if (isPitLap(l) && l.position > 0) {
                    if (!pitByLap[l.lapNum]) pitByLap[l.lapNum] = [];
                    pitByLap[l.lapNum].push(carIdx);
                }
            });
        });

        // Driver groups: line + dots + pits + start label
        var driverGroups = '';
        roster.forEach(function (carIdx) {
            var d = sess.drivers[carIdx];
            var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
            var code = driverCode(d.name);
            // Sort by lapNum: SessionLogger's red-flag / final-lap rescue path can append a
            // late-resolved lap (e.g. the lap during a red flag) out of order, which would
            // make the polyline zigzag through the chart (lap 25 → 9 → 26). slice() so we
            // don't mutate the source array that other passes below still iterate.
            var validLaps = (d.laps || [])
                .filter(function (l) { return l.position > 0 && l.lapNum <= totalLaps; })
                .slice()
                .sort(function (a, b) { return a.lapNum - b.lapNum; });
            if (validLaps.length === 0) return;

            var hidden = positionsLineHidden(carIdx);
            var pts = validLaps.map(function (l) { return x(l.lapNum) + ',' + y(l.position); });

            var dots = '';
            validLaps.forEach(function (l) {
                dots += '<circle class="pos-dot" cx="' + x(l.lapNum) + '" cy="' + y(l.position) + '" r="1.5" fill="' + color + '"/>';
            });

            var pits = '';
            (d.laps || []).forEach(function (l) {
                if (isPitLap(l) && l.position > 0 && l.lapNum <= totalLaps) {
                    var lapPits = pitByLap[l.lapNum] || [];
                    var idx = lapPits.indexOf(carIdx);
                    var offset = (idx - (lapPits.length - 1) / 2) * 14;
                    var cx = x(l.lapNum) + offset;
                    var cy = y(l.position);
                    pits += '<g class="pos-pit-badge">'
                        + '<rect x="' + (cx - 5.5) + '" y="' + (cy - 5.5) + '" width="11" height="11" rx="2.5" ry="2.5" fill="' + color + '" stroke="#fff" stroke-width="1"/>'
                        + '<text class="pos-pit-letter" font-size="' + fPitLt + '" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle">P</text>'
                        + '</g>';
                }
            });

            var first = validLaps[0];
            var lyStart = y(first.position) + 4;
            var startLabel = '<g class="pos-label-hit pos-label-hit--start' + (hidden ? ' is-hidden' : '') + '" data-pos-toggle="' + carIdx
                + '" transform="translate(' + (PAD_L - 10) + ',' + lyStart + ')">'
                + '<text class="pos-driver-label pos-driver-label--start" font-size="' + fAxis + '" x="0" y="0" dominant-baseline="middle" text-anchor="end" fill="' + color + '">'
                + escapeHtml(code) + '</text></g>';

            driverGroups += '<g class="pos-driver-group' + (hidden ? ' is-hidden' : '') + '" data-car-idx="' + carIdx + '">'
                + '<polyline class="pos-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>'
                + '<g class="pos-dots">' + dots + '</g>'
                + '<g class="pos-pits">' + pits + '</g>'
                + startLabel
                + '</g>';
        });

        host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pos-svg" preserveAspectRatio="xMinYMin meet">'
            + '<g class="pos-bands">' + bands + '</g>'
            + '<g class="pos-grid-group">' + ticks + '</g>'
            + '<line class="pos-crosshair" x1="0" y1="' + PAD_T + '" x2="0" y2="' + (H - PAD_B) + '"/>'
            + driverGroups
            + '</svg>'
            + '<div class="pos-tooltip" id="posTooltip"><div class="pos-tooltip-lap"></div><div class="pos-tooltip-body"></div></div>';
        syncPosChartVerticalPan();
    }

    function attachPosChartInteractions() {
        var wrap = document.getElementById('posChart');
        if (!wrap) return;

        if (!wrap.dataset.posChartUiBound) {
            wrap.dataset.posChartUiBound = '1';

            wrap.addEventListener('scroll', function () {
                syncPosChartVerticalPan();
            });

            var rngInit = document.getElementById('posChartVRange');
            if (rngInit) rngInit.addEventListener('input', function () {
                var w = document.getElementById('posChart');
                if (w) w.scrollTop = Number(rngInit.value);
                syncPosChartVerticalPan();
            });

            wrap.addEventListener('mouseover', function (e) {
                var line = e.target.closest('.pos-line');
                if (!line) return;
                var group = line.closest('.pos-driver-group');
                if (!group) return;
                var carIdx = group.getAttribute('data-car-idx');
                var allGroups = wrap.querySelectorAll('.pos-driver-group');
                allGroups.forEach(function (g) {
                    if (g.getAttribute('data-car-idx') === carIdx) {
                        g.classList.remove('is-dimmed');
                        g.classList.add('is-hovered');
                    } else if (!g.classList.contains('is-hidden')) {
                        g.classList.add('is-dimmed');
                        g.classList.remove('is-hovered');
                    }
                });
            });

            wrap.addEventListener('mouseout', function (e) {
                if (!e.target.closest('.pos-driver-group')) return;
                wrap.querySelectorAll('.pos-driver-group').forEach(function (g) {
                    g.classList.remove('is-dimmed', 'is-hovered');
                });
            });

            wrap.addEventListener('mousemove', function (e) {
                var svg = wrap.querySelector('svg.pos-svg');
                var crosshair = wrap.querySelector('.pos-crosshair');
                var tooltip = document.getElementById('posTooltip');
                if (!svg || !crosshair || !tooltip) return;

                var sess = state.session;
                if (!sess) return;
                var totalLapsMv = positionChartTotalLaps(sess);
                if (!totalLapsMv) totalLapsMv = 1;

                var rect = svg.getBoundingClientRect();
                var vbParts = svg.getAttribute('viewBox').split(' ');
                var viewBoxW = parseFloat(vbParts[2]);
                var viewBoxH = parseFloat(vbParts[3]);
                var PAD_L = 64, PAD_R = 16, PAD_T = 32, PAD_B = 18;
                var plotW = viewBoxW - PAD_L - PAD_R;
                var plotH = viewBoxH - PAD_T - PAD_B;
                var mouseX = e.clientX - rect.left;
                var mouseY = e.clientY - rect.top;
                var svgX = mouseX * (viewBoxW / rect.width);
                var svgY = mouseY * (viewBoxH / rect.height);

                if (svgX < PAD_L || svgX > viewBoxW - PAD_R || svgY < PAD_T || svgY > viewBoxH - PAD_B) {
                    crosshair.style.opacity = '0';
                    tooltip.classList.remove('is-visible');
                    return;
                }

                var lapStep = plotW / Math.max(1, totalLapsMv - 1);
                var lap = Math.round((svgX - PAD_L) / lapStep) + 1;
                lap = Math.max(1, Math.min(totalLapsMv, lap));

                var xPos = PAD_L + (lap - 1) * lapStep;
                crosshair.setAttribute('x1', xPos);
                crosshair.setAttribute('x2', xPos);
                crosshair.style.opacity = '1';

                var rows = [];
                var roster = Object.keys(sess.drivers || {}).map(Number).filter(function (ci) {
                    var d = sess.drivers[ci];
                    return (d.laps || []).some(function (l) { return l.position > 0; });
                }).sort(function (a, b) { return a - b; });

                roster.forEach(function (carIdx) {
                    var sel = state.driverSelection.get(carIdx);
                    if (sel && sel.posHidden) return;
                    var d = sess.drivers[carIdx];
                    var color = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
                    var lapData = (d.laps || []).find(function (l) { return l.lapNum === lap && l.position > 0; });
                    if (!lapData) return;
                    rows.push({ pos: lapData.position, name: driverCode(d.name), color: color });
                });
                rows.sort(function (a, b) { return a.pos - b.pos; });

                var lapDiv = tooltip.querySelector('.pos-tooltip-lap');
                var bodyDiv = tooltip.querySelector('.pos-tooltip-body');
                if (lapDiv) lapDiv.textContent = 'Lap ' + lap;
                if (bodyDiv) bodyDiv.innerHTML = rows.map(function (r) {
                    return '<div class="pos-tooltip-row">'
                        + '<span class="pos-tooltip-swatch" style="background:' + r.color + '"></span>'
                        + '<span class="pos-tooltip-pos">' + r.pos + '</span>'
                        + '<span class="pos-tooltip-name">' + escapeHtml(r.name) + '</span>'
                        + '</div>';
                }).join('');

                var wrapRect = wrap.getBoundingClientRect();
                var tipX = mouseX + 14;
                var tipY = mouseY + 14;
                var tipW = tooltip.offsetWidth || 160;
                var tipH = tooltip.offsetHeight || 120;
                if (tipX + tipW > wrapRect.width) tipX = mouseX - tipW - 10;
                if (tipY + tipH > wrapRect.height) tipY = mouseY - tipH - 10;
                tooltip.style.transform = 'translate(' + tipX + 'px,' + tipY + 'px)';
                tooltip.classList.add('is-visible');
            });

            wrap.addEventListener('mouseleave', function () {
                var crosshair = wrap.querySelector('.pos-crosshair');
                var tooltip = document.getElementById('posTooltip');
                if (crosshair) crosshair.style.opacity = '0';
                if (tooltip) tooltip.classList.remove('is-visible');
                wrap.querySelectorAll('.pos-driver-group').forEach(function (g) {
                    g.classList.remove('is-dimmed', 'is-hovered');
                });
            });
        }
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

    function getClassificationEntry(sess, carIdx) {
        var cd = sess && sess.finalClassification && sess.finalClassification.classificationData;
        if (!cd) return null;
        var row = cd[carIdx];
        if (row == null) return null;
        if (typeof row === 'object' && !Array.isArray(row)) return row;
        return null;
    }

    /**
     * Final-classification entry for one car, normalized to the raw packet field names.
     * Prefers the per-driver `final` snapshot the logger backfills (v3.1+); falls back to
     * the raw FinalClassification packet for older logs. Null when neither has data.
     */
    function finalEntryFor(sess, carIdx) {
        var d = sess && sess.drivers && sess.drivers[carIdx];
        var f = d && d.final;
        if (f && f.position > 0) {
            return {
                position: f.position,
                numLaps: f.numLaps,
                gridPosition: f.gridPosition,
                points: f.points,
                numPitStops: f.numPitStops,
                resultStatus: f.resultStatus,
                resultReason: f.resultReason,
                bestLapTimeInMs: f.bestLapTimeInMs,
                totalRaceTime: f.totalRaceTimeS,
                penaltiesTime: f.penaltiesTimeS,
                numPenalties: f.numPenalties,
            };
        }
        var cls = getClassificationEntry(sess, carIdx);
        if (cls && Number(cls.position) > 0 && Number(cls.resultStatus) > 0) return cls;
        return null;
    }

    function driverLastNameUpper(name) {
        var raw = String(name || '').trim();
        if (!raw) return 'UNKNOWN';
        raw = raw.replace(/^\[G\]\s*/i, '').trim();
        var bracket = raw.match(/\[([A-Za-z0-9]+)\]/);
        if (bracket) return String(bracket[1]).toUpperCase();
        var parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length >= 1) {
            var last = parts[parts.length - 1].replace(/[^A-Za-zÀ-ÿ\-']/gi, '');
            if (last) return last.toUpperCase();
        }
        return raw.toUpperCase().substring(0, 16);
    }

    /** F1 m_resultStatus: 3=finished, 4=DNF, 5=DSQ, 6=NC, 7=retired */
    function isNonFinisherResultStatus(st) {
        var n = Number(st);
        return n === 4 || n === 5 || n === 6 || n === 7;
    }

    function isFinishedResultStatus(st) {
        return Number(st) === 3;
    }

    /**
     * Sort key for final race position (finishers first, then DNF/DSQ/Retired by last known position).
     */
    function driverFinalSortKey(sess, carIdx) {
        var d = sess.drivers[carIdx];
        var cls = getClassificationEntry(sess, carIdx);
        var validLaps = (d.laps || []).filter(function (l) { return l.position > 0; });
        var lastLap = validLaps.length ? validLaps[validLaps.length - 1] : null;

        if (cls && cls.resultStatus != null && cls.resultStatus !== '') {
            var rs = Number(cls.resultStatus);
            if (!isNaN(rs) && rs > 0) {
                if (isFinishedResultStatus(rs) && cls.position > 0) {
                    return { pos: Number(cls.position), dnf: false };
                }
                if (isNonFinisherResultStatus(rs)) {
                    var lastPos = lastLap ? lastLap.position : 99;
                    return { pos: lastPos + 100, dnf: true };
                }
            }
        }

        var racePos = getDriverRacePosition(sess, carIdx);
        if (racePos != null && racePos > 0) {
            return { pos: Number(racePos), dnf: false };
        }

        if (lastLap && lastLap.position > 0) {
            var totalLaps = (sess.meta && sess.meta.totalLaps) || computeMaxLap(sess.drivers);
            var completed = totalLaps > 0 && lastLap.lapNum >= totalLaps;
            if (completed) {
                return { pos: Number(lastLap.position), dnf: false };
            }
            return { pos: Number(lastLap.position) + 100, dnf: true };
        }

        return { pos: 999, dnf: true };
    }

    function sortDriversByFinalPosition(sess, a, b) {
        var ka = driverFinalSortKey(sess, a);
        var kb = driverFinalSortKey(sess, b);
        if (ka.dnf !== kb.dnf) return ka.dnf ? 1 : -1;
        return ka.pos - kb.pos;
    }

    function ordinalEnglish(n) {
        var num = Number(n);
        if (!num || num < 1) return '';
        var v = num % 100;
        if (v >= 11 && v <= 13) return num + 'th';
        switch (num % 10) {
            case 1: return num + 'st';
            case 2: return num + 'nd';
            case 3: return num + 'rd';
            default: return num + 'th';
        }
    }

    /**
     * Right-side label for the lap chart: "1st HAMILTON" for finishers; "VERSTAPPEN" (pale) for DNF etc.
     */
    function positionChartEndLabel(sess, driver, cls, carIdx, totalLaps) {
        var surname = driverLastNameUpper(driver && driver.name);
        var lastLaps = (driver && driver.laps) ? driver.laps.filter(function (l) { return l.position > 0; }) : [];
        var lastLap = lastLaps.length ? lastLaps[lastLaps.length - 1] : null;

        if (cls && cls.resultStatus != null && cls.resultStatus !== '') {
            var rs = Number(cls.resultStatus);
            if (!isNaN(rs) && rs > 0) {
                if (isFinishedResultStatus(rs) && cls.position > 0) {
                    return { text: ordinalEnglish(cls.position) + ' ' + surname, dnf: false };
                }
                if (isNonFinisherResultStatus(rs)) {
                    return { text: surname, dnf: true };
                }
            }
        }

        var racePos = getDriverRacePosition(sess, carIdx);
        if (racePos != null && racePos > 0) {
            return { text: ordinalEnglish(racePos) + ' ' + surname, dnf: false };
        }

        if (lastLap && lastLap.position > 0) {
            var completedRace = totalLaps > 0 && lastLap.lapNum >= totalLaps;
            if (completedRace) {
                return { text: ordinalEnglish(lastLap.position) + ' ' + surname, dnf: false };
            }
            return { text: surname, dnf: true };
        }

        return { text: surname, dnf: true };
    }

    function getDriverRacePosition(sess, carIdx) {
        var row = getClassificationEntry(sess, carIdx);
        if (row && row.position > 0) return Number(row.position);
        return null;
    }

    function isPitLap(lap) {
        if (!lap) return false;
        if (lap.pit === true || lap.inPit === true || lap.pitInLap === true || lap.pitStop === true) return true;
        var pitStatus = Number(lap.pitStatus);
        return pitStatus === 1 || pitStatus === 2;
    }

    // Compact PIT/OUT/SC/VSC/RF chips for the Compare laps picker (modal options + selected cards).
    function compareLapTagsHtml(lap, allLaps) {
        if (!lap) return '';
        var parts = [];
        if (isPitLap(lap)) {
            parts.push('<span class="lap-tag lap-tag--pit" title="Pit stop on this lap">PIT</span>');
        } else if (allLaps) {
            var prev = allLaps.find(function (ll) { return Number(ll.lapNum) === Number(lap.lapNum) - 1; });
            if (isPitLap(prev)) parts.push('<span class="lap-tag lap-tag--out" title="Out lap (after pit)">OUT</span>');
        }
        var rf = normalizeRaceFlag(lap.raceFlag);
        // Strip stale Red carried over by older logs that never cleared CurrentRaceFlag on restart.
        if (rf === 4) {
            var redClearAfterLap = redFlagClearedAfterLap(state.session);
            if (redClearAfterLap != null && Number(lap.lapNum) > redClearAfterLap) rf = 0;
        }
        if (rf === 2) parts.push('<span class="lap-tag lap-tag--sc" title="Safety Car">SC</span>');
        else if (rf === 3) parts.push('<span class="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>');
        else if (rf === 4) parts.push('<span class="lap-tag lap-tag--rf" title="Red Flag">RF</span>');
        if (!parts.length) return '';
        return '<span class="tc-lap-tag-list">' + parts.join('') + '</span>';
    }

    // Tyre chip for a compare lap card: compound colour dot + short letter (S/M/H/I/W) and,
    // when present, the tyre age in laps. Uses the same compound tables as the lap-times grid
    // (defined in telemetry.js). Returns '' when the lap has no compound data.
    function compareTyreChipHtml(lap) {
        if (!lap || lap.compoundVisual == null) return '';
        var visual = lap.compoundVisual;
        var name = (typeof VISUAL_COMPOUNDS !== 'undefined' && VISUAL_COMPOUNDS[visual]) || '';
        if (!name) return '';
        var actual = (typeof ACTUAL_COMPOUNDS !== 'undefined' && ACTUAL_COMPOUNDS[visual]) || '';
        var color = (typeof COMPOUND_DOT_COLORS !== 'undefined' && COMPOUND_DOT_COLORS[visual]) || '#888';
        var letter = name.charAt(0).toUpperCase();
        var hasAge = lap.tyreAge != null;
        var title = name + (actual ? ' (' + actual + ')' : '')
            + (hasAge ? ' · ' + lap.tyreAge + ' lap' + (lap.tyreAge === 1 ? '' : 's') + ' old' : '');
        return '<span class="tc-lap-card-tyre" title="' + escapeHtml(title) + '">'
            + '<span class="tc-tyre-dot" style="background:' + color + '"></span>'
            + '<span class="tc-tyre-letter">' + escapeHtml(letter) + '</span>'
            + (hasAge ? '<span class="tc-tyre-age">' + lap.tyreAge + '</span>' : '')
            + '</span>';
    }

    // 3-letter driver code for the compare card badge. Prefers a bracketed tag (e.g. "[VER]"),
    // otherwise the first three letters of the surname ("Max Verstappen" → "VER"), falling back
    // to the first three alphanumerics of a single-token gamertag.
    function driverBadgeCode(name) {
        var raw = String(name || '').trim();
        if (!raw) return '—';
        var bracket = raw.match(/\[([A-Za-z0-9]{2,4})\]/);
        if (bracket) return bracket[1].toUpperCase().slice(0, 3);
        var parts = raw.split(/\s+/).filter(Boolean);
        var base = parts.length >= 2 ? parts[parts.length - 1] : raw;
        var code = base.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
        return code || '—';
    }

    // Picks black or white text for a coloured badge by relative luminance, so light team
    // colours (silver/white) stay readable.
    function readableTextColor(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return '#fff';
        var lum = (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
        return lum > 0.62 ? '#0d1117' : '#fff';
    }

    function renderTelemetryCompare(body) {
        if (window.TelemetryCompare && window.TelemetryCompare.render) {
            window.TelemetryCompare.render(body);
        } else {
            body.innerHTML = '<div class="history-placeholder">Telemetry Compare module not loaded.</div>';
        }
    }
    // ---------- Phase H: Events ----------

    // Separate from Live telemetry (`f1telemetry_event_filter_v1` in telemetry.js) so the two modes do not share filter state.
    var HISTORY_EVENT_FILTER_KEY = 'f1telemetry_event_filter_history_v1';
    var LEGACY_SHARED_EVENT_FILTER_KEY = 'f1telemetry_event_filter_v1';
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
            if (!raw) {
                var legacy = localStorage.getItem(LEGACY_SHARED_EVENT_FILTER_KEY);
                if (legacy) {
                    raw = legacy;
                    localStorage.setItem(HISTORY_EVENT_FILTER_KEY, legacy);
                }
            }
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
            + '<div class="ev-container">'
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
            + '</div>'
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
                ? '<span class="driver-dot" style="background:' + (typeof teamAccentColor === 'function' ? teamAccentColor(driver.teamId, driver.liveryColorHex) : '#9aa0a6') + '"></span> '
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
            + '<span class="history-mode-slot" id="historyHeaderModeSlot"></span>'
            + '<span class="history-actions-menu-wrap">'
            +   '<button type="button" class="history-action-btn" data-act="menu" aria-haspopup="menu" aria-expanded="false">Actions ▾</button>'
            +   '<div class="history-actions-menu" role="menu" hidden>'
            +     '<button type="button" class="history-actions-menu-item" role="menuitem" data-act="export">Export Driver…</button>'
            +     '<button type="button" class="history-actions-menu-item" role="menuitem" data-act="ghosts">Ghosts…</button>'
            +   '</div>'
            + '</span>';
        bc.appendChild(spacer);
        bc.appendChild(actions);
        var menuBtn = actions.querySelector('[data-act="menu"]');
        var menu = actions.querySelector('.history-actions-menu');
        function closeMenu() {
            menu.hidden = true;
            menuBtn.setAttribute('aria-expanded', 'false');
        }
        menuBtn.addEventListener('click', function () {
            var opening = menu.hidden;
            menu.hidden = !opening;
            menuBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
        document.addEventListener('click', function (e) {
            if (!menu.hidden && !actions.contains(e.target)) closeMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) closeMenu();
        });
        menu.addEventListener('click', function (e) {
            var item = e.target.closest('.history-actions-menu-item');
            if (!item) return;
            closeMenu();
            if (item.dataset.act === 'export') openExportModal();
            else if (item.dataset.act === 'ghosts') openGhostsModal();
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
        var playerIdx = state.session.meta ? state.session.meta.playerCarIndex : null;

        // Build a sortable list: the player first (pre-selected export target), then
        // drivers with laps, then lapless drivers (can't be exported) pinned last.
        var list = Object.keys(drivers).map(function (k) {
            var d = drivers[k];
            var isPlayer = playerIdx != null && Number(k) === Number(playerIdx);
            return {
                key: k,
                name: d.name || ('Car #' + k),
                laps: d.lapCount || 0,
                color: (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6',
                isPlayer: isPlayer,
            };
        });
        list.sort(function (a, b) {
            if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
            var aHas = a.laps > 0, bHas = b.laps > 0;
            if (aHas !== bHas) return aHas ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        function card(d) {
            var noLaps = d.laps === 0;
            var cls = 'export-card'
                + (d.isPlayer ? ' export-card--you' : '')
                + (noLaps ? ' export-card--disabled' : '');
            return '<label class="' + cls + '" data-name="' + escapeHtml(d.name.toLowerCase()) + '">'
                + '<input type="radio" name="exportDriver" value="' + d.key + '"'
                +   (d.isPlayer && !noLaps ? ' checked' : '') + (noLaps ? ' disabled' : '') + '/>'
                + '<span class="export-card-dot" style="background:' + d.color + '"></span>'
                + '<span class="export-card-body">'
                +   '<span class="export-card-name">' + escapeHtml(d.name) + '</span>'
                +   '<span class="export-card-meta">' + (noLaps ? 'no laps' : d.laps + ' lap' + (d.laps === 1 ? '' : 's')) + '</span>'
                + '</span>'
                + (d.isPlayer ? '<span class="export-card-badge">YOU</span>' : '')
                + '<span class="export-card-check" aria-hidden="true">✓</span>'
                + '</label>';
        }

        var body = ''
            + '<div class="export-panel">'
            +   '<input type="text" class="export-search" id="exportSearch" placeholder="Search driver…" autocomplete="off" spellcheck="false" />'
            +   '<div class="export-grid" role="radiogroup" aria-label="Driver to export">'
            +     list.map(card).join('')
            +   '</div>'
            +   '<p class="export-empty" id="exportEmpty" hidden>No drivers match.</p>'
            + '</div>';

        var overlay = openModal('Export Driver', body, function (ov) {
            var sel = ov.querySelector('input[name="exportDriver"]:checked');
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
        overlay.classList.add('history-modal-overlay--export');
        overlay.querySelector('.history-modal-confirm').textContent = 'Export';

        // Live name filter. Empty state shows when nothing matches.
        var search = overlay.querySelector('#exportSearch');
        var empty = overlay.querySelector('#exportEmpty');
        var cards = Array.prototype.slice.call(overlay.querySelectorAll('.export-card'));
        search.addEventListener('input', function () {
            var q = search.value.trim().toLowerCase();
            var shown = 0;
            cards.forEach(function (c) {
                var match = !q || c.dataset.name.indexOf(q) !== -1;
                c.hidden = !match;
                if (match) shown++;
            });
            empty.hidden = shown > 0;
        });
        // Autofocus so the user can type immediately.
        window.setTimeout(function () { try { search.focus(); } catch (e) { /* ignore */ } }, 0);
    }

    /** Slots a ghost driver into the compare state under a synthetic carIdx (100+). */
    function addGhostToCompare(driver) {
        var ghostKey = 100 + Math.floor(Math.random() * 100);
        state.session.drivers[ghostKey] = Object.assign({}, driver, {
            name: '[G] ' + driver.name,
        });
        state.driverSelection.set(ghostKey, {
            lap: fastestValidLap(driver.laps),
            ghost: true,
        });
        renderCurrentSubTab();
    }

    // Ghost manager: lists the ghosts persisted under the weekend's _ghosts/ folder
    // (Add = slot into Telemetry Compare, Delete = remove the file), plus file import.
    // Everything acts immediately inside the modal; the footer is just a Close button.
    function openGhostsModal() {
        var body = ''
            + '<div class="ghost-section-title">Saved ghosts</div>'
            + '<div class="ghost-list"><p class="ghost-list-note">Loading saved ghosts…</p></div>'
            + '<div class="ghost-section-title">Import from file</div>'
            + '<p class="ghost-import-hint">Ghost JSON exported from another session — track must match.</p>'
            + '<div class="ghost-import-row">'
            +   '<label class="ghost-file-label">'
            +     '<input type="file" id="ghostFile" accept=".json" hidden />'
            +     '<span class="ghost-file-btn">Choose file…</span>'
            +     '<span class="ghost-file-name">no file selected</span>'
            +   '</label>'
            +   '<button type="button" class="history-action-btn" id="ghostImportBtn" disabled>Import</button>'
            + '</div>'
            + '<p class="ghost-import-status" id="ghostImportStatus" hidden></p>';
        var overlay = openModal('Ghosts', body, null);

        // No confirm action — the footer collapses to a single Close button.
        overlay.querySelector('.history-modal-cancel').hidden = true;
        overlay.querySelector('.history-modal-confirm').textContent = 'Close';

        var ghostFileInput = overlay.querySelector('#ghostFile');
        var ghostFileName = overlay.querySelector('.ghost-file-name');
        var importBtn = overlay.querySelector('#ghostImportBtn');
        var importStatus = overlay.querySelector('#ghostImportStatus');
        ghostFileInput.addEventListener('change', function () {
            var has = ghostFileInput.files && ghostFileInput.files.length > 0;
            importBtn.disabled = !has;
            importStatus.hidden = true;
            ghostFileName.textContent = has ? ghostFileInput.files[0].name : 'no file selected';
            ghostFileName.classList.toggle('ghost-file-name-set', has);
        });
        importBtn.addEventListener('click', function () {
            if (!ghostFileInput.files || ghostFileInput.files.length === 0) return;
            var file = ghostFileInput.files[0];
            var url = '/api/history/import?folder=' + encodeURIComponent(state.folder)
                + '&slug=' + encodeURIComponent(state.slug);
            importBtn.disabled = true;
            file.arrayBuffer().then(function (buf) {
                return fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: buf,
                });
            }).then(function (r) {
                if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
                    throw new Error(j.error || r.statusText);
                });
                return r.json();
            }).then(function (res) {
                addGhostToCompare(res.driver);
                importStatus.textContent = 'Imported "' + (res.driver && res.driver.name || file.name) + '" — added to Telemetry Compare.';
                importStatus.classList.remove('ghost-import-status-error');
                importStatus.hidden = false;
                ghostFileInput.value = '';
                ghostFileName.textContent = 'no file selected';
                ghostFileName.classList.remove('ghost-file-name-set');
            }).catch(function (err) {
                importBtn.disabled = false;
                importStatus.textContent = String(err.message || err);
                importStatus.classList.add('ghost-import-status-error');
                importStatus.hidden = false;
            });
        });

        var list = overlay.querySelector('.ghost-list');
        var base = '/api/sessions/' + encodeURIComponent(state.folder)
            + '/' + encodeURIComponent(state.slug) + '/ghosts';
        var ghostsByFile = {};

        fetch(base)
            .then(function (r) { return r.json(); })
            .then(function (ghosts) {
                if (!Array.isArray(ghosts) || ghosts.length === 0) {
                    list.innerHTML = '<p class="ghost-list-note">No saved ghosts for this track yet.</p>';
                    return;
                }
                list.innerHTML = ghosts.map(function (g) {
                    ghostsByFile[g.fileName] = g;
                    var d = g.driver || {};
                    var name = d.name || g.fileName;
                    var color = (typeof teamAccentColor === 'function')
                        ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
                    var metaParts = [];
                    if (g.sourceSlug) metaParts.push(g.sourceSlug);
                    if (d.laps && d.laps.length) metaParts.push(d.laps.length + ' laps');
                    var meta = metaParts.length
                        ? '<span class="ghost-row-src">' + escapeHtml(metaParts.join(' · ')) + '</span>' : '';
                    return '<div class="ghost-row" data-file="' + escapeHtml(g.fileName) + '">'
                        + '<span class="driver-dot" style="background:' + color + '"></span>'
                        + '<span class="ghost-row-name">' + escapeHtml(name) + meta + '</span>'
                        + '<button type="button" class="history-action-btn" data-ghost-act="add">Add</button>'
                        + '<button type="button" class="history-action-btn ghost-btn-danger" data-ghost-act="delete">Delete</button>'
                        + '</div>';
                }).join('');
            })
            .catch(function () {
                list.innerHTML = '<p class="ghost-list-note">Failed to load saved ghosts.</p>';
            });

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-ghost-act]');
            if (!btn) return;
            var row = btn.closest('.ghost-row');
            var fileName = row.dataset.file;
            if (btn.dataset.ghostAct === 'add') {
                var g = ghostsByFile[fileName];
                if (!g) return;
                addGhostToCompare(g.driver);
                btn.textContent = 'Added';
                btn.disabled = true;
            } else if (btn.dataset.ghostAct === 'delete') {
                if (!confirm('Delete saved ghost "' + fileName + '"? This removes the file from _ghosts/.')) return;
                btn.disabled = true;
                fetch(base + '/' + encodeURIComponent(fileName), { method: 'DELETE' })
                    .then(function (r) {
                        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
                            throw new Error(j.error || ('HTTP ' + r.status));
                        });
                        row.remove();
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        list.insertAdjacentHTML('beforeend',
                            '<div class="history-modal-error">' + escapeHtml(String(err.message || err)) + '</div>');
                    });
            }
        });
    }

    // ---------- DriverPicker component ----------
    // opts: { drivers, supportLapSelector, compareCardMode, allowGhosts, hideHeader, skipReferenceRadios, onChange }
    // Returns a DOM node the caller appends somewhere. Re-renderable via .refresh() on the node.
    function DriverPicker(opts) {
        var container = document.createElement('div');
        container.className = 'history-driver-picker';

        // Comparison limits: at most 3 laps per team and 6 laps total — the reference counts
        // toward both. Keeps the chart/map/cards readable and within the colour-shade and
        // dash distinguishability ceilings.
        var MAX_COMPARE_PER_TEAM = 3;
        var MAX_COMPARE_TOTAL = 6;
        function teamIdOf(carIdx) {
            var d = opts.drivers[carIdx];
            return d && d.teamId != null ? String(d.teamId) : ('_' + carIdx);
        }
        function compareCounts() {
            var total = 0, byTeam = {};
            state.driverSelection.forEach(function (sel, key) {
                if (!sel || sel.lap == null) return;
                total++;
                var src = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : key);
                var tid = teamIdOf(src);
                byTeam[tid] = (byTeam[tid] || 0) + 1;
            });
            return { total: total, byTeam: byTeam };
        }

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
                '<p class="tc-lap-modal-title">Click a driver to expand laps. Already-added laps are hidden.</p>',
                '<div class="tc-lap-accordion" id="tcLapAccordion" role="list">',
            ];
            rows.forEach(function (carIdx) {
                var d = opts.drivers[carIdx];
                var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
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
                state.driverSelection.forEach(function (sel, key) {
                    if (dup || !sel || sel.lap == null) return;
                    // Fall back to the selection's own map key — falling back to the
                    // candidate carIdx made any keyed selection (no sourceCarIdx) match
                    // every driver, hiding that lap number for the whole grid.
                    var src = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : key);
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
                        var counts = compareCounts();
                        if (counts.total >= MAX_COMPARE_TOTAL) return;
                        if ((counts.byTeam[teamIdOf(pickedCar)] || 0) >= MAX_COMPARE_PER_TEAM) return;
                        var key = nextCompareSelectionKey();
                        state.driverSelection.set(key, { lap: pickedLap, ghost: false, sourceCarIdx: pickedCar, hidden: false });
                        render();
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
                if ((compareCounts().byTeam[teamIdOf(carIdx)] || 0) >= MAX_COMPARE_PER_TEAM) {
                    panel.innerHTML = '<div class="tc-lap-empty">Max ' + MAX_COMPARE_PER_TEAM + ' laps per team — remove one to add another for this team.</div>';
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
                    var tagsOpt = compareLapTagsHtml(l, laps);
                    html += '<button type="button" class="tc-lap-option" data-car="' + carIdx + '" data-lap="' + l.lapNum + '">'
                        + '<span class="tc-lap-option-main">Lap ' + l.lapNum + tagsOpt + '</span>'
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
                // Line style per lap = team occurrence order among visible laps — first
                // teammate solid, second dashed, third+ dotted. Mirrors the chart's dash
                // index so the card's left indicator matches the line drawn on the charts.
                // Counted in driverSelection insertion order (not the card display order, which
                // is sorted by car) so the indicator lines up with the chart line.
                var dashByKey = {};
                (function () {
                    var seen = {};
                    state.driverSelection.forEach(function (sel, key) {
                        if (!sel || sel.hidden) return;
                        var src = Number(sel.sourceCarIdx != null ? sel.sourceCarIdx : key);
                        var drv = opts.drivers[src];
                        var tid = drv && drv.teamId != null ? String(drv.teamId) : ('_' + key);
                        var occ = seen[tid] || 0; seen[tid] = occ + 1;
                        dashByKey[Number(key)] = occ === 0 ? 'solid' : (occ === 1 ? 'dashed' : 'dotted');
                    });
                })();
                var cards = '<div class="driver-picker-header tc-lap-card-header">'
                    + '<span>Compare laps</span>'
                    + '<span class="tc-lap-card-count">' + selected.length + '/' + MAX_COMPARE_TOTAL + '</span>'
                    + '</div><div class="tc-lap-card-list">';
                selected.forEach(function (item) {
                    var d = opts.drivers[item.sourceCarIdx];
                    var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
                    var isRef = state.compareState && Number(state.compareState.referenceCarIdx) === item.key && Number(state.compareState.referenceLap) === Number(item.sel.lap);
                    var isHidden = !!item.sel.hidden;
                    var driverLaps = d.laps || [];
                    var lapInfo = driverLaps.find(function (ll) { return Number(ll.lapNum) === Number(item.sel.lap); });
                    var tagsCard = compareLapTagsHtml(lapInfo, driverLaps);
                    var lineStyle = dashByKey[item.key] || 'solid';
                    var fullName = d.name || ('Car ' + item.sourceCarIdx);
                    var badgeCode = driverBadgeCode(fullName);
                    var badgeText = readableTextColor(teamColor);
                    var lapTimeTxt = (lapInfo && lapInfo.lapTimeMs) ? formatLapTime(lapInfo.lapTimeMs) : '—';
                    cards += '<div class="tc-lap-card ' + (isHidden ? 'is-muted ' : '') + (isRef ? 'is-ref' : '') + '" data-car="' + item.key + '" data-line-style="' + lineStyle + '" style="--tc-card-color:' + teamColor + '">'
                        + '<span class="tc-lap-card-badge" style="background:' + teamColor + ';color:' + badgeText + '" title="' + escapeHtml(fullName) + '">' + escapeHtml(badgeCode) + '</span>'
                        + '<div class="tc-lap-card-info">'
                        +   '<div class="tc-lap-card-name-row">'
                        +     '<span class="tc-lap-card-lap">Lap ' + item.sel.lap + '</span>'
                        +     compareTyreChipHtml(lapInfo)
                        +     tagsCard
                        +   '</div>'
                        +   '<div class="tc-lap-card-meta">'
                        +     '<span class="tc-lap-card-time' + (lapTimeTxt === '—' ? ' tc-lap-card-time--none' : '') + '">' + lapTimeTxt + '</span>'
                        +   '</div>'
                        + '</div>'
                        + '<div class="tc-lap-card-actions">'
                        +   (isRef
                            ? '<span class="tc-lap-card-ref is-active" title="Reference lap">REF</span>'
                            : '<button type="button" class="tc-lap-card-ref" data-act="set-ref" data-car="' + item.key + '" title="Set as reference lap">SET REF</button>')
                        +   '<button type="button" class="tc-lap-card-vis" data-act="vis" data-car="' + item.key + '" title="Show/hide lap" aria-pressed="' + (isHidden ? 'true' : 'false') + '">' + (isHidden ? '🚫' : '👁') + '</button>'
                        +   '<button type="button" class="tc-lap-card-remove" data-act="remove" data-car="' + item.key + '" title="Remove lap">×</button>'
                        + '</div>'
                        + '</div>';
                });
                var atTotalCap = compareCounts().total >= MAX_COMPARE_TOTAL;
                cards += '<button type="button" class="tc-lap-card tc-lap-card-add" id="tcAddLapCard"'
                    + (atTotalCap ? ' disabled title="Maximum ' + MAX_COMPARE_TOTAL + ' laps (reference included)"' : '')
                    + '>+ Add lap</button></div>';
                container.innerHTML = cards;
                var addBtn = container.querySelector('#tcAddLapCard');
                if (addBtn && !addBtn.disabled) addBtn.addEventListener('click', openCompareLapModal);
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
            // default picker (History Lap Chart, etc.)
            var html = '';
            if (!opts.hideHeader) {
                html += '<div class="driver-picker-header">Drivers</div>';
            }
            var skipRefRadios = !!opts.skipReferenceRadios;
            rows.forEach(function (carIdx) { /* unchanged */
                var d = opts.drivers[carIdx];
                var teamColor = (typeof teamAccentColor === 'function') ? teamAccentColor(d.teamId, d.liveryColorHex) : '#9aa0a6';
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
        // Ghost drivers live under synthetic carIdx (100+) that the server doesn't know;
        // their imported payload carries samples inline. Serve those locally, with the same
        // pit-lane clipping the /lap-samples endpoint applies (negative D = pit lane).
        var localDriver = state.session && state.session.drivers && state.session.drivers[carIdx];
        if (localDriver && localDriver.laps) {
            var localLap = localDriver.laps.find(function (l) { return l.lapNum === lap; });
            if (localLap && localLap.samples) {
                var trackLen = (state.session.meta && state.session.meta.trackLengthM) || 0;
                var maxD = trackLen > 0 ? trackLen + 50 : Infinity;
                var inD = function (p) { return p.d >= 0 && p.d <= maxD; };
                var local = {
                    carIdx: carIdx,
                    lap: lap,
                    samples: localLap.samples.filter(inD),
                    motion: (localLap.motion || []).filter(inD),
                };
                state.lapSamplesCache.set(key, local);
                return Promise.resolve(local);
            }
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
        // Sidebar toggle (Lap Chart driver list)
        var sidebarToggle = e.target.closest('[data-pos-sidebar-toggle]');
        if (sidebarToggle && state.session && state.subTab === 'positions') {
            var idx2 = Number(sidebarToggle.getAttribute('data-pos-sidebar-toggle'));
            var drv2 = state.session.drivers[idx2];
            if (!isNaN(idx2) && drv2 != null) {
                var sel2 = state.driverSelection.get(idx2) || { lap: null, ghost: false, posHidden: false };
                sel2.posHidden = !sel2.posHidden;
                state.driverSelection.set(idx2, sel2);
                var chartRoot2 = document.getElementById('posChart');
                if (chartRoot2) {
                    var group2 = chartRoot2.querySelector('.pos-driver-group[data-car-idx="' + idx2 + '"]');
                    if (group2) group2.classList.toggle('is-hidden', sel2.posHidden);
                    var label2 = chartRoot2.querySelector('.pos-label-hit[data-pos-toggle="' + idx2 + '"]');
                    if (label2) label2.classList.toggle('is-hidden', sel2.posHidden);
                }
                sidebarToggle.classList.toggle('is-hidden', sel2.posHidden);
                var eye2 = sidebarToggle.querySelector('.pos-sidebar-eye');
                if (eye2) eye2.innerHTML = svgPositionEyeMarkup(sel2.posHidden, teamAccentColor(drv2.teamId, drv2.liveryColorHex));
                return;
            }
        }

        // Chart start-label toggle
        var posHit = e.target.closest('[data-pos-toggle]');
        if (posHit && state.session && state.subTab === 'positions') {
            var chartRoot = posHit.closest('#posChart');
            if (chartRoot) {
                var idx = Number(posHit.getAttribute('data-pos-toggle'));
                var drv = state.session.drivers[idx];
                if (!isNaN(idx) && drv != null) {
                    var sel = state.driverSelection.get(idx) || { lap: null, ghost: false, posHidden: false };
                    sel.posHidden = !sel.posHidden;
                    state.driverSelection.set(idx, sel);
                    var group = chartRoot.querySelector('.pos-driver-group[data-car-idx="' + idx + '"]');
                    if (group) group.classList.toggle('is-hidden', sel.posHidden);
                    posHit.classList.toggle('is-hidden', sel.posHidden);
                    var sidebarRow = document.querySelector('.pos-sidebar-row[data-pos-sidebar-toggle="' + idx + '"]');
                    if (sidebarRow) {
                        sidebarRow.classList.toggle('is-hidden', sel.posHidden);
                        var eye = sidebarRow.querySelector('.pos-sidebar-eye');
                        if (eye) eye.innerHTML = svgPositionEyeMarkup(sel.posHidden, teamAccentColor(drv.teamId, drv.liveryColorHex));
                    }
                    return;
                }
            }
        }

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
        openRoute: openRoute,
        close: close,
        get state() { return state; },
        DriverPicker: DriverPicker,
        formatLapTime: formatLapTime,
        formatSectorTime: formatSectorTime,
        fetchLapSamples: fetchLapSamples,
    };
})();
