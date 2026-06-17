// 3D track map for the Telemetry Compare view. Renders the authored circuit centreline
// (from /data/track-geometry/{trackId}.json) as a ribbon at real elevation, overlays each
// visible driver's racing line from Motion telemetry (world X/Y/Z), and keeps an orbit
// camera. Exposes a tiny imperative API so telemetryCompare.js can keep its existing
// drawTrackMap / updateMapMarkers call sites and hover bridge.
//
// World coordinates from the game splines match the UDP Motion worldPosition frame 1:1, so
// driver lines land on the ribbon with no transform. Motion.y (elevation) is used when the
// log carries it; older logs (y === null) fall back to the authored centreline elevation.
(function () {
    'use strict';
    var THREE = window.THREE;
    if (!THREE) return; // three.min.js failed to load — leave window.TrackMap3D undefined.

    var ROAD_HALF_WIDTH = 6.5;   // metres each side of the centreline.
    var TUBE_RADIUS = 1.7;       // driver racing-line thickness, metres.
    var PATH_LIFT = 1.4;         // metres a racing line sits above the road surface.
    var ZONE_LIFT = 0.7;         // metres a DRS / Straight-Mode overlay sits above the road.
    var DRS_COLOR = 0x00d700;    // DRS zones — green (matches --accent-green).
    var XMODE_COLOR = 0xff3fd8;  // Straight Mode (X-mode) — magenta.
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

    var geomCache = {};          // trackId -> Promise<geometry json | null>
    var R = null;                // live runtime (renderer/scene/camera/groups/state)

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
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
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

    function buildTrackRibbon(geom, center) {
        var pts = geom.points, n = pts.length;
        var positions = new Float32Array(n * 2 * 3);
        var leftEdge = [], rightEdge = [];
        for (var i = 0; i < n; i++) {
            var prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
            var tx = next[0] - prev[0], tz = next[2] - prev[2];
            var len = Math.hypot(tx, tz) || 1;
            // Perpendicular in the ground plane.
            var px = -tz / len, pz = tx / len;
            var c = pts[i];
            var l = toScene(center, c[0] + px * ROAD_HALF_WIDTH, c[1], c[2] + pz * ROAD_HALF_WIDTH);
            var r = toScene(center, c[0] - px * ROAD_HALF_WIDTH, c[1], c[2] - pz * ROAD_HALF_WIDTH);
            positions[i * 6] = l.x; positions[i * 6 + 1] = l.y; positions[i * 6 + 2] = l.z;
            positions[i * 6 + 3] = r.x; positions[i * 6 + 4] = r.y; positions[i * 6 + 5] = r.z;
            leftEdge.push(l); rightEdge.push(r);
        }
        var indices = [];
        for (var s = 0; s < n; s++) {
            var a = s * 2, b = s * 2 + 1;
            var nx = ((s + 1) % n) * 2, ny = ((s + 1) % n) * 2 + 1;
            indices.push(a, b, ny, a, ny, nx);
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        var mat = new THREE.MeshStandardMaterial({
            color: 0x3b424f, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
        });
        var group = new THREE.Group();
        group.add(new THREE.Mesh(g, mat));
        // Subtle white kerb edges so the track shape stays legible head-on.
        var edgeMat = new THREE.LineBasicMaterial({ color: 0xaab2c0, transparent: true, opacity: 0.5 });
        leftEdge.push(leftEdge[0]); rightEdge.push(rightEdge[0]);
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge), edgeMat));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge), edgeMat.clone()));
        return group;
    }

    // A translucent overlay ribbon over one [start,end] lap-fraction arc (DRS / X-mode zone).
    // Ranges are pre-split so they never wrap the start/finish line.
    function buildZoneArc(geom, center, s, e, color, opacity) {
        var pts = geom.points, n = pts.length;
        var i0 = Math.max(0, Math.min(n - 1, Math.round(s * (n - 1))));
        var i1 = Math.max(0, Math.min(n - 1, Math.round(e * (n - 1))));
        if (i1 <= i0) return null;
        var count = i1 - i0 + 1;
        var positions = new Float32Array(count * 2 * 3);
        for (var k = 0; k < count; k++) {
            var i = i0 + k;
            var prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
            var tx = next[0] - prev[0], tz = next[2] - prev[2];
            var len = Math.hypot(tx, tz) || 1;
            var px = -tz / len, pz = tx / len;
            var c = pts[i];
            var l = toScene(center, c[0] + px * ROAD_HALF_WIDTH, c[1], c[2] + pz * ROAD_HALF_WIDTH);
            var r = toScene(center, c[0] - px * ROAD_HALF_WIDTH, c[1], c[2] - pz * ROAD_HALF_WIDTH);
            l.y += ZONE_LIFT; r.y += ZONE_LIFT;
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

    function applyOverlay() {
        if (!R) return;
        R.drsGroup.visible = R.overlayMode === 'drs';
        R.xmodeGroup.visible = R.overlayMode === 'xmode';
        R.domGroup.visible = R.overlayMode === 'dom';
        if (R.caption) {
            R.caption.querySelectorAll('.tc-map3d-seg button').forEach(function (b) {
                b.classList.toggle('active', b.dataset.ov === R.overlayMode);
            });
        }
    }

    function setOverlay(mode) {
        if (!R) return;
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
        R.controls.target.set(0, 0, 0);
        R.camera.near = Math.max(1, radius / 100);
        R.camera.far = radius * 30;
        // Distance ~2.4×radius keeps the whole circuit inside the 50° FOV with margin;
        // a high tilt makes the elevation profile read at a glance.
        R.camera.position.set(0, radius * 1.7, radius * 1.7);
        R.camera.updateProjectionMatrix();
        R.controls.minDistance = radius * 0.3;
        R.controls.maxDistance = radius * 6;
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
        var hits = R.ray.intersectObjects(R.trackGroup.children.concat(R.driverGroup.children), false);
        if (!hits.length) return;
        var pt = hits[0].point, best = 0, bestD2 = Infinity;
        for (var i = 0; i < R.refScenePts.length; i++) {
            var d2 = R.refScenePts[i].distanceToSquared(pt);
            if (d2 < bestD2) { bestD2 = d2; best = i; }
        }
        var dist = R.refMotion[best].d;
        if (Math.abs(dist - R.lastHoverD) > 0.5) { R.lastHoverD = dist; R.onHover(dist); }
    }

    function attach(host) {
        if (R && R.host === host) { resize(); return; }
        dispose();
        host.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'tc-map3d';
        var caption = document.createElement('div');
        caption.className = 'tc-map3d-caption';
        caption.innerHTML = '<span class="tc-map3d-hint">drag · scroll to zoom</span>'
            + '<span class="tc-map3d-ctrls">'
            + '<button type="button" class="tc-map3d-follow" id="tcMapFollow" title="Camera follows the car during playback" aria-label="Follow camera">' + FOLLOW_SVG + '</button>'
            + '<span class="tc-map3d-seg" role="group" aria-label="Track overlay">'
            + '<button type="button" data-ov="drs" title="DRS zones">DRS</button>'
            + '<button type="button" data-ov="xmode" title="Straight Mode (X-mode)">SM</button>'
            + '<button type="button" data-ov="dom" title="Track dominance — fastest driver per segment">DOM</button>'
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
        controls.enablePan = false;

        scene.add(new THREE.HemisphereLight(0xcdd6e6, 0x20242c, 1.0));
        var dir = new THREE.DirectionalLight(0xffffff, 0.65);
        dir.position.set(1, 1.4, 0.6);
        scene.add(dir);

        var trackGroup = new THREE.Group();
        var driverGroup = new THREE.Group();
        var markerGroup = new THREE.Group();
        var drsGroup = new THREE.Group(); drsGroup.visible = false;
        var xmodeGroup = new THREE.Group(); xmodeGroup.visible = false;
        var domGroup = new THREE.Group(); domGroup.visible = false;
        scene.add(trackGroup); scene.add(driverGroup); scene.add(markerGroup);
        scene.add(drsGroup); scene.add(xmodeGroup); scene.add(domGroup);

        R = {
            host: host, wrap: wrap, renderer: renderer, scene: scene, camera: camera,
            controls: controls, trackGroup: trackGroup, driverGroup: driverGroup,
            markerGroup: markerGroup, drsGroup: drsGroup, xmodeGroup: xmodeGroup, domGroup: domGroup,
            caption: caption, markers: [], refScenePts: null, refMotion: null,
            center: null, fitTrackId: null, dataToken: 0, lastHoverD: -Infinity,
            onHover: null, onHoverClear: null, ray: new THREE.Raycaster(),
            pointer: new THREE.Vector2(), raf: 0, syncMode: 'dist',
            overlayMode: (function () { try { return localStorage.getItem('tcMap3dOverlay') || 'none'; } catch (e) { return 'none'; } })(),
            follow: (function () { try { return localStorage.getItem('tcMap3dFollow') === '1'; } catch (e) { return false; } })(),
            followMarker: null,
        };

        var ro = new ResizeObserver(resize); ro.observe(wrap); R.ro = ro;
        renderer.domElement.addEventListener('pointermove', pointerMove);
        renderer.domElement.addEventListener('pointerleave', function () {
            R.lastHoverD = -Infinity;
            if (R.onHoverClear) R.onHoverClear();
        });
        caption.querySelectorAll('.tc-map3d-seg button').forEach(function (btn) {
            btn.addEventListener('click', function () { setOverlay(btn.dataset.ov); });
        });
        applyOverlay();
        var followBtn = caption.querySelector('#tcMapFollow');
        if (followBtn) followBtn.addEventListener('click', function () { setFollow(!R.follow); });
        applyFollow();

        resize();
        (function loop() {
            if (!R) return;
            R.raf = requestAnimationFrame(loop);
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
            if (!geom) { disposeGroup(R.trackGroup); disposeGroup(R.driverGroup); disposeGroup(R.markerGroup); return; }
            var b = geom.bounds;
            var center = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
            R.center = center;
            if (R.fitTrackId !== trackId) {
                disposeGroup(R.trackGroup);
                R.trackGroup.add(buildTrackRibbon(geom, center));
                buildZones(R.drsGroup, geom.drsZones, geom, center, DRS_COLOR);
                buildZones(R.xmodeGroup, geom.xModeZones, geom, center, XMODE_COLOR);
                fitCamera(geom, center);
                R.fitTrackId = trackId;
            }
            buildDrivers(opts.drivers, geom, center);
            buildDominance(R.domGroup, opts.dominance, geom, center);
            applyOverlay();
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

    function dispose() {
        if (!R) return;
        if (R.raf) cancelAnimationFrame(R.raf);
        if (R.ro) R.ro.disconnect();
        disposeGroup(R.trackGroup); disposeGroup(R.driverGroup); disposeGroup(R.markerGroup);
        disposeGroup(R.drsGroup); disposeGroup(R.xmodeGroup); disposeGroup(R.domGroup);
        if (R.controls) R.controls.dispose();
        if (R.renderer) R.renderer.dispose();
        R = null;
    }

    window.TrackMap3D = {
        attach: attach,
        setData: setData,
        setMarkerDistance: setMarkerDistance,
        setSyncMode: setSyncMode,
        dispose: dispose,
    };
})();
