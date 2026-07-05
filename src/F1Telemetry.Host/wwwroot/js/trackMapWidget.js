// Live Track Map dashboard widget. Renders the authored circuit (track3d.js ribbon:
// real width, kerbs, banking, pit lane) with one marker per car, driven by the compact
// ReceiveCarPositions broadcast (~10 Hz; Motion itself is not streamed live).
//
// Uses its own TrackMap3D instance (window.TrackMap3D.create()) so the Compare view's
// singleton map and this widget can coexist. Reads the shared page globals maintained by
// telemetry.js: currentTrackId, playerCarIndex, participantNames, participantLiveryColors.
(function () {
    'use strict';

    var map = null;            // TrackMap3D instance while the widget is on the dashboard
    var appliedTrackId = -2;   // trackId the map currently shows (-2 = nothing yet)
    var lastPositions = null;  // latest ReceiveCarPositions payload
    var followOptionsSig = ''; // participants signature the follow selector was built from

    function widgetHost() {
        return document.getElementById('trackMapHost');
    }

    function teardown() {
        if (map) { map.dispose(); map = null; }
        appliedTrackId = -2;
        followOptionsSig = '';
    }

    // (Re)binds the map to the current #trackMapHost. Called when the widget is added;
    // GridStack re-creates the DOM node each time, so a stale instance is disposed first.
    function initTrackMapWidget() {
        var host = widgetHost();
        if (!host || !window.TrackMap3D || !window.TrackMap3D.create) return;
        teardown();
        map = window.TrackMap3D.create();
        host.innerHTML = '';
        // Follow selector on; DOM overlay off — dominance data only exists in Compare.
        map.attach(host, { followSelector: true, showDom: false });
        applyTrack();
        if (lastPositions) applyPositions(lastPositions);
    }

    function applyTrack() {
        if (!map) return;
        var trackId = (typeof currentTrackId !== 'undefined') ? currentTrackId : -1;
        if (trackId < 0 || trackId === appliedTrackId) return;
        appliedTrackId = trackId;
        map.setData({ trackId: trackId, drivers: [] });
    }

    function applyPositions(positions) {
        lastPositions = positions;
        if (!map) return;
        // Widget was removed from the grid (its host left the DOM) — free the renderer.
        var host = widgetHost();
        if (!host || !host.isConnected) { teardown(); return; }
        applyTrack(); // session may have switched tracks since the last packet
        if (appliedTrackId < 0) return;

        var names = (typeof participantNames !== 'undefined') ? participantNames : [];
        var colors = (typeof participantLiveryColors !== 'undefined') ? participantLiveryColors : [];
        var player = (typeof playerCarIndex !== 'undefined') ? playerCarIndex : 0;
        // Per-car race position (LapData) and tyre compound (Car Status) for the name tags.
        var lapItems = (typeof lastLapDataPacket !== 'undefined' && lastLapDataPacket)
            ? lastLapDataPacket.lapDataItems : null;
        var statusItems = (typeof lastCarStatusItems !== 'undefined') ? lastCarStatusItems : null;
        var cars = [];
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            // Inactive slots stream as exact zeros; a real car is never at world origin.
            if (!p || (p[0] === 0 && p[1] === 0 && p[2] === 0)) continue;
            if (names.length && i >= names.length) continue;
            cars.push({
                idx: i,
                x: p[0], y: p[1], z: p[2],
                color: colors[i] || null,
                isPlayer: i === player,
                label: names[i] || '',
                position: (lapItems && lapItems[i]) ? lapItems[i].carPosition : null,
                tyre: (statusItems && statusItems[i]) ? statusItems[i].visualTyreCompound : null,
            });
        }
        map.setLiveCars(cars);
        applyMarshalZones();
        refreshFollowOptions(cars, names, player);
    }

    // Forwards the latest Session marshal zones (m_zoneStart + m_zoneFlag) to the map so it
    // can paint sector caution flags over the geometry. Cheap to call every position frame —
    // the map only rebuilds arcs when a flag changes shape.
    function applyMarshalZones() {
        if (!map) return;
        var sp = (typeof lastSessionPacket !== 'undefined') ? lastSessionPacket : null;
        map.setMarshalZones(sp && sp.marshalZones ? sp.marshalZones : []);
    }

    // Rebuilds the follow selector only when the participant line-up actually changes.
    function refreshFollowOptions(cars, names, player) {
        var sig = player + '|' + cars.map(function (c) { return c.idx + ':' + (names[c.idx] || ''); }).join(',');
        if (sig === followOptionsSig) return;
        followOptionsSig = sig;
        map.setFollowOptions(cars
            .filter(function (c) { return c.idx !== player; })
            .map(function (c) { return { value: c.idx, label: names[c.idx] || ('Car ' + c.idx) }; }));
    }

    window.initTrackMapWidget = initTrackMapWidget;

    // Single shared SignalR connection (see telemetry.js); handler is registered once and
    // simply drops data while the widget is not on the dashboard.
    if (typeof window.__f1TelemetryOnConnection === 'function') {
        window.__f1TelemetryOnConnection(function (connection) {
            connection.on('ReceiveCarPositions', applyPositions);
        });
    }
})();
