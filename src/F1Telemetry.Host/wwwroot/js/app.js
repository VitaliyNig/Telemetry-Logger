(function () {
    'use strict';

    var AUTO_SWITCH_KEY = 'f1telemetry_autoswitch_v1';

    // --- State ---
    var debugMode = false;
    var connection = null;
    var consoleEntries = [];
    var MAX_CONSOLE = 2000;
    var lastSavedSettingsSnapshot = null;

    // --- DOM refs ---
    var tabNav = document.getElementById('tabNav');
    var panels = document.querySelectorAll('.tab-panel');
    var debugTabBtn = document.querySelector('.tab-debug');

    var udpListenIp = document.getElementById('udpListenIp');
    var udpListenPort = document.getElementById('udpListenPort');
    var webPort = document.getElementById('webPort');
    var debugModeToggle = document.getElementById('debugMode');
    var autoSwitchPreset = document.getElementById('autoSwitchPreset');
    var enableSessionLogging = document.getElementById('enableSessionLogging');
    var btnSave = document.getElementById('btnSaveSettings');
    var saveStatus = document.getElementById('saveStatus');

    var totalPacketsEl = document.getElementById('totalPackets');
    var packetCountsList = document.getElementById('packetCountsList');
    var debugConsole = document.getElementById('debugConsole');
    var autoScrollToggle = document.getElementById('autoScroll');
    var btnClearConsole = document.getElementById('btnClearConsole');
    var btnDownloadLog = document.getElementById('btnDownloadLog');
    var btnResetStats = document.getElementById('btnResetStats');

    function getSettingsSnapshot() {
        return {
            udpListenIp: udpListenIp ? udpListenIp.value.trim() : '',
            udpListenPort: udpListenPort ? parseInt(udpListenPort.value, 10) : 0,
            webPort: webPort ? parseInt(webPort.value, 10) : 0,
            debugMode: !!(debugModeToggle && debugModeToggle.checked),
            autoSwitchPreset: !!(autoSwitchPreset && autoSwitchPreset.checked),
            enableSessionLogging: !!(enableSessionLogging && enableSessionLogging.checked)
        };
    }

    function snapshotsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    function updateSettingsDirtyState() {
        if (!btnSave) return;
        if (lastSavedSettingsSnapshot === null) {
            btnSave.classList.remove('btn-settings-dirty');
            return;
        }
        btnSave.classList.toggle('btn-settings-dirty', !snapshotsEqual(lastSavedSettingsSnapshot, getSettingsSnapshot()));
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
        if (tabId === 'history') loadHistorySessions();
    }

    // --- History ---
    // TRACK_FLAG_MAP is defined in telemetry.js and available globally
    var _historyLoaded = false;

    function loadHistorySessions() {
        var container = document.getElementById('historySessionList');
        if (!container) return;

        // Show loading only on first load
        if (!_historyLoaded) {
            container.innerHTML = '<div class="history-empty"><p>Loading...</p></div>';
        }

        fetch('/api/sessions')
            .then(function (r) { return r.json(); })
            .then(function (weekends) {
                _historyLoaded = true;
                if (!weekends || weekends.length === 0) {
                    container.innerHTML =
                        '<div class="history-empty">' +
                            '<div class="placeholder-icon">&#128202;</div>' +
                            '<h2>No Sessions</h2>' +
                            '<p>Recorded sessions will appear here after completing a session.</p>' +
                        '</div>';
                    return;
                }

                var html = '<div class="history-grid">';
                weekends.forEach(function (w) {
                    var flagCode = (typeof TRACK_FLAG_MAP !== 'undefined' && w.trackId != null)
                        ? TRACK_FLAG_MAP[w.trackId] : null;
                    var flagHtml = flagCode
                        ? '<img class="history-card-flag" src="/assets/flags/' + flagCode + '.svg" alt="' + flagCode + '" width="32" height="20">'
                        : '';
                    var gameLabel = w.gameYear ? 'F1 ' + w.gameYear : '';

                    var tags = '';
                    var firstDate = '';
                    if (w.sessions && w.sessions.length > 0) {
                        w.sessions.forEach(function (s) {
                            tags += '<span class="history-tag">' + escapeHtml(s.typeName || s.slug) + '</span>';
                        });
                        firstDate = formatSessionDate(w.sessions[0].savedAt);
                    }

                    html += '<div class="history-card" data-folder="' + escapeHtml(w.folder) + '">' +
                        '<div class="history-card-header">' +
                            '<div class="history-card-title">' + flagHtml + '<span>' + escapeHtml(w.trackName || w.folder) + '</span></div>' +
                            (gameLabel ? '<span class="history-card-game">' + gameLabel + '</span>' : '') +
                        '</div>' +
                        '<div class="history-card-tags">' + tags + '</div>' +
                        '<div class="history-card-date">' + firstDate + '</div>' +
                    '</div>';
                });
                html += '</div>';
                container.innerHTML = html;

                // Click handler — open folder
                container.querySelectorAll('.history-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        var folder = card.dataset.folder;
                        if (!folder) return;
                        fetch('/api/sessions/open-folder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ folder: folder })
                        });
                    });
                });
            })
            .catch(function () {
                container.innerHTML = '<div class="history-empty"><p>Failed to load sessions.</p></div>';
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
                debugModeToggle.checked = data.debugMode;
                if (enableSessionLogging) enableSessionLogging.checked = data.enableSessionLogging;
                setDebugMode(data.debugMode);
                syncDashboardTogglesFromStorage();
                lastSavedSettingsSnapshot = getSettingsSnapshot();
                updateSettingsDirtyState();
                if (typeof window.applyDashboardLayoutLock === 'function') {
                    window.applyDashboardLayoutLock();
                }
            })
            .catch(function (err) {
                console.error('Failed to load settings:', err);
                lastSavedSettingsSnapshot = getSettingsSnapshot();
                updateSettingsDirtyState();
            });
    }

    function setDebugMode(enabled) {
        debugMode = enabled;
        if (typeof window.__f1TelemetrySetDashboardDebugMode === 'function') {
            window.__f1TelemetrySetDashboardDebugMode(enabled);
        }
        if (enabled) {
            debugTabBtn.classList.remove('hidden');
            initSignalR();
        } else {
            debugTabBtn.classList.add('hidden');
            var activeTab = tabNav.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'debug') {
                switchTab('live');
            }
        }
    }

    debugModeToggle.addEventListener('change', function () {
        setDebugMode(this.checked);
        updateSettingsDirtyState();
    });

    if (autoSwitchPreset) {
        autoSwitchPreset.addEventListener('change', updateSettingsDirtyState);
    }
    if (enableSessionLogging) {
        enableSessionLogging.addEventListener('change', updateSettingsDirtyState);
    }

    function wireSettingsInputsDirty() {
        [udpListenIp, udpListenPort, webPort].forEach(function (el) {
            if (!el) return;
            el.addEventListener('input', updateSettingsDirtyState);
            el.addEventListener('change', updateSettingsDirtyState);
        });
    }
    wireSettingsInputsDirty();

    btnSave.addEventListener('click', function () {
        var body = {
            udpListenIp: udpListenIp.value.trim(),
            udpListenPort: parseInt(udpListenPort.value, 10),
            webPort: parseInt(webPort.value, 10),
            debugMode: debugModeToggle.checked,
            enableSessionLogging: !!(enableSessionLogging && enableSessionLogging.checked)
        };

        saveStatus.textContent = 'Saving...';
        saveStatus.style.color = 'var(--text-secondary)';

        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                localStorage.setItem(AUTO_SWITCH_KEY, autoSwitchPreset && autoSwitchPreset.checked ? 'true' : 'false');
                lastSavedSettingsSnapshot = getSettingsSnapshot();
                updateSettingsDirtyState();
                if (typeof window.applyDashboardLayoutLock === 'function') {
                    window.applyDashboardLayoutLock();
                }
                saveStatus.textContent = data.message || 'Saved!';
                saveStatus.style.color = 'var(--green)';
                setTimeout(function () { saveStatus.textContent = ''; }, 4000);
            })
            .catch(function (err) {
                saveStatus.textContent = 'Error saving settings';
                saveStatus.style.color = 'var(--red)';
                console.error(err);
            });
    });

    // --- SignalR ---
    function initSignalR() {
        if (connection) return;

        connection = new signalR.HubConnectionBuilder()
            .withUrl('/hub/telemetry')
            .withAutomaticReconnect()
            .build();

        connection.on('DebugPacket', function (data) {
            updateDebugPanel(data);
        });

        connection.start()
            .then(function () {
                console.log('SignalR connected');
                loadDebugStats();
            })
            .catch(function (err) {
                console.error('SignalR connection error:', err);
                connection = null;
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

    // --- Helpers ---
    function formatNumber(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // --- Init ---
    loadSettings();
})();
