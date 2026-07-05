// 3D track map for the Telemetry Compare view. Renders the authored circuit centreline
// (from /data/track-geometry/{trackId}.json) as a ribbon at real elevation and real,
// per-point road/kerb width (matched from the game's own AI-gate track-limit data), plus
// the pit lane as a second, separate ribbon, with a connector line at each geometric
// fork/merge point. Adds sector-boundary markers and corner-number badges from the same
// data. Overlays each visible driver's racing line from Motion telemetry (world X/Y/Z),
// and keeps an orbit camera. Exposes a tiny imperative API so telemetryCompare.js can
// keep its existing drawTrackMap / updateMapMarkers call sites and hover bridge.
//
// World coordinates from the game splines match the UDP Motion worldPosition frame 1:1, so
// driver lines land on the ribbon with no transform. Motion.y (elevation) is used when the
// log carries it; older logs (y === null) fall back to the authored centreline elevation.
(function () {
    'use strict';
    var THREE = window.THREE;
    if (!THREE) return; // three.min.js failed to load — leave window.TrackMap3D undefined.

    var ROAD_HALF_WIDTH = 6.5;   // fallback half-width, metres, if a track ships no gate widths.
    var TUBE_RADIUS = 1.0;       // driver racing-line thickness, metres.
    var PATH_LIFT = 1.4;         // metres a racing line sits above the road surface.
    var ZONE_LIFT = 0.7;         // metres a DRS / Straight-Mode overlay sits above the road.
    var KERB_LIFT = 0.02;        // metres a kerb band sits above the road surface (avoid z-fighting).
    var DRS_COLOR = 0x00d700;    // DRS zones — green (matches --accent-green).
    var XMODE_COLOR = 0xff3fd8;  // Straight Mode (X-mode) — magenta.
    // Marshal-zone flag colours (Session m_zoneFlag): 2 = blue, 3 = yellow, 4 = red.
    // Green (1) / none (0/-1) are not drawn — only active caution flags are highlighted.
    var MARSHAL_FLAG_COLORS = { 2: 0x2f6bff, 3: 0xffd000, 4: 0xff2b2b };
    var MARSHAL_LIFT = 0.9;      // metres a marshal-flag overlay sits above the road.
    // Grey-box blockout palette: track/kerbs/pit lane are flat, unlit greys only — no
    // lighting-dependent shading to misread as geometry (the DRS/SM/DOM overlays and
    // driver lines below keep their functional colours; those are meaningful, not decor).
    var MAIN_ROAD_COLOR = 0x6b7078;
    var PIT_ROAD_COLOR = 0x53575e;    // darker — visually separates pit lane from track.
    var PIT_LIFT = 0.08;              // metres the pit ribbon floats above the road (anti z-fight).
    var KERB_COLOR = 0xaab0b8;        // single flat grey band, lighter than the road.
    var SECTOR_LINE_COLOR = 0xffffff;
    var SECTOR_LINE_LIFT = 0.06;
    var CORNER_LABEL_LIFT = 4;        // metres a corner number badge floats above the road.
    var CORNER_LABEL_MARGIN = 6;      // metres beyond the track edge a corner badge sits.
    var CORNER_LABEL_SCALE = 6;       // world-space size (metres) of a corner number badge.
    var PIT_MERGE_COLOR = 0xaab2c0;
    var EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45'
        + ' 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16'
        + ' 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    var FOLLOW_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"'
        + ' stroke="currentColor" stroke-width="2" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="4"/>'
        + '<line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/>'
        + '<line x1="20" y1="12" x2="23" y2="12"/></svg>';
    var TAG_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><path d="M4 6h9l7 6-7 6H4z"/><circle cx="8.5" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>';
    var TYRE_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="9"/>'
        + '<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central"'
        + ' font-size="12" font-weight="700" font-family="sans-serif"'
        + ' fill="currentColor" stroke="none">C</text></svg>';
    var FLAG_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><path d="M4 21V4c4-2 8 2 12 0v10c-4 2-8-2-12 0"/><line x1="4" y1="21" x2="4" y2="3"/></svg>';
    var VIEW3D_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>';
    var VIEWTOP_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        + ' aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/></svg>';

    // Tyre badge letter + colour by m_visualTyreCompound (Car Status). Covers F1 modern
    // (16-22), classic (9/10) and F2 (15,19-22). Hard is white; letters match the broadcast
    // convention (S / M / H / SS / I / W). Unknown compounds render no badge.
    var TYRE_BADGE = {
        16: ['S', '#ff3333'], 20: ['S', '#ff3333'],
        17: ['M', '#ffd000'], 21: ['M', '#ffd000'],
        18: ['H', '#eaeaea'], 22: ['H', '#eaeaea'],
        19: ['SS', '#b04bd6'],
        7: ['I', '#3fb549'], 8: ['W', '#2f9fe0'],
        9: ['D', '#eaeaea'], 10: ['W', '#2f9fe0'], 15: ['W', '#2f9fe0'],
    };

    var geomCache = {};          // trackId -> Promise<geometry json | null> (shared by all instances)

    function fetchGeometry(trackId) {
        if (geomCache[trackId]) return geomCache[trackId];
        var p = fetch('/data/track-geometry/' + trackId + '.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
        geomCache[trackId] = p;
        return p;
    }

    function disposeGroup(group) {
        if (!group) return;
        for (var i = group.children.length - 1; i >= 0; i--) {
            var o = group.children[i];
            // Ribbons nest sub-groups (road / kerb bands / edge lines), so dispose the
            // whole subtree's geometry+material+texture, not just this direct child.
            o.traverse(function (n) {
                if (n.geometry) n.geometry.dispose();
                if (n.material) {
                    if (n.material.map) n.material.map.dispose(); // e.g. corner-label canvas textures
                    n.material.dispose();
                }
            });
            group.remove(o);
        }
    }

    // World (metres) -> centred scene coordinates, true 1:1 scale. Y is up (elevation).
    function toScene(c, x, y, z) {
        return new THREE.Vector3(x - c.x, y - c.y, z - c.z);
    }

    // Nearest authored-centreline elevation for an (x,z) — used only for logs without Motion.y.
    function elevationAt(geom, x, z) {
        var pts = geom.points, best = pts[0][1], bestD2 = Infinity;
        for (var i = 0; i < pts.length; i++) {
            var dx = pts[i][0] - x, dz = pts[i][2] - z;
            var d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = pts[i][1]; }
        }
        return best;
    }

    // Ground-plane perpendicular (unit vector) to the centreline's local tangent at index i.
    // `closed` wraps at the ends (main track loop); an open path (pit lane) clamps instead.
    function perpAt(pts, i, closed) {
        var n = pts.length;
        var prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
        var next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
        var tx = next[0] - prev[0], tz = next[2] - prev[2];
        var len = Math.hypot(tx, tz) || 1;
        return { x: -tz / len, z: tx / len };
    }

    function fallbackWidths(pts) {
        return pts.map(function () { return [ROAD_HALF_WIDTH, ROAD_HALF_WIDTH]; });
    }

    // bank[i] is dy per metre of lateral (perpendicular) offset — tan of the cross-track
    // bank angle, positive towards the ribbon's "left" (+perp) side. 0 for flat tracks/data.
    function fallbackBank(pts) {
        return pts.map(function () { return 0; });
    }

    // The paved road surface, at each point's own (possibly asymmetric) half-width, tilted
    // across its width by that point's banking slope.
    function buildRoadMesh(pts, widths, bank, center, closed, color) {
        var n = pts.length;
        var positions = new Float32Array(n * 2 * 3);
        for (var i = 0; i < n; i++) {
            var perp = perpAt(pts, i, closed), c = pts[i], w = widths[i], k = bank[i];
            var l = toScene(center, c[0] + perp.x * w[0], c[1] + k * w[0], c[2] + perp.z * w[0]);
            var r = toScene(center, c[0] - perp.x * w[1], c[1] - k * w[1], c[2] - perp.z * w[1]);
            positions[i * 6] = l.x; positions[i * 6 + 1] = l.y; positions[i * 6 + 2] = l.z;
            positions[i * 6 + 3] = r.x; positions[i * 6 + 4] = r.y; positions[i * 6 + 5] = r.z;
        }
        var segCount = closed ? n : n - 1;
        var indices = [];
        for (var s = 0; s < segCount; s++) {
            var a = s * 2, b = s * 2 + 1, ni = closed ? (s + 1) % n : s + 1;
            indices.push(a, b, ni * 2 + 1, a, ni * 2 + 1, ni * 2);
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setIndex(indices);
        // Flat, unlit grey-box material — no per-vertex-normal lighting to misread as a
        // geometry defect on a ribbon whose width/banking already vary continuously.
        var mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
        return new THREE.Mesh(g, mat);
    }

    // Kerb bands: the strip between the road edge and the track-limit edge on each side,
    // a single flat grey (no stripes) so it reads as a kerb without lighting or pattern.
    function buildKerbMesh(pts, roadWidth, kerbWidth, bank, center, closed) {
        var n = pts.length;
        var group = new THREE.Group();
        var mat = new THREE.MeshBasicMaterial({ color: KERB_COLOR, side: THREE.DoubleSide });
        [1, -1].forEach(function (side) {
            var wi = side > 0 ? 0 : 1;
            var positions = new Float32Array(n * 2 * 3);
            var any = false;
            for (var i = 0; i < n; i++) {
                var perp = perpAt(pts, i, closed), c = pts[i], k = bank[i];
                var inner = roadWidth[i][wi], outer = kerbWidth[i][wi];
                if (outer > inner + 0.05) any = true;
                var pIn = toScene(center, c[0] + side * perp.x * inner, c[1] + side * k * inner, c[2] + side * perp.z * inner);
                var pOut = toScene(center, c[0] + side * perp.x * outer, c[1] + side * k * outer, c[2] + side * perp.z * outer);
                pIn.y += KERB_LIFT; pOut.y += KERB_LIFT;
                positions[i * 6] = pIn.x; positions[i * 6 + 1] = pIn.y; positions[i * 6 + 2] = pIn.z;
                positions[i * 6 + 3] = pOut.x; positions[i * 6 + 4] = pOut.y; positions[i * 6 + 5] = pOut.z;
            }
            if (!any) return;
            var segCount = closed ? n : n - 1;
            var indices = [];
            for (var s = 0; s < segCount; s++) {
                var a = s * 2, b = s * 2 + 1, ni = closed ? (s + 1) % n : s + 1;
                indices.push(a, b, ni * 2 + 1, a, ni * 2 + 1, ni * 2);
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            g.setIndex(indices);
            group.add(new THREE.Mesh(g, mat));
        });
        return group;
    }

    // Thin outline lines along the outer edge (kerb limit, or road edge if no kerb data)
    // so the track shape stays legible head-on.
    function buildEdgeLines(pts, outerWidth, bank, center, closed) {
        var n = pts.length;
        var group = new THREE.Group();
        [1, -1].forEach(function (side) {
            var wi = side > 0 ? 0 : 1;
            var linePts = [];
            for (var i = 0; i < n; i++) {
                var perp = perpAt(pts, i, closed), c = pts[i], w = outerWidth[i][wi], k = bank[i];
                linePts.push(toScene(center, c[0] + side * perp.x * w, c[1] + side * k * w, c[2] + side * perp.z * w));
            }
            if (closed) linePts.push(linePts[0]);
            var mat = new THREE.LineBasicMaterial({ color: 0xaab2c0, transparent: true, opacity: 0.5 });
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), mat));
        });
        return group;
    }

    // Full ribbon for one centreline (main track, closed loop, or pit lane, open path):
    // road surface + kerb bands + outline. `roadWidth`/`kerbWidth` are per-point [left,right]
    // half-widths in metres, `bank` is per-point cross-track slope — all matched from the
    // game's own AI-gate track-limit / cross-section data.
    function buildRibbon(pts, roadWidth, kerbWidth, bank, center, closed, roadColor) {
        if (!pts || pts.length < 2) return new THREE.Group();
        roadWidth = roadWidth && roadWidth.length === pts.length ? roadWidth : fallbackWidths(pts);
        kerbWidth = kerbWidth && kerbWidth.length === pts.length ? kerbWidth : roadWidth;
        bank = bank && bank.length === pts.length ? bank : fallbackBank(pts);
        var group = new THREE.Group();
        group.add(buildRoadMesh(pts, roadWidth, bank, center, closed, roadColor));
        group.add(buildKerbMesh(pts, roadWidth, kerbWidth, bank, center, closed));
        group.add(buildEdgeLines(pts, kerbWidth, bank, center, closed));
        return group;
    }

    function fracToIndex(n, frac) {
        return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    }

    // A short marker line spanning the road at one sector boundary (start of sector 2 / 3).
    function buildSectorMarkers(geom, center) {
        var group = new THREE.Group();
        var pts = geom.points, n = pts.length;
        if (!n) return group;
        var roadWidth = geom.roadWidth && geom.roadWidth.length === n ? geom.roadWidth : fallbackWidths(pts);
        var bank = geom.bank && geom.bank.length === n ? geom.bank : fallbackBank(pts);
        var mat = new THREE.LineBasicMaterial({ color: SECTOR_LINE_COLOR, transparent: true, opacity: 0.85 });
        (geom.sectors || []).forEach(function (s) {
            if (!s) return;
            var i = fracToIndex(n, s[0]);
            var perp = perpAt(pts, i, true), c = pts[i], w = roadWidth[i], k = bank[i];
            var l = toScene(center, c[0] + perp.x * w[0], c[1] + k * w[0], c[2] + perp.z * w[0]);
            var r = toScene(center, c[0] - perp.x * w[1], c[1] - k * w[1], c[2] - perp.z * w[1]);
            l.y += SECTOR_LINE_LIFT; r.y += SECTOR_LINE_LIFT;
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([l, r]), mat));
        });
        return group;
    }

    // A small round billboard sprite with a number, drawn via canvas (no texture asset needed).
    function makeBadgeSprite(text) {
        var canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(18,20,26,0.8)';
        ctx.beginPath(); ctx.arc(32, 32, 29, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e8e8ec'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#e8e8ec';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 35);
        var tex = new THREE.CanvasTexture(canvas);
        var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        return new THREE.Sprite(mat);
    }

    // Corner-number badges, floated just outside the track edge at each corner's apex.
    function buildCornerLabels(geom, center) {
        var group = new THREE.Group();
        var pts = geom.points, n = pts.length;
        if (!n) return group;
        var roadWidth = geom.roadWidth && geom.roadWidth.length === n ? geom.roadWidth : fallbackWidths(pts);
        var bank = geom.bank && geom.bank.length === n ? geom.bank : fallbackBank(pts);
        (geom.corners || []).forEach(function (cn) {
            var i = fracToIndex(n, cn.at);
            var perp = perpAt(pts, i, true), c = pts[i], w = roadWidth[i], k = bank[i];
            var off = Math.max(w[0], w[1]) + CORNER_LABEL_MARGIN;
            var p = toScene(center, c[0] + perp.x * off, c[1] + k * off + CORNER_LABEL_LIFT, c[2] + perp.z * off);
            var spr = makeBadgeSprite(String(cn.n));
            spr.position.copy(p);
            spr.scale.set(CORNER_LABEL_SCALE, CORNER_LABEL_SCALE, 1);
            group.add(spr);
        });
        return group;
    }

    // Thin connector from the main straight to the pit lane's own first/last knot, at the
    // lap-fraction the pit lane geometrically forks off / rejoins (from the converter's
    // nearest-point match — there's no explicit "join here" marker in the game data).
    function buildPitMergeLines(geom, center) {
        var group = new THREE.Group();
        var pl = geom.pitLane;
        if (!pl || !pl.mergeAt || !pl.points || pl.points.length < 2) return group;
        var pts = geom.points, n = pts.length;
        if (!n) return group;
        var mat = new THREE.LineBasicMaterial({ color: PIT_MERGE_COLOR, transparent: true, opacity: 0.6 });
        [[pl.mergeAt[0], pl.points[0]], [pl.mergeAt[1], pl.points[pl.points.length - 1]]].forEach(function (pair) {
            var i = fracToIndex(n, pair[0]);
            var a = toScene(center, pts[i][0], pts[i][1], pts[i][2]);
            var b = toScene(center, pair[1][0], pair[1][1], pair[1][2]);
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat));
        });
        return group;
    }

    // A translucent overlay ribbon over one [start,end] lap-fraction arc (DRS / X-mode zone).
    // Ranges are pre-split so they never wrap the start/finish line.
    function buildZoneArc(geom, center, s, e, color, opacity, lift) {
        var pts = geom.points, n = pts.length;
        var roadWidth = geom.roadWidth && geom.roadWidth.length === n ? geom.roadWidth : fallbackWidths(pts);
        var bank = geom.bank && geom.bank.length === n ? geom.bank : fallbackBank(pts);
        var lz = lift == null ? ZONE_LIFT : lift;
        var i0 = Math.max(0, Math.min(n - 1, Math.round(s * (n - 1))));
        var i1 = Math.max(0, Math.min(n - 1, Math.round(e * (n - 1))));
        if (i1 <= i0) return null;
        var count = i1 - i0 + 1;
        var positions = new Float32Array(count * 2 * 3);
        for (var k = 0; k < count; k++) {
            var i = i0 + k;
            var perp = perpAt(pts, i, true), c = pts[i], w = roadWidth[i], bk = bank[i];
            var l = toScene(center, c[0] + perp.x * w[0], c[1] + bk * w[0], c[2] + perp.z * w[0]);
            var r = toScene(center, c[0] - perp.x * w[1], c[1] - bk * w[1], c[2] - perp.z * w[1]);
            l.y += lz; r.y += lz;
            positions[k * 6] = l.x; positions[k * 6 + 1] = l.y; positions[k * 6 + 2] = l.z;
            positions[k * 6 + 3] = r.x; positions[k * 6 + 4] = r.y; positions[k * 6 + 5] = r.z;
        }
        var indices = [];
        for (var sgm = 0; sgm < count - 1; sgm++) {
            var a = sgm * 2, b = sgm * 2 + 1, nx = (sgm + 1) * 2, ny = (sgm + 1) * 2 + 1;
            indices.push(a, b, ny, a, ny, nx);
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setIndex(indices);
        return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: opacity == null ? 0.45 : opacity,
            side: THREE.DoubleSide, depthWrite: false,
        }));
    }

    function buildZones(group, zones, geom, center, color) {
        disposeGroup(group);
        (zones || []).forEach(function (z) {
            var m = buildZoneArc(geom, center, z[0], z[1], color);
            if (m) group.add(m);
        });
    }

    // Track dominance: opaque coloured arcs along the lap, each in the fastest driver's colour
    // for that stretch. Runs are pre-merged [start,end] lap fractions with a colour.
    function buildDominance(group, runs, geom, center) {
        disposeGroup(group);
        (runs || []).forEach(function (r) {
            var m = buildZoneArc(geom, center, r.start, r.end, r.color, 0.85);
            if (m) group.add(m);
        });
    }

    // One independent map instance (own renderer/scene/camera). The Compare view uses the
    // default singleton `window.TrackMap3D`; the live Track Map widget creates its own via
    // `window.TrackMap3D.create()` so both can exist on the page at once.
    function createTrackMap() {
    var R = null;                // live runtime (renderer/scene/camera/groups/state)

    var OVERLAY_MODES = ['drs', 'xmode', 'dom', 'none'];

    function applyOverlay() {
        if (!R) return;
        R.drsGroup.visible = R.overlayMode === 'drs';
        R.xmodeGroup.visible = R.overlayMode === 'xmode';
        R.domGroup.visible = R.overlayMode === 'dom';
        if (R.caption) {
            // Only the overlay segment: the view segment (data-view) buttons have their
            // own active state — matching on undefined dataset.ov used to light up both.
            R.caption.querySelectorAll('.tc-map3d-seg button[data-ov]').forEach(function (b) {
                b.classList.toggle('active', b.dataset.ov === R.overlayMode);
            });
        }
    }

    function setOverlay(mode) {
        if (!R || OVERLAY_MODES.indexOf(mode) < 0) return;
        R.overlayMode = mode;
        try { localStorage.setItem('tcMap3dOverlay', mode); } catch (e) { /* ignore */ }
        applyOverlay();
    }

    function applyFollow() {
        if (!R || !R.caption) return;
        var b = R.caption.querySelector('#tcMapFollow');
        if (b) b.classList.toggle('active', !!R.follow);
    }
    function setFollow(on) {
        if (!R) return;
        R.follow = !!on;
        try { localStorage.setItem('tcMap3dFollow', on ? '1' : '0'); } catch (e) { /* ignore */ }
        applyFollow();
    }

    function applyTagsVisibility() {
        if (!R) return;
        var btn = R.caption && R.caption.querySelector('#tcMapTags');
        if (btn) btn.classList.toggle('active', !R.tagsHidden);
        R.liveGroup.children.forEach(function (mk) {
            var tag = mk.children[0];
            if (tag) tag.visible = !!tag.userData.hasLabel && !R.tagsHidden;
        });
    }
    function setTagsHidden(hidden) {
        if (!R) return;
        R.tagsHidden = !!hidden;
        try { localStorage.setItem('tcMap3dTagsHidden', hidden ? '1' : '0'); } catch (e) { /* ignore */ }
        applyTagsVisibility();
    }

    function applyTyresVisibility() {
        if (!R) return;
        var btn = R.caption && R.caption.querySelector('#tcMapTyres');
        if (btn) btn.classList.toggle('active', !R.tyresHidden);
    }
    function setTyresHidden(hidden) {
        if (!R) return;
        R.tyresHidden = !!hidden;
        try { localStorage.setItem('tcMap3dTyresHidden', hidden ? '1' : '0'); } catch (e) { /* ignore */ }
        applyTyresVisibility();
        // Tag textures embed the tyre badge — rebuild them at the new visibility.
        if (R.pendingLiveCars) setLiveCars(R.pendingLiveCars);
    }

    function applyMarshalVisibility() {
        if (!R) return;
        R.marshalGroup.visible = !R.marshalHidden;
        var btn = R.caption && R.caption.querySelector('#tcMapMarshal');
        if (btn) btn.classList.toggle('active', !R.marshalHidden);
    }
    function setMarshalHidden(hidden) {
        if (!R) return;
        R.marshalHidden = !!hidden;
        try { localStorage.setItem('tcMap3dMarshalHidden', hidden ? '1' : '0'); } catch (e) { /* ignore */ }
        applyMarshalVisibility();
    }

    function buildDrivers(drivers, geom, center) {
        disposeGroup(R.driverGroup);
        disposeGroup(R.markerGroup);
        R.markers = [];
        R.refScenePts = null;
        R.refMotion = null;
        var fPlayer = null, fRef = null, fFirst = null;

        (drivers || []).forEach(function (drv) {
            var motion = drv.motion;
            if (!motion || motion.length < 2) return;
            var col = new THREE.Color(drv.color || '#9aa0a6');
            var scenePts = motion.map(function (m) {
                var y = (m.y != null) ? m.y : elevationAt(geom, m.x, m.z);
                var v = toScene(center, m.x, y, m.z);
                v.y += PATH_LIFT;
                return v;
            });
            var curve = new THREE.CatmullRomCurve3(scenePts, false);
            var tube = new THREE.TubeGeometry(curve, Math.min(scenePts.length * 2, 4000), TUBE_RADIUS, 6, false);
            R.driverGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: col })));

            var rad = drv.isPlayer ? 4.2 : 3.2;
            var marker = new THREE.Mesh(
                new THREE.SphereGeometry(rad, 16, 12),
                new THREE.MeshBasicMaterial({ color: col }));
            marker.position.copy(scenePts[0]);
            R.markerGroup.add(marker);
            R.markers.push({ mesh: marker, motion: motion, scenePts: scenePts, isRef: !!drv.isRef });
            if (!fFirst) fFirst = marker;
            if (drv.isRef) fRef = marker;
            if (drv.isPlayer) fPlayer = marker;

            // The reference lap drives hover-distance mapping (hover anywhere -> nearest ref point).
            if (drv.isRef || !R.refScenePts) { R.refScenePts = scenePts; R.refMotion = motion; }
        });
        // Camera-follow target: prefer the player's car, else the reference, else the first.
        R.followMarker = fPlayer || fRef || fFirst;
    }

    function fitCamera(geom, center) {
        var b = geom.bounds;
        var radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 || 200;
        R.trackRadius = radius;
        R.controls.target.set(0, 0, 0);
        R.camera.near = Math.max(1, radius / 100);
        R.camera.far = radius * 30;
        R.controls.minDistance = radius * 0.1;
        R.controls.maxDistance = radius * 6;
        setView('3d');
    }

    // Quick camera-angle presets, both framing the whole circuit at the current track's
    // radius (set by fitCamera). '3d' matches the initial load angle; 'top' looks straight
    // down — a tiny Z offset keeps OrbitControls' spherical coordinates from degenerating
    // at the pure-vertical pole. Snaps the view once; free orbiting afterwards is unaffected.
    function applyViewButtons() {
        if (!R || !R.caption) return;
        R.caption.querySelectorAll('button[data-view]').forEach(function (b) {
            b.classList.toggle('active', b.dataset.view === R.viewMode);
        });
    }

    function setView(mode) {
        if (!R || !R.trackRadius) return;
        R.viewMode = mode === 'top' ? 'top' : '3d';
        applyViewButtons();
        var radius = R.trackRadius;
        // Preserve the user's current zoom (camera-to-target distance) when just swapping
        // the viewing angle; only fall back to the framing default on the very first call
        // (fitCamera), when the camera hasn't been positioned yet.
        var distance = R.camera.position.distanceTo(R.controls.target) || radius * 2.4;
        R.controls.target.set(0, 0, 0);
        if (mode === 'top') {
            R.camera.position.set(0, distance, distance * 0.004);
        } else {
            // Same tilt ratio as the old fixed preset (1.7 : 1.7), scaled to the current distance.
            var k = distance / Math.SQRT2;
            R.camera.position.set(0, k, k);
        }
        R.camera.updateProjectionMatrix();
        R.controls.update();
    }

    function resize() {
        if (!R) return;
        var w = R.wrap.clientWidth || 1, h = R.wrap.clientHeight || 1;
        R.renderer.setSize(w, h, false);
        R.camera.aspect = w / h;
        R.camera.updateProjectionMatrix();
    }

    function pointerMove(e) {
        if (!R || !R.onHover || !R.refScenePts) return;
        var rect = R.renderer.domElement.getBoundingClientRect();
        R.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        R.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        R.ray.setFromCamera(R.pointer, R.camera);
        var hits = R.ray.intersectObjects(
            R.trackGroup.children.concat(R.pitGroup.children, R.driverGroup.children), false);
        if (!hits.length) return;
        var pt = hits[0].point, best = 0, bestD2 = Infinity;
        for (var i = 0; i < R.refScenePts.length; i++) {
            var d2 = R.refScenePts[i].distanceToSquared(pt);
            if (d2 < bestD2) { bestD2 = d2; best = i; }
        }
        var dist = R.refMotion[best].d;
        if (Math.abs(dist - R.lastHoverD) > 0.5) { R.lastHoverD = dist; R.onHover(dist); }
    }

    function attach(host, attachOpts) {
        if (R && R.host === host) { resize(); return; }
        dispose();
        // opts: { followSelector: true } adds a driver <select> that picks the follow
        // target; { showDom: false } hides the DOM overlay button (the live widget has no
        // dominance data — that mode only means something in the Compare view).
        var options = attachOpts || {};
        var showDom = options.showDom !== false;
        host.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'tc-map3d';
        var caption = document.createElement('div');
        caption.className = 'tc-map3d-caption';
        caption.innerHTML = '<span class="tc-map3d-hint">drag · scroll to zoom</span>'
            + '<span class="tc-map3d-ctrls">'
            + (options.followSelector
                ? '<select class="tc-map3d-follow-sel" id="tcMapFollowSel" title="Car to follow"></select>'
                : '')
            + '<button type="button" class="tc-map3d-follow" id="tcMapFollow" title="Camera follows the car during playback" aria-label="Follow camera">' + FOLLOW_SVG + '</button>'
            + (options.liveTags !== false
                ? '<button type="button" class="tc-map3d-follow" id="tcMapTags" title="Show/hide driver name tags" aria-label="Toggle name tags">' + TAG_SVG + '</button>'
                + '<button type="button" class="tc-map3d-follow" id="tcMapTyres" title="Show/hide tyre compound on tags" aria-label="Toggle tyre badges">' + TYRE_SVG + '</button>'
                + '<button type="button" class="tc-map3d-follow" id="tcMapMarshal" title="Show/hide sector marshal flags" aria-label="Toggle marshal flags">' + FLAG_SVG + '</button>'
                : '')
            + '<span class="tc-map3d-seg" role="group" aria-label="Camera view">'
            + '<button type="button" data-view="3d" title="Angled 3D view">' + VIEW3D_SVG + '</button>'
            + '<button type="button" data-view="top" title="Top-down view">' + VIEWTOP_SVG + '</button>'
            + '</span>'
            + '<span class="tc-map3d-seg" role="group" aria-label="Track overlay">'
            + '<button type="button" data-ov="drs" title="DRS zones">DRS</button>'
            + '<button type="button" data-ov="xmode" title="Straight Mode (X-mode)">SM</button>'
            + (showDom ? '<button type="button" data-ov="dom" title="Track dominance — fastest driver per segment">DOM</button>' : '')
            + '<button type="button" data-ov="none" title="Hide overlay" aria-label="Hide overlay">' + EYE_OFF_SVG + '</button>'
            + '</span>'
            + '</span>';
        host.appendChild(wrap);
        host.appendChild(caption);

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        wrap.appendChild(renderer.domElement);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(50, 1, 1, 100000);
        var controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.12;
        // Free cam: orbit (drag) + zoom (wheel) + pan. Right-drag or two-finger pans;
        // screen-space panning keeps the drag in the view plane regardless of tilt, and
        // the arrow keys nudge the target so the whole circuit (incl. pit) is reachable.
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.panSpeed = 1.0;
        controls.keyPanSpeed = 24;
        controls.listenToKeyEvents(window);

        var trackGroup = new THREE.Group();
        var pitGroup = new THREE.Group();
        var sectorGroup = new THREE.Group();
        var cornerGroup = new THREE.Group();
        var pitMergeGroup = new THREE.Group();
        var driverGroup = new THREE.Group();
        var markerGroup = new THREE.Group();
        var liveGroup = new THREE.Group();
        var drsGroup = new THREE.Group(); drsGroup.visible = false;
        var xmodeGroup = new THREE.Group(); xmodeGroup.visible = false;
        var domGroup = new THREE.Group(); domGroup.visible = false;
        // Marshal (sector) flags are live safety info — always visible, independent of the
        // DRS / X-mode / DOM overlay selector.
        var marshalGroup = new THREE.Group();
        scene.add(trackGroup); scene.add(pitGroup); scene.add(driverGroup); scene.add(markerGroup);
        scene.add(liveGroup);
        scene.add(sectorGroup); scene.add(cornerGroup); scene.add(pitMergeGroup);
        scene.add(drsGroup); scene.add(xmodeGroup); scene.add(domGroup); scene.add(marshalGroup);

        R = {
            host: host, wrap: wrap, renderer: renderer, scene: scene, camera: camera,
            controls: controls, trackGroup: trackGroup, pitGroup: pitGroup, driverGroup: driverGroup,
            sectorGroup: sectorGroup, cornerGroup: cornerGroup, pitMergeGroup: pitMergeGroup,
            markerGroup: markerGroup, liveGroup: liveGroup,
            drsGroup: drsGroup, xmodeGroup: xmodeGroup, domGroup: domGroup,
            marshalGroup: marshalGroup, geom: null, pendingMarshalZones: null,
            pendingLiveCars: null,
            // Live-car interpolation: markers ease from their previous sample to the newest
            // over the measured broadcast interval, so motion is smooth between ~10 Hz packets.
            lastCarsTime: 0, carTweenStart: 0, carTweenDur: 0,
            caption: caption, markers: [], refScenePts: null, refMotion: null,
            center: null, fitTrackId: null, dataToken: 0, lastHoverD: -Infinity,
            onHover: null, onHoverClear: null, ray: new THREE.Raycaster(),
            pointer: new THREE.Vector2(), raf: 0, syncMode: 'dist',
            // Sanitize the stored value: an old bug persisted the string "undefined" when
            // a view button routed through setOverlay — treat anything unknown as 'none'.
            overlayMode: (function () {
                try {
                    var v = localStorage.getItem('tcMap3dOverlay');
                    return OVERLAY_MODES.indexOf(v) >= 0 ? v : 'none';
                } catch (e) { return 'none'; }
            })(),
            viewMode: '3d',
            follow: (function () { try { return localStorage.getItem('tcMap3dFollow') === '1'; } catch (e) { return false; } })(),
            followMarker: null,
            followCarIdx: -1,   // live-cars wire index to follow; -1 = the player's car
            tagsHidden: (function () { try { return localStorage.getItem('tcMap3dTagsHidden') === '1'; } catch (e) { return false; } })(),
            tyresHidden: (function () { try { return localStorage.getItem('tcMap3dTyresHidden') === '1'; } catch (e) { return false; } })(),
            marshalHidden: (function () { try { return localStorage.getItem('tcMap3dMarshalHidden') === '1'; } catch (e) { return false; } })(),
            trackRadius: 0,
        };
        // A stored 'dom' overlay can't be re-selected (or escaped) when its button is hidden.
        if (!showDom && R.overlayMode === 'dom') R.overlayMode = 'none';

        var ro = new ResizeObserver(resize); ro.observe(wrap); R.ro = ro;
        renderer.domElement.addEventListener('pointermove', pointerMove);
        renderer.domElement.addEventListener('pointerleave', function () {
            R.lastHoverD = -Infinity;
            if (R.onHoverClear) R.onHoverClear();
        });
        // Overlay wiring is scoped to [data-ov] — binding every seg button used to fire
        // setOverlay(undefined) on the view buttons, wiping the overlay selection.
        caption.querySelectorAll('.tc-map3d-seg button[data-ov]').forEach(function (btn) {
            btn.addEventListener('click', function () { setOverlay(btn.dataset.ov); });
        });
        applyOverlay();
        caption.querySelectorAll('[data-view]').forEach(function (btn) {
            btn.addEventListener('click', function () { setView(btn.dataset.view); });
        });
        var followBtn = caption.querySelector('#tcMapFollow');
        if (followBtn) followBtn.addEventListener('click', function () { setFollow(!R.follow); });
        var tagsBtn = caption.querySelector('#tcMapTags');
        if (tagsBtn) tagsBtn.addEventListener('click', function () { setTagsHidden(!R.tagsHidden); });
        applyTagsVisibility();
        var tyresBtn = caption.querySelector('#tcMapTyres');
        if (tyresBtn) tyresBtn.addEventListener('click', function () { setTyresHidden(!R.tyresHidden); });
        applyTyresVisibility();
        var marshalBtn = caption.querySelector('#tcMapMarshal');
        if (marshalBtn) marshalBtn.addEventListener('click', function () { setMarshalHidden(!R.marshalHidden); });
        applyMarshalVisibility();
        var followSel = caption.querySelector('#tcMapFollowSel');
        if (followSel) {
            followSel.addEventListener('change', function () {
                if (!R) return;
                R.followCarIdx = parseInt(followSel.value, 10);
                if (isNaN(R.followCarIdx)) R.followCarIdx = -1;
                setFollow(true); // picking a car implies "follow it"
                if (R.pendingLiveCars) setLiveCars(R.pendingLiveCars); // retarget immediately
            });
        }
        applyFollow();

        resize();
        (function loop() {
            if (!R) return;
            R.raf = requestAnimationFrame(loop);
            // Live-car smoothing: linearly interpolate each marker from its previous sample to
            // the newest one across the broadcast interval. At t=1 the marker sits exactly on a
            // real sample, so the on-track path stays accurate — only ~one interval of latency
            // is added, trading a small delay for smooth motion instead of 10 Hz snapping.
            if (R.carTweenDur) {
                var t = Math.min(1, (performance.now() - R.carTweenStart) / R.carTweenDur);
                var kids = R.liveGroup.children;
                for (var ci = 0; ci < kids.length; ci++) {
                    var u = kids[ci].userData;
                    if (u.toPos) kids[ci].position.lerpVectors(u.fromPos, u.toPos, t);
                }
            }
            // Camera follow: ease the orbit target onto the followed car each frame and shift
            // the camera by the same delta, so the user's chosen angle/zoom is preserved.
            if (R.follow && R.followMarker) {
                var offset = R.camera.position.clone().sub(R.controls.target);
                R.controls.target.lerp(R.followMarker.position, 0.12);
                R.camera.position.copy(R.controls.target).add(offset);
            }
            R.controls.update();
            R.renderer.render(R.scene, R.camera);
        })();
    }

    function setData(opts) {
        if (!R) return;
        R.onHover = opts.onHover || null;
        R.onHoverClear = opts.onHoverClear || null;
        var trackId = opts.trackId;
        var token = ++R.dataToken;
        fetchGeometry(trackId).then(function (geom) {
            if (!R || token !== R.dataToken) return; // superseded by a newer setData
            if (!geom) {
                disposeGroup(R.trackGroup); disposeGroup(R.pitGroup);
                disposeGroup(R.sectorGroup); disposeGroup(R.cornerGroup); disposeGroup(R.pitMergeGroup);
                disposeGroup(R.driverGroup); disposeGroup(R.markerGroup);
                return;
            }
            var b = geom.bounds;
            var center = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
            R.center = center;
            R.geom = geom;   // kept for live overlays (marshal flags) rebuilt after load
            if (R.fitTrackId !== trackId) {
                disposeGroup(R.trackGroup);
                disposeGroup(R.pitGroup);
                disposeGroup(R.sectorGroup);
                disposeGroup(R.cornerGroup);
                disposeGroup(R.pitMergeGroup);
                R.trackGroup.add(buildRibbon(
                    geom.points, geom.roadWidth, geom.kerbWidth, geom.bank, center, true, MAIN_ROAD_COLOR));
                if (geom.pitLane && geom.pitLane.points && geom.pitLane.points.length > 1) {
                    var pitRibbon = buildRibbon(
                        geom.pitLane.points, geom.pitLane.roadWidth, geom.pitLane.kerbWidth,
                        geom.pitLane.bank, center, false, PIT_ROAD_COLOR);
                    // Sit the pit lane a few cm above the road so where its entry/exit ramps
                    // overlap the main straight the pit draws cleanly on top instead of
                    // z-fighting into a flicker of dark patches.
                    pitRibbon.position.y += PIT_LIFT;
                    R.pitGroup.add(pitRibbon);
                }
                R.sectorGroup.add(buildSectorMarkers(geom, center));
                R.cornerGroup.add(buildCornerLabels(geom, center));
                R.pitMergeGroup.add(buildPitMergeLines(geom, center));
                buildZones(R.drsGroup, geom.drsZones, geom, center, DRS_COLOR);
                buildZones(R.xmodeGroup, geom.xModeZones, geom, center, XMODE_COLOR);
                fitCamera(geom, center);
                R.fitTrackId = trackId;
                // Marshal arcs are baked against `center`; force a rebuild on the new track.
                R.marshalSig = null;
                disposeGroup(R.marshalGroup);
            }
            buildDrivers(opts.drivers, geom, center);
            buildDominance(R.domGroup, opts.dominance, geom, center);
            applyOverlay();
            // Live overlays received before the geometry finished loading now have geom.
            if (R.pendingMarshalZones) setMarshalZones(R.pendingMarshalZones);
            if (R.pendingLiveCars) setLiveCars(R.pendingLiveCars);
        });
    }

    function nearestIndex(arr, key, val) {
        var best = 0, bestDiff = Math.abs(arr[0][key] - val);
        for (var i = 1; i < arr.length; i++) {
            var diff = Math.abs(arr[i][key] - val);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        return best;
    }

    // 'dist' — every marker at the same track distance (compare technique at one point).
    // 'time' — the reference marker rides the scrubber distance, every other car sits where it
    // actually was at that same elapsed lap time, so the live on-track gap is visible.
    function setSyncMode(mode) { if (R) R.syncMode = mode === 'time' ? 'time' : 'dist'; }

    function setMarkerDistance(targetD) {
        if (!R || !R.markers) return;
        var refT = null;
        if (R.syncMode === 'time' && R.refMotion && R.refMotion.length) {
            refT = R.refMotion[nearestIndex(R.refMotion, 'd', targetD)].t;
        }
        R.markers.forEach(function (mk) {
            var idx = (refT != null && !mk.isRef)
                ? nearestIndex(mk.motion, 't', refT)
                : nearestIndex(mk.motion, 'd', targetD);
            mk.mesh.position.copy(mk.scenePts[idx]);
        });
    }

    // Name tag styled after the app's chrome (design tokens in css/tokens.css): elevated
    // dark pill (#21262d) with the standard #30363d border, small 600-weight uppercase label
    // in the UI font. A race-position number sits on the left; when tyre display is on, a
    // round compound badge (coloured ring + letter) sits on the right. No team-colour dot.
    // Canvas is drawn at 2× the on-screen size so the downscaled sprite stays crisp.
    // opts: { label, position, tyre (visual compound id), showTyre }. Returns {tex, aspect}.
    var TAG_FONT = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    var TAG_POS_FONT = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    function makeNameTagTexture(opts) {
        var h = 34, pad = 10, gap = 8;
        var label = opts.label, position = opts.position;
        var badge = (opts.showTyre && opts.tyre != null) ? TYRE_BADGE[opts.tyre] : null;
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var text = String(label).toUpperCase();

        // Position chip on the left: a number in its own rounded box.
        var posText = (position != null && position > 0) ? String(position) : '';
        ctx.font = TAG_POS_FONT;
        var posTextW = posText ? ctx.measureText(posText).width : 0;
        var posBoxW = posText ? Math.max(h - 12, Math.ceil(posTextW) + 8) : 0;

        ctx.font = TAG_FONT;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.8px';
        var textW = ctx.measureText(text).width;

        var badgeD = h - 8;   // tyre badge diameter
        var w = Math.ceil(
            pad
            + (posText ? posBoxW + gap : 0)
            + textW
            + (badge ? gap + badgeD : 0)
            + pad);
        canvas.width = w; canvas.height = h;
        ctx = canvas.getContext('2d');

        var r = 8;
        if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, r);
            ctx.fillStyle = 'rgba(33,38,45,0.92)';   // --color-bg-elevated
            ctx.fill();
            ctx.lineWidth = 2;                        // ≈1px at on-screen scale
            ctx.strokeStyle = '#30363d';              // --color-border-default
            ctx.stroke();
        } else {
            ctx.fillStyle = 'rgba(33,38,45,0.92)';
            ctx.fillRect(0, 0, w, h);
        }

        var x = pad;
        if (posText) {
            var boxY = (h - (h - 12)) / 2, boxH = h - 12;
            if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(x, boxY, posBoxW, boxH, 4);
                ctx.fillStyle = 'rgba(255,255,255,0.10)';
                ctx.fill();
            }
            ctx.fillStyle = '#e6edf3';
            ctx.font = TAG_POS_FONT;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(posText, x + posBoxW / 2, h / 2 + 1);
            x += posBoxW + gap;
        }

        ctx.fillStyle = '#e6edf3';                    // --color-text-primary
        ctx.font = TAG_FONT;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.8px';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x, h / 2 + 1);
        x += textW + (badge ? gap : 0);

        if (badge) {
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
            var cx = x + badgeD / 2, cy = h / 2, rr = badgeD / 2;
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15,17,21,0.95)'; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = badge[1]; ctx.stroke();
            ctx.fillStyle = badge[1];
            ctx.font = (badge[0].length > 1 ? '700 12px ' : '700 15px ')
                + '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(badge[0], cx, cy + 1);
        }
        return { tex: new THREE.CanvasTexture(canvas), aspect: w / h };
    }

    var TAG_SCREEN_H = 0.032;  // constant on-screen tag height (sizeAttenuation: false)
    var TAG_LIFT = 7;          // metres a name tag floats above its car marker

    // Live car markers for the Track Map widget: one sphere per car plus a broadcast-style
    // name tag, updated in place at the broadcast rate (~10 Hz). `cars` = [{idx, x, y, z,
    // color, isPlayer, label}]. Markers are rebuilt only when the car count changes; tag
    // textures only when a car's label/colour changes. Requires geometry to be loaded
    // (R.center); until then the cars are stashed and re-applied by setData.
    function setLiveCars(cars) {
        if (!R) return;
        R.pendingLiveCars = cars;
        if (!R.center) return;
        var group = R.liveGroup;
        // A count change rebuilds every marker; those spawn on their exact position with no
        // tween. Otherwise ease over the measured gap since the last packet (clamped so a
        // stall or a burst doesn't produce a crawling or instant jump).
        var fresh = group.children.length !== cars.length;
        var now = performance.now();
        R.carTweenDur = (!fresh && R.lastCarsTime) ? Math.max(50, Math.min(300, now - R.lastCarsTime)) : 0;
        R.carTweenStart = now;
        R.lastCarsTime = now;
        if (fresh) {
            disposeGroup(group);
            cars.forEach(function (car) {
                var mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(car.isPlayer ? 2.8 : 2.1, 16, 12),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(car.color || '#9aa0a6') }));
                var tag = new THREE.Sprite(new THREE.SpriteMaterial({
                    transparent: true, depthTest: false, sizeAttenuation: false,
                }));
                tag.position.set(0, TAG_LIFT, 0);
                tag.renderOrder = 10;
                mesh.add(tag);
                group.add(mesh);
            });
        }
        var fPlayer = null, fSelected = null;
        for (var i = 0; i < cars.length; i++) {
            var mk = group.children[i], car = cars[i];
            var v = toScene(R.center, car.x, car.y, car.z);
            v.y += PATH_LIFT;
            if (!mk.userData.toPos) {
                // Freshly spawned marker: sit on the sample, no tween from the origin.
                mk.userData.fromPos = v.clone();
                mk.userData.toPos = v.clone();
                mk.position.copy(v);
            } else {
                // Tween from wherever the marker currently renders to the new sample.
                mk.userData.fromPos.copy(mk.position);
                mk.userData.toPos.copy(v);
            }
            if (car.color && '#' + mk.material.color.getHexString().toUpperCase() !== String(car.color).toUpperCase()) {
                mk.material.color.set(car.color);
            }
            var tag = mk.children[0];
            var showTyre = !R.tyresHidden;
            var tagKey = (car.label || '') + '|' + (car.position != null ? car.position : '')
                + '|' + (showTyre && car.tyre != null ? car.tyre : '');
            if (tag && tag.userData.tagKey !== tagKey) {
                tag.userData.tagKey = tagKey;
                if (tag.material.map) tag.material.map.dispose();
                if (car.label) {
                    var t = makeNameTagTexture({
                        label: car.label, position: car.position,
                        tyre: car.tyre, showTyre: showTyre,
                    });
                    tag.material.map = t.tex;
                    tag.material.needsUpdate = true;
                    tag.scale.set(TAG_SCREEN_H * t.aspect, TAG_SCREEN_H, 1);
                    tag.userData.hasLabel = true;
                } else {
                    tag.material.map = null;
                    tag.userData.hasLabel = false;
                }
                tag.visible = tag.userData.hasLabel && !R.tagsHidden;
            }
            if (car.isPlayer) fPlayer = mk;
            if (car.idx === R.followCarIdx) fSelected = mk;
        }
        // Camera-follow target: the explicitly selected car, else the player's.
        R.followMarker = fSelected || fPlayer;
    }

    // Marshal-zone flags for the live widget. `zones` = [{zoneStart, zoneFlag}] straight from
    // the Session packet: each zone spans from its lap-fraction start to the next zone's start
    // (the last wraps to the first). Only caution flags (blue/yellow/red) are drawn, as opaque-
    // ish arcs over the geometry; green/none zones show nothing. Safe to call at the broadcast
    // rate — arcs are rebuilt only when the zone layout/flags change (signature guard) — and
    // re-applied by setData once geometry is available.
    function setMarshalZones(zones) {
        if (!R) return;
        R.pendingMarshalZones = zones;
        if (!R.geom || !R.center) return;
        // Called at the position-broadcast rate (~10 Hz); only rebuild arcs when the zone
        // layout or a flag actually changes (geom load resets the signature via marshalSig).
        var sig = (zones || []).map(function (z) {
            return z.zoneStart.toFixed(4) + ':' + z.zoneFlag;
        }).join(',');
        if (sig === R.marshalSig) return;
        R.marshalSig = sig;
        disposeGroup(R.marshalGroup);
        if (!zones || !zones.length) return;
        var n = zones.length;
        for (var i = 0; i < n; i++) {
            var flag = zones[i].zoneFlag;
            var color = MARSHAL_FLAG_COLORS[flag];
            if (color == null) continue;
            var s = zones[i].zoneStart;
            var e = zones[(i + 1) % n].zoneStart;
            // Split the arc when it wraps the start/finish line (buildZoneArc needs e > s).
            var ranges = (e > s) ? [[s, e]] : [[s, 1], [0, e]];
            for (var r = 0; r < ranges.length; r++) {
                var m = buildZoneArc(R.geom, R.center, ranges[r][0], ranges[r][1], color, 0.55, MARSHAL_LIFT);
                if (m) R.marshalGroup.add(m);
            }
        }
    }

    // Populates the follow <select> (attach({followSelector:true})). `items` =
    // [{value, label}] where value is the car's wire index; a "Player" entry (value -1)
    // is always prepended. The current selection is kept when still present.
    function setFollowOptions(items) {
        if (!R || !R.caption) return;
        var sel = R.caption.querySelector('#tcMapFollowSel');
        if (!sel) return;
        var prev = String(R.followCarIdx);
        var html = '<option value="-1">Player</option>';
        (items || []).forEach(function (it) {
            html += '<option value="' + it.value + '">' + String(it.label).replace(/[<>&]/g, '') + '</option>';
        });
        sel.innerHTML = html;
        sel.value = prev;
        if (sel.value !== prev) { sel.value = '-1'; R.followCarIdx = -1; }
    }

    function dispose() {
        if (!R) return;
        if (R.raf) cancelAnimationFrame(R.raf);
        if (R.ro) R.ro.disconnect();
        disposeGroup(R.trackGroup); disposeGroup(R.pitGroup);
        disposeGroup(R.sectorGroup); disposeGroup(R.cornerGroup); disposeGroup(R.pitMergeGroup);
        disposeGroup(R.driverGroup); disposeGroup(R.markerGroup); disposeGroup(R.liveGroup);
        disposeGroup(R.drsGroup); disposeGroup(R.xmodeGroup); disposeGroup(R.domGroup);
        disposeGroup(R.marshalGroup);
        if (R.controls) R.controls.dispose();
        if (R.renderer) R.renderer.dispose();
        R = null;
    }

    return {
        attach: attach,
        setData: setData,
        setLiveCars: setLiveCars,
        setMarshalZones: setMarshalZones,
        setFollowOptions: setFollowOptions,
        setMarkerDistance: setMarkerDistance,
        setSyncMode: setSyncMode,
        dispose: dispose,
    };
    } // end createTrackMap

    window.TrackMap3D = createTrackMap();
    window.TrackMap3D.create = createTrackMap;
})();
