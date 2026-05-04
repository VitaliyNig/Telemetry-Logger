(function () {
    'use strict';

    var AUTO_SWITCH_KEY = 'f1telemetry_autoswitch_v1';
    var GAME_VERSION_KEY = 'f1telemetry_gameversion_v1';
    var DEFAULT_GAME_VERSION = 'f1_25';
    var HIDE_HEADER_KEY = 'f1telemetry_hide_header_v1';

    // --- State ---
    var debugMode = false;
    var connection = null;
    var consoleEntries = [];
    var MAX_CONSOLE = 2000;
    var initialWebPort = null;
    var autoSaveTimer = null;

    // --- DOM refs ---
    var tabNav = document.getElementById('tabNav');
    var panels = document.querySelectorAll('.tab-panel');
    var debugTabBtn = document.querySelector('.tab-debug');

    var udpListenIp = document.getElementById('udpListenIp');
    var udpListenPort = document.getElementById('udpListenPort');
    var webPort = document.getElementById('webPort');
    var webPortRestartBadge = document.getElementById('webPortRestartBadge');
    var debugModeToggle = document.getElementById('debugMode');
    var autoSwitchPreset = document.getElementById('autoSwitchPreset');
    var enableSessionLogging = document.getElementById('enableSessionLogging');

    var historyFolderInput = document.getElementById('historyFolderInput');
    var historyFolderResolved = document.getElementById('historyFolderResolved');
    var historyFolderError = document.getElementById('historyFolderError');
    var btnSettingsBrowseFolder = document.getElementById('btnSettingsBrowseFolder');
    var btnSettingsResetFolder = document.getElementById('btnSettingsResetFolder');

    var totalPacketsEl = document.getElementById('totalPackets');
    var packetCountsList = document.getElementById('packetCountsList');
    var debugConsole = document.getElementById('debugConsole');
    var autoScrollToggle = document.getElementById('autoScroll');
    var btnClearConsole = document.getElementById('btnClearConsole');
    var btnDownloadLog = document.getElementById('btnDownloadLog');
    var btnResetStats = document.getElementById('btnResetStats');

    var drsCapState = document.getElementById('drsCapState');
    var drsCapTrack = document.getElementById('drsCapTrack');
    var drsCapError = document.getElementById('drsCapError');
    var drsCapOverwrite = document.getElementById('drsCapOverwrite');
    var drsCapOverwriteMsg = document.getElementById('drsCapOverwriteMsg');
    var btnDrsCapStart = document.getElementById('btnDrsCapStart');
    var btnDrsCapCancel = document.getElementById('btnDrsCapCancel');
    var btnDrsCapSave = document.getElementById('btnDrsCapSave');
    var btnDrsCapOverwriteConfirm = document.getElementById('btnDrsCapOverwriteConfirm');
    var btnDrsCapOverwriteCancel = document.getElementById('btnDrsCapOverwriteCancel');

    function updateWebPortRestartBadge() {
        if (!webPortRestartBadge || !webPort) return;
        var current = parseInt(webPort.value, 10);
        var needs = initialWebPort !== null && Number.isFinite(current) && current !== initialWebPort;
        webPortRestartBadge.hidden = !needs;
    }

    function syncDashboardTogglesFromStorage() {
        if (autoSwitchPreset) {
            autoSwitchPreset.checked = localStorage.getItem(AUTO_SWITCH_KEY) !== 'false';
        }
    }

    // --- Tab Navigation ---
    tabNav.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        switchTab(btn.dataset.tab);
    });

    function switchTab(tabId) {
        tabNav.querySelectorAll('.tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });
        panels.forEach(function (p) {
            p.classList.toggle('active', p.id === 'panel-' + tabId);
        });
        document.body.classList.toggle('on-live-tab', tabId === 'live');
        if (tabId === 'history') loadHistorySessions();
    }

    var initialActiveTab = tabNav.querySelector('.tab-btn.active');
    document.body.classList.toggle('on-live-tab', !initialActiveTab || initialActiveTab.dataset.tab === 'live');

    var hideHeaderToggle = document.getElementById('hideHeaderToggle');
    if (hideHeaderToggle) {
        var hideHeader = localStorage.getItem(HIDE_HEADER_KEY) === 'true';
        hideHeaderToggle.checked = hideHeader;
        document.body.classList.toggle('hide-header', hideHeader);
        hideHeaderToggle.addEventListener('change', function () {
            localStorage.setItem(HIDE_HEADER_KEY, hideHeaderToggle.checked ? 'true' : 'false');
            document.body.classList.toggle('hide-header', hideHeaderToggle.checked);
        });
    }

    // --- History ---
    // TRACK_FLAG_MAP is defined in telemetry.js and available globally
    var _historyLoaded = false;
    var _historyWeekends = [];
    var _historyFilters = { track: '', game: '', from: '', to: '' };
    var _historyToolbarBound = false;

    function loadHistorySessions() {
        var container = document.getElementById('historySessionList');
        if (!container) return;

        // Hide the detail view when returning to the list.
        if (window.HistoryDetail) window.HistoryDetail.close();

        ensureHistoryToolbar();
        // Sync the toolbar's folder display in case Settings changed the persisted root.
        refreshHistorySource();

        // Show loading only on first load
        if (!_historyLoaded) {
            container.innerHTML = '<div class="history-empty"><p>Loading...</p></div>';
        }

        fetch('/api/sessions')
            .then(function (r) { return r.json(); })
            .then(function (weekends) {
                _historyLoaded = true;
                _historyWeekends = Array.isArray(weekends) ? weekends : [];
                populateHistoryFilterOptions(_historyWeekends);
                renderHistorySessions();
            })
            .catch(function () {
                _historyWeekends = [];
                container.innerHTML = '<div class="history-empty"><p>Failed to load sessions.</p></div>';
            });
    }

    function renderHistorySessions() {
        var container = document.getElementById('historySessionList');
        if (!container) return;

        if (!_historyWeekends || _historyWeekends.length === 0) {
            container.innerHTML =
                '<div class="history-empty">' +
                    '<div class="placeholder-icon">&#128202;</div>' +
                    '<h2>No Sessions</h2>' +
                    '<p>Recorded sessions will appear here after completing a session.</p>' +
                '</div>';
            return;
        }

        var filtered = _historyWeekends.filter(matchesHistoryFilters);
        if (filtered.length === 0) {
            container.innerHTML =
                '<div class="history-empty">' +
                    '<div class="placeholder-icon">&#128269;</div>' +
                    '<h2>No matches</h2>' +
                    '<p>No sessions match the current filters. Try widening the date range or clearing filters.</p>' +
                '</div>';
            return;
        }

        var folderIcon = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
            + '<path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 0 0 4.75v6.5C0 12.216.784 13 1.75 13h12.5A1.75 1.75 0 0 0 16 11.25V5.75A1.75 1.75 0 0 0 14.25 4H7.5L6 2.5H1.75A1.75 1.75 0 0 0 0 4.25V3z"/>'
            + '</svg>';

        var html = '<div class="history-grid">';
        filtered.forEach(function (w) {
            var flagCode = (typeof TRACK_FLAG_MAP !== 'undefined' && w.trackId != null)
                ? TRACK_FLAG_MAP[w.trackId] : null;
            var flagHtml = flagCode
                ? '<img class="history-card-flag" src="/assets/flags/' + flagCode + '.svg" alt="' + flagCode + '" width="32" height="20">'
                : '';
            var gameLabel = w.gameYear ? 'F1 ' + w.gameYear : '';

            var tags = gameLabel
                ? '<span class="history-tag history-tag-game">' + escapeHtml(gameLabel) + '</span>'
                : '';
            var firstDate = '';
            if (w.sessions && w.sessions.length > 0) {
                w.sessions.forEach(function (s) {
                    tags += '<span class="history-tag">' + escapeHtml(s.typeName || s.slug) + '</span>';
                });
                firstDate = formatSessionDate(w.sessions[0].savedAt);
            }

            html += '<div class="history-card" data-folder="' + escapeHtml(w.folder) + '"'
                + ' data-weekend-name="' + escapeHtml(w.trackName || w.folder) + '">' +
                '<button type="button" class="history-card-open-folder" title="Open folder in Explorer" aria-label="Open folder">' +
                    folderIcon +
                '</button>' +
                '<div class="history-card-header">' +
                    '<div class="history-card-title">' + flagHtml + '<span>' + escapeHtml(w.trackName || w.folder) + '</span></div>' +
                '</div>' +
                '<div class="history-card-tags">' + tags + '</div>' +
                '<div class="history-card-date">' + firstDate + '</div>' +
            '</div>';
        });
        html += '</div>';
        container.innerHTML = html;

        // Clicking the card opens the session (picker modal when >1 session). The small
        // folder button in the corner is the only way to trigger Open-In-Explorer now.
        container.querySelectorAll('.history-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.history-card-open-folder')) return;
                var weekend = _historyWeekends.find(function (x) { return x.folder === card.dataset.folder; });
                if (!weekend || !window.HistoryDetail) return;
                if (weekend.sessions.length === 1) {
                    window.HistoryDetail.open(weekend.folder, weekend.sessions[0].slug, card.dataset.weekendName);
                } else {
                    openSessionPickerModal(weekend, card.dataset.weekendName);
                }
            });
        });
        container.querySelectorAll('.history-card-open-folder').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var card = btn.closest('.history-card');
                if (!card) return;
                fetch('/api/sessions/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: card.dataset.folder })
                });
            });
        });
    }

    // ---------- History toolbar (filters + folder selector) ----------

    function matchesHistoryFilters(w) {
        if (_historyFilters.track && String(w.trackId) !== _historyFilters.track) return false;
        if (_historyFilters.game && String(w.gameYear || '') !== _historyFilters.game) return false;
        var from = _historyFilters.from ? new Date(_historyFilters.from + 'T00:00:00') : null;
        // Use end-of-day for the "to" bound so the picked date is inclusive.
        var to = _historyFilters.to ? new Date(_historyFilters.to + 'T23:59:59.999') : null;
        if (!from && !to) return true;

        // A weekend matches when at least one of its sessions falls in range.
        if (!w.sessions || w.sessions.length === 0) return false;
        return w.sessions.some(function (s) {
            if (!s.savedAt) return false;
            var d = new Date(s.savedAt);
            if (isNaN(d.getTime())) return false;
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
    }

    function populateHistoryFilterOptions(weekends) {
        var trackSel = document.getElementById('historyFilterTrack');
        var gameSel = document.getElementById('historyFilterGame');
        if (!trackSel || !gameSel) return;

        var tracks = new Map();
        var games = new Set();
        weekends.forEach(function (w) {
            if (w.trackId != null) {
                var key = String(w.trackId);
                if (!tracks.has(key)) tracks.set(key, w.trackName || ('Track ' + key));
            }
            if (w.gameYear) games.add(String(w.gameYear));
        });

        var trackArr = Array.from(tracks.entries())
            .sort(function (a, b) { return a[1].localeCompare(b[1]); });
        rebuildSelect(trackSel, trackArr, _historyFilters.track, 'All tracks');

        var gameArr = Array.from(games)
            .sort(function (a, b) { return Number(b) - Number(a); })
            .map(function (g) { return [g, 'F1 ' + g]; });
        rebuildSelect(gameSel, gameArr, _historyFilters.game, 'All versions');

        updateClearFiltersVisibility();
    }

    function rebuildSelect(sel, entries, currentValue, allLabel) {
        var prev = currentValue || '';
        var hadCurrent = entries.some(function (e) { return e[0] === prev; });
        sel.innerHTML = '';
        var optAll = document.createElement('option');
        optAll.value = '';
        optAll.textContent = allLabel;
        sel.appendChild(optAll);
        entries.forEach(function (e) {
            var opt = document.createElement('option');
            opt.value = e[0];
            opt.textContent = e[1];
            sel.appendChild(opt);
        });
        sel.value = hadCurrent ? prev : '';
    }

    function updateClearFiltersVisibility() {
        var btn = document.getElementById('btnHistoryClearFilters');
        if (!btn) return;
        var any = !!(_historyFilters.track || _historyFilters.game || _historyFilters.from || _historyFilters.to);
        btn.hidden = !any;
    }

    function ensureHistoryToolbar() {
        if (_historyToolbarBound) return;
        _historyToolbarBound = true;

        var trackSel = document.getElementById('historyFilterTrack');
        var gameSel = document.getElementById('historyFilterGame');
        var fromInp = document.getElementById('historyFilterFrom');
        var toInp = document.getElementById('historyFilterTo');
        var clearBtn = document.getElementById('btnHistoryClearFilters');
        var selectFolderBtn = document.getElementById('btnHistorySelectFolder');
        var resetFolderBtn = document.getElementById('btnHistoryResetFolder');

        if (trackSel) trackSel.addEventListener('change', function () {
            _historyFilters.track = trackSel.value;
            updateClearFiltersVisibility();
            renderHistorySessions();
        });
        if (gameSel) gameSel.addEventListener('change', function () {
            _historyFilters.game = gameSel.value;
            updateClearFiltersVisibility();
            renderHistorySessions();
        });
        if (fromInp) fromInp.addEventListener('change', function () {
            _historyFilters.from = fromInp.value;
            updateClearFiltersVisibility();
            renderHistorySessions();
        });
        if (toInp) toInp.addEventListener('change', function () {
            _historyFilters.to = toInp.value;
            updateClearFiltersVisibility();
            renderHistorySessions();
        });
        if (clearBtn) clearBtn.addEventListener('click', function () {
            _historyFilters = { track: '', game: '', from: '', to: '' };
            if (trackSel) trackSel.value = '';
            if (gameSel) gameSel.value = '';
            if (fromInp) fromInp.value = '';
            if (toInp) toInp.value = '';
            updateClearFiltersVisibility();
            renderHistorySessions();
        });

        if (selectFolderBtn) selectFolderBtn.addEventListener('click', onSelectHistoryFolder);
        if (resetFolderBtn) resetFolderBtn.addEventListener('click', function () {
            setHistorySource(null);
        });

        var pathEl = document.getElementById('historyFolderPath');
        if (pathEl) {
            pathEl.addEventListener('change', function () {
                var newPath = pathEl.value.trim();
                if (newPath) setHistorySource(newPath);
            });
            pathEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    pathEl.blur();
                }
            });
        }
    }

    function refreshHistorySource() {
        fetch('/api/sessions/source')
            .then(function (r) { return r.json(); })
            .then(updateHistoryFolderUi)
            .catch(function () { /* leave default label */ });
    }

    function updateHistoryFolderUi(info) {
        var pathEl = document.getElementById('historyFolderPath');
        var badgeEl = document.getElementById('historyFolderBadge');
        var resetBtn = document.getElementById('btnHistoryResetFolder');
        if (pathEl) {
            pathEl.value = info && info.path ? info.path : 'Logs';
            pathEl.title = pathEl.value;
        }
        var isDefault = !info || info.isDefault !== false;
        if (badgeEl) badgeEl.hidden = isDefault;
        if (resetBtn) resetBtn.hidden = isDefault;
    }

    function promptHistorySourcePath() {
        var current = (document.getElementById('historyFolderPath') || {}).value || '';
        var typed = window.prompt('Enter the absolute path to the History source folder:', current);
        return typed ? { path: typed.trim() } : null;
    }

    function browseHistorySourceSignal() {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
            return AbortSignal.timeout(120000);
        return undefined;
    }

    function onSelectHistoryFolder() {
        var btn = document.getElementById('btnHistorySelectFolder');
        if (btn) btn.disabled = true;

        // Native folder dialog via host; 503/500 or network loss → manual path (same as headless).
        fetch('/api/sessions/source/browse', { method: 'POST', signal: browseHistorySourceSignal() })
            .then(function (r) {
                if (r.status === 204) return null;
                if (r.status === 503 || r.status === 500) return 'fallback';
                if (!r.ok) throw new Error('browse failed: ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (data === null) return null;
                if (data === 'fallback') return promptHistorySourcePath();
                return data;
            })
            .then(function (picked) {
                if (!picked || !picked.path) return;
                return setHistorySource(picked.path);
            })
            .catch(function (err) {
                var msg = String(err && err.message ? err.message : err);
                var isAbort = err && err.name === 'AbortError';
                var isNetwork = isAbort || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
                if (isNetwork) {
                    var picked = promptHistorySourcePath();
                    if (picked && picked.path) setHistorySource(picked.path);
                    return;
                }
                window.alert('Failed to select folder: ' + msg);
            })
            .finally(function () {
                if (btn) btn.disabled = false;
            });
    }

    function setHistorySource(path) {
        return fetch('/api/sessions/source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        }).then(function (r) {
            if (!r.ok) {
                return r.json().then(function (e) {
                    throw new Error(e && e.error ? e.error : ('HTTP ' + r.status));
                });
            }
            return r.json();
        }).then(function (info) {
            updateHistoryFolderUi(info);
            // Force-reload the session list from the new source.
            _historyLoaded = false;
            loadHistorySessions();
        }).catch(function (err) {
            window.alert('Could not set folder: ' + (err.message || err));
        });
    }

    function openSessionPickerModal(weekend, weekendName) {
        var overlay = document.createElement('div');
        overlay.className = 'history-modal-overlay';
        var rows = weekend.sessions.map(function (s) {
            return '<button type="button" class="session-pick-row" data-slug="' + escapeHtml(s.slug) + '">'
                + '<span class="session-pick-name">' + escapeHtml(s.typeName || s.slug) + '</span>'
                + '<span class="session-pick-date">' + formatSessionDate(s.savedAt) + '</span>'
                + '</button>';
        }).join('');
        var flagCode = (typeof TRACK_FLAG_MAP !== 'undefined' && weekend.trackId != null)
            ? TRACK_FLAG_MAP[weekend.trackId] : null;
        var flagHtml = flagCode
            ? '<img class="history-modal-flag" src="/assets/flags/' + flagCode + '.svg" alt="' + flagCode + '" width="32" height="20">'
            : '';
        overlay.innerHTML = ''
            + '<div class="history-modal">'
            +   '<div class="history-modal-header">'
            +     '<span class="history-modal-header-title">' + flagHtml + '<span class="history-modal-header-text"><span class="history-modal-header-track">' + escapeHtml(weekendName) + '</span><span class="history-modal-header-sub">pick a session</span></span></span>'
            +     '<button class="history-modal-close" aria-label="Close">&times;</button>'
            +   '</div>'
            +   '<div class="history-modal-body">' + rows + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
        function dismiss() { overlay.remove(); }
        overlay.querySelector('.history-modal-close').addEventListener('click', dismiss);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
        overlay.querySelectorAll('.session-pick-row').forEach(function (btn) {
            btn.addEventListener('click', function () {
                dismiss();
                window.HistoryDetail.open(weekend.folder, btn.dataset.slug, weekendName);
            });
        });
    }

    function formatSessionDate(isoStr) {
        if (!isoStr) return '';
        try {
            var d = new Date(isoStr);
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
                ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return isoStr; }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- Settings ---
    function loadSettings() {
        syncDashboardTogglesFromStorage();

        fetch('/api/settings')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                udpListenIp.value = data.udpListenIp;
                udpListenPort.value = data.udpListenPort;
                webPort.value = data.webPort;
                initialWebPort = parseInt(data.webPort, 10);
                debugModeToggle.checked = data.debugMode;
                if (enableSessionLogging) enableSessionLogging.checked = data.enableSessionLogging;
                if (historyFolderInput) historyFolderInput.value = data.historyFolder || '';
                updateHistoryFolderSettingsUi(data, null);
                setDebugMode(data.debugMode);
                syncDashboardTogglesFromStorage();
                updateWebPortRestartBadge();
                if (typeof window.applyDashboardLayoutLock === 'function') {
                    window.applyDashboardLayoutLock();
                }
            })
            .catch(function (err) {
                console.error('Failed to load settings:', err);
            });
    }

    function autoSaveSettings() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
            autoSaveTimer = null;
            var historyFolderRaw = historyFolderInput ? historyFolderInput.value.trim() : '';
            var body = {
                udpListenIp: udpListenIp.value.trim(),
                udpListenPort: parseInt(udpListenPort.value, 10),
                webPort: parseInt(webPort.value, 10),
                debugMode: debugModeToggle.checked,
                enableSessionLogging: !!(enableSessionLogging && enableSessionLogging.checked),
                historyFolder: historyFolderRaw || null
            };

            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
                .then(function (r) {
                    return r.json().then(function (b) { return { ok: r.ok, body: b }; });
                })
                .then(function (res) {
                    if (!res.ok) {
                        var msg = (res.body && res.body.error) ? res.body.error : 'Save failed';
                        if (historyFolderError) {
                            historyFolderError.textContent = msg + (res.body && res.body.path ? ' (' + res.body.path + ')' : '');
                            historyFolderError.hidden = false;
                        }
                        return;
                    }
                    if (historyFolderError) historyFolderError.hidden = true;
                    localStorage.setItem(AUTO_SWITCH_KEY, autoSwitchPreset && autoSwitchPreset.checked ? 'true' : 'false');
                    if (typeof window.applyDashboardLayoutLock === 'function') {
                        window.applyDashboardLayoutLock();
                    }
                    updateWebPortRestartBadge();
                    // The persisted History root may have changed — refresh whatever the History
                    // toolbar shows next time it opens, and invalidate cached weekend data.
                    refreshHistorySource();
                    _historyLoaded = false;
                })
                .catch(function (err) {
                    console.error('Failed to save settings:', err);
                });
        }, 400);
    }

    function updateHistoryFolderSettingsUi(settingsData, errorMsg) {
        if (!historyFolderResolved && !btnSettingsResetFolder) return;
        var raw = (historyFolderInput && historyFolderInput.value || '').trim();
        var hasCustom = raw.length > 0;
        if (btnSettingsResetFolder) btnSettingsResetFolder.hidden = !hasCustom;
        if (historyFolderResolved) {
            if (settingsData && settingsData.historyFolderResolved && hasCustom) {
                historyFolderResolved.textContent = 'Resolved: ' + settingsData.historyFolderResolved;
                historyFolderResolved.hidden = false;
            } else {
                historyFolderResolved.hidden = true;
            }
        }
        if (historyFolderError) {
            if (errorMsg) {
                historyFolderError.textContent = errorMsg;
                historyFolderError.hidden = false;
            } else {
                historyFolderError.hidden = true;
            }
        }
    }

    function setDebugMode(enabled) {
        debugMode = enabled;
        if (typeof window.__f1TelemetrySetDashboardDebugMode === 'function') {
            window.__f1TelemetrySetDashboardDebugMode(enabled);
        }
        if (enabled) {
            debugTabBtn.classList.remove('hidden');
            initSignalR();
            drsCapFetchStatus();
        } else {
            debugTabBtn.classList.add('hidden');
            drsCapStopPolling();
            var activeTab = tabNav.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'debug') {
                switchTab('live');
            }
        }
    }

    debugModeToggle.addEventListener('change', function () {
        setDebugMode(this.checked);
        autoSaveSettings();
    });

    if (autoSwitchPreset) {
        autoSwitchPreset.addEventListener('change', autoSaveSettings);
    }
    if (enableSessionLogging) {
        enableSessionLogging.addEventListener('change', autoSaveSettings);
    }

    if (historyFolderInput) {
        historyFolderInput.addEventListener('input', function () {
            updateHistoryFolderSettingsUi(null, null);
            autoSaveSettings();
        });
    }
    if (btnSettingsBrowseFolder) {
        btnSettingsBrowseFolder.addEventListener('click', function () {
            btnSettingsBrowseFolder.disabled = true;
            fetch('/api/sessions/source/browse', { method: 'POST', signal: browseHistorySourceSignal() })
                .then(function (r) {
                    if (r.status === 204) return null;
                    if (r.status === 503 || r.status === 500) return 'fallback';
                    if (!r.ok) throw new Error('browse failed: ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    if (data === null) return null;
                    if (data === 'fallback') {
                        var current = historyFolderInput ? historyFolderInput.value : '';
                        var typed = window.prompt('Enter the absolute path for the History folder:', current);
                        return typed ? { path: typed.trim() } : null;
                    }
                    return data;
                })
                .then(function (picked) {
                    if (!picked || !picked.path) return;
                    if (historyFolderInput) historyFolderInput.value = picked.path;
                    updateHistoryFolderSettingsUi(null, null);
                    autoSaveSettings();
                })
                .catch(function (err) {
                    var msg = String(err && err.message ? err.message : err);
                    var isAbort = err && err.name === 'AbortError';
                    var isNetwork = isAbort || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
                    if (isNetwork) {
                        var current = historyFolderInput ? historyFolderInput.value : '';
                        var typed = window.prompt('Enter the absolute path for the History folder:', current);
                        if (typed && historyFolderInput) {
                            historyFolderInput.value = typed.trim();
                            updateHistoryFolderSettingsUi(null, null);
                            autoSaveSettings();
                        }
                        return;
                    }
                    if (historyFolderError) {
                        historyFolderError.textContent = 'Browse failed: ' + msg;
                        historyFolderError.hidden = false;
                    }
                })
                .finally(function () { btnSettingsBrowseFolder.disabled = false; });
        });
    }
    if (btnSettingsResetFolder) {
        btnSettingsResetFolder.addEventListener('click', function () {
            if (historyFolderInput) historyFolderInput.value = '';
            updateHistoryFolderSettingsUi(null, null);
            autoSaveSettings();
        });
    }

    [udpListenIp, udpListenPort, webPort].forEach(function (el) {
        if (!el) return;
        el.addEventListener('input', function () {
            if (el === webPort) updateWebPortRestartBadge();
            autoSaveSettings();
        });
        el.addEventListener('change', autoSaveSettings);
    });

    var gameVersionSelect = document.getElementById('gameVersionSelect');
    if (gameVersionSelect) {
        var savedVersion = localStorage.getItem(GAME_VERSION_KEY) || DEFAULT_GAME_VERSION;
        var hasSavedOption = false;
        for (var i = 0; i < gameVersionSelect.options.length; i++) {
            if (gameVersionSelect.options[i].value === savedVersion) { hasSavedOption = true; break; }
        }
        gameVersionSelect.value = hasSavedOption ? savedVersion : DEFAULT_GAME_VERSION;
        gameVersionSelect.addEventListener('change', function () {
            localStorage.setItem(GAME_VERSION_KEY, gameVersionSelect.value);
        });
    }

    var btnAutoConfigureUdp = document.getElementById('btnAutoConfigureUdp');
    var autoConfigureStatus = document.getElementById('autoConfigureStatus');
    if (btnAutoConfigureUdp) {
        btnAutoConfigureUdp.addEventListener('click', function () {
            btnAutoConfigureUdp.disabled = true;
            if (autoConfigureStatus) {
                autoConfigureStatus.hidden = false;
                autoConfigureStatus.textContent = 'Applying…';
                autoConfigureStatus.className = 'auto-configure-status is-pending';
            }
            fetch('/api/game/configure-udp', { method: 'POST' })
                .then(function (res) {
                    return res.json().then(function (body) { return { ok: res.ok, body: body }; });
                })
                .then(function (r) {
                    if (autoConfigureStatus) {
                        if (r.ok) {
                            autoConfigureStatus.textContent = 'Applied: ' + r.body.ip + ':' + r.body.port;
                            autoConfigureStatus.className = 'auto-configure-status is-ok';
                        } else {
                            autoConfigureStatus.textContent = (r.body && (r.body.error || r.body.detail)) || 'Failed';
                            autoConfigureStatus.className = 'auto-configure-status is-err';
                        }
                    }
                })
                .catch(function (err) {
                    if (autoConfigureStatus) {
                        autoConfigureStatus.textContent = 'Error: ' + err.message;
                        autoConfigureStatus.className = 'auto-configure-status is-err';
                    }
                })
                .finally(function () {
                    btnAutoConfigureUdp.disabled = false;
                });
        });
    }

    // --- SignalR ---
    // Reuse the single connection owned by telemetry.js instead of opening a
    // second WebSocket for the Debug tab.
    function initSignalR() {
        if (connection) return;
        var subscribe = window.__f1TelemetryOnConnection;
        if (typeof subscribe !== 'function') return;
        subscribe(function (conn) {
            connection = conn;
            conn.on('DebugPacket', updateDebugPanel);
            loadDebugStats();
        });
    }

    function loadDebugStats() {
        fetch('/api/debug/stats')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                renderPacketCounts(data.counts, data.total);
            })
            .catch(function (err) {
                console.error('Failed to load debug stats:', err);
            });
    }

    // --- Debug Panel ---
    function updateDebugPanel(data) {
        renderPacketCounts(data.counts, data.total);
        addConsoleEntry(data.timestamp, data.name);
    }

    function renderPacketCounts(counts, total) {
        totalPacketsEl.textContent = formatNumber(total);

        if (!counts || Object.keys(counts).length === 0) {
            packetCountsList.innerHTML = '<p class="muted">No packets received yet.</p>';
            return;
        }

        var sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
        var html = sorted.map(function (pair) {
            return '<div class="stat-item">' +
                '<span class="stat-item-name">' + escapeHtml(pair[0]) + '</span>' +
                '<span class="stat-item-count">' + formatNumber(pair[1]) + '</span>' +
                '</div>';
        }).join('');

        packetCountsList.innerHTML = html;
    }

    function addConsoleEntry(timestamp, name) {
        consoleEntries.push({ timestamp: timestamp, name: name });
        if (consoleEntries.length > MAX_CONSOLE) {
            consoleEntries.shift();
        }

        var entry = document.createElement('div');
        entry.className = 'console-entry';
        entry.innerHTML =
            '<span class="console-time">' + escapeHtml(timestamp) + '</span>' +
            '<span class="console-name">' + escapeHtml(name) + '</span>';

        if (debugConsole.querySelector('.muted')) {
            debugConsole.innerHTML = '';
        }

        debugConsole.appendChild(entry);

        while (debugConsole.children.length > MAX_CONSOLE) {
            debugConsole.removeChild(debugConsole.firstChild);
        }

        if (autoScrollToggle.checked) {
            debugConsole.scrollTop = debugConsole.scrollHeight;
        }
    }

    btnClearConsole.addEventListener('click', function () {
        consoleEntries.length = 0;
        debugConsole.innerHTML = '<p class="muted">Console cleared.</p>';
    });

    btnDownloadLog.addEventListener('click', function () {
        fetch('/api/debug/log/download')
            .then(function (r) { return r.text(); })
            .then(function (text) {
                var blob = new Blob([text], { type: 'text/plain' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'f1telemetry-debug-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            })
            .catch(function (err) {
                console.error('Failed to download log:', err);
            });
    });

    btnResetStats.addEventListener('click', function () {
        if (!confirm('Reset all packet counters and log?')) return;

        fetch('/api/debug/reset', { method: 'POST' })
            .then(function () {
                totalPacketsEl.textContent = '0';
                packetCountsList.innerHTML = '<p class="muted">No packets received yet.</p>';
                debugConsole.innerHTML = '<p class="muted">Stats reset.</p>';
                consoleEntries.length = 0;
            })
            .catch(function (err) {
                console.error('Failed to reset:', err);
            });
    });

    // --- DRS-zone capture ---
    var drsCapPollHandle = null;

    function drsCapShowError(msg) {
        if (!drsCapError) return;
        if (msg) {
            drsCapError.textContent = msg;
            drsCapError.hidden = false;
        } else {
            drsCapError.textContent = '';
            drsCapError.hidden = true;
        }
    }

    function drsCapRender(snapshot) {
        if (!snapshot) return;
        var stateText;
        switch (snapshot.state) {
            case 'Armed':
                stateText = 'Waiting for next lap to start…';
                break;
            case 'Recording':
                stateText = 'Recording lap ' + (snapshot.currentLapNum || '?') +
                    ' · ' + (snapshot.capturedZoneCount || 0) + ' zones';
                break;
            case 'Completed':
                stateText = 'Captured ' + snapshot.capturedZoneCount + ' zones — review and save';
                break;
            default:
                stateText = 'Ready';
        }
        drsCapState.textContent = stateText;
        drsCapTrack.textContent = snapshot.trackId != null
            ? 'Track id ' + snapshot.trackId
            : '';

        btnDrsCapStart.disabled = snapshot.state !== 'Idle';
        btnDrsCapCancel.disabled = snapshot.state === 'Idle';
        btnDrsCapSave.disabled = snapshot.state !== 'Completed';

        if (snapshot.error) {
            drsCapShowError(snapshot.error);
        } else if (snapshot.state !== 'Idle') {
            drsCapShowError(null);
        }

        if (snapshot.state === 'Idle') {
            drsCapStopPolling();
        } else {
            drsCapStartPolling();
        }
    }

    function drsCapStartPolling() {
        if (drsCapPollHandle != null) return;
        drsCapPollHandle = setInterval(drsCapFetchStatus, 1000);
    }

    function drsCapStopPolling() {
        if (drsCapPollHandle == null) return;
        clearInterval(drsCapPollHandle);
        drsCapPollHandle = null;
    }

    function drsCapFetchStatus() {
        fetch('/api/debug/drs-zones/capture/status')
            .then(function (r) { return r.json(); })
            .then(drsCapRender)
            .catch(function (err) { console.error('DRS capture status failed:', err); });
    }

    function drsCapStart(overwriteExisting) {
        drsCapShowError(null);
        return fetch('/api/debug/drs-zones/capture/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overwriteExisting: !!overwriteExisting })
        }).then(function (r) {
            if (r.status === 409) {
                return r.json().then(function (data) {
                    drsCapOverwriteMsg.textContent =
                        'Track ' + data.trackId + ' already has ' +
                        (data.existingZones ? data.existingZones.length : 0) +
                        ' zones — overwrite?';
                    drsCapOverwrite.hidden = false;
                });
            }
            return r.json().then(function (data) {
                if (!r.ok) {
                    drsCapShowError(data.error || ('HTTP ' + r.status));
                    return;
                }
                drsCapOverwrite.hidden = true;
                drsCapRender(data);
            });
        }).catch(function (err) {
            drsCapShowError('Network error: ' + err.message);
        });
    }

    if (btnDrsCapStart) {
        btnDrsCapStart.addEventListener('click', function () { drsCapStart(false); });
    }

    if (btnDrsCapCancel) {
        btnDrsCapCancel.addEventListener('click', function () {
            fetch('/api/debug/drs-zones/capture/cancel', { method: 'POST' })
                .then(function (r) { return r.json(); })
                .then(drsCapRender)
                .catch(function (err) { console.error('DRS capture cancel failed:', err); });
        });
    }

    if (btnDrsCapSave) {
        btnDrsCapSave.addEventListener('click', function () {
            btnDrsCapSave.disabled = true;
            fetch('/api/debug/drs-zones/capture/save', { method: 'POST' })
                .then(function (r) {
                    return r.json().then(function (data) { return { ok: r.ok, data: data }; });
                })
                .then(function (res) {
                    if (!res.ok) {
                        drsCapShowError((res.data && (res.data.detail || res.data.error)) || 'Save failed');
                        btnDrsCapSave.disabled = false;
                        return;
                    }
                    drsCapShowError(null);
                    drsCapFetchStatus();
                    alert('Saved ' + (res.data.zones ? res.data.zones.length : 0) +
                        ' zones for track ' + res.data.trackId + '.');
                })
                .catch(function (err) {
                    drsCapShowError('Network error: ' + err.message);
                    btnDrsCapSave.disabled = false;
                });
        });
    }

    if (btnDrsCapOverwriteConfirm) {
        btnDrsCapOverwriteConfirm.addEventListener('click', function () {
            drsCapOverwrite.hidden = true;
            drsCapStart(true);
        });
    }

    if (btnDrsCapOverwriteCancel) {
        btnDrsCapOverwriteCancel.addEventListener('click', function () {
            drsCapOverwrite.hidden = true;
        });
    }

    // Refresh status whenever the user opens the Debug tab so stale UI from a previous
    // session doesn't linger after navigation.
    if (tabNav) {
        tabNav.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('.tab-btn[data-tab="debug"]');
            if (btn) drsCapFetchStatus();
        });
    }

    // --- Helpers ---
    function formatNumber(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // --- Init ---
    ensureHistoryToolbar();
    window.f1telemetryBrowseHistorySource = onSelectHistoryFolder;
    loadSettings();
})();
