import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type TrackMap3DCenterlinePoint = [number, number, number];

export interface TrackMap3DGeometry {
  /** Authored centreline, world metres, closed loop (last point implicitly connects to the first). */
  points: TrackMap3DCenterlinePoint[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** Lap-fraction [start, end] pairs, pre-split so none wrap the start/finish line. */
  drsZones?: [number, number][];
  xModeZones?: [number, number][];
}

export interface TrackMap3DMotionSample {
  /** Lap time at this sample, seconds. */
  t: number;
  /** Lap distance at this sample, metres. */
  d: number;
  x: number;
  /** World elevation; null on logs recorded before elevation capture (falls back to the authored centreline). */
  y: number | null;
  z: number;
}

export interface TrackMap3DDriver {
  carIdx: number;
  /** Resolved livery/team colour — never a hardcoded team palette. */
  color: string;
  isPlayer?: boolean;
  isRef?: boolean;
  /** World X/Y/Z motion samples for the lap, ordered by ascending `d`. */
  motion: TrackMap3DMotionSample[];
}

export interface TrackMap3DDominanceRun {
  start: number;
  end: number;
  color: string;
}

export type TrackMap3DOverlayMode = "drs" | "xmode" | "dom" | "none";
export type TrackMap3DSyncMode = "dist" | "time";

export interface TrackMap3DProps {
  geometry: TrackMap3DGeometry | null;
  drivers: TrackMap3DDriver[];
  /** Pre-merged [start,end] lap-fraction runs, each in the fastest driver's colour for that stretch. */
  dominance?: TrackMap3DDominanceRun[];
  /** Current scrub position, lap metres — drives marker placement. */
  markerDistance?: number;
  /** 'dist': every marker at the same track distance. 'time': only the reference rides `markerDistance`; others sit where they were at that elapsed lap time. */
  syncMode?: TrackMap3DSyncMode;
  overlayMode?: TrackMap3DOverlayMode;
  onOverlayModeChange?: (mode: TrackMap3DOverlayMode) => void;
  /** Camera eases onto the followed car (player, else reference, else first) each frame. */
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  /** Fired as the pointer moves over the stage, with the lap distance of the nearest point on the reference line. */
  onHover?: (distanceM: number) => void;
  onHoverClear?: () => void;
  className?: string;
  /** Rendered inside the `.tc-map3d` stage, absolutely positioned over the canvas — e.g. a delta overlay pill. */
  children?: ReactNode;
}

const ROAD_HALF_WIDTH = 6.5; // metres each side of the centreline.
const TUBE_RADIUS = 1.7; // driver racing-line thickness, metres.
const PATH_LIFT = 1.4; // metres a racing line sits above the road surface.
const ZONE_LIFT = 0.7; // metres a DRS / Straight-Mode overlay sits above the road.
const DRS_COLOR = 0x00d700; // DRS zones — green (matches --accent-green).
const XMODE_COLOR = 0xff3fd8; // Straight Mode (X-mode) — magenta.

interface SceneCenter {
  x: number;
  y: number;
  z: number;
}

interface MarkerEntry {
  mesh: THREE.Mesh;
  motion: TrackMap3DMotionSample[];
  scenePts: THREE.Vector3[];
  isRef: boolean;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// World (metres) -> centred scene coordinates, true 1:1 scale. Y is up (elevation).
function toScene(c: SceneCenter, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x - c.x, y - c.y, z - c.z);
}

// Nearest authored-centreline elevation for an (x,z) — used only for samples without world Y.
function elevationAt(points: TrackMap3DCenterlinePoint[], x: number, z: number): number {
  let best = points[0][1];
  let bestD2 = Infinity;
  for (const p of points) {
    const dx = p[0] - x;
    const dz = p[2] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p[1];
    }
  }
  return best;
}

function disposeGroup(group: THREE.Group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const o = group.children[i] as THREE.Mesh | THREE.Line;
    if (o.geometry) o.geometry.dispose();
    const mat = o.material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    group.remove(o);
  }
}

function buildTrackRibbon(points: TrackMap3DCenterlinePoint[], center: SceneCenter): THREE.Group {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  const leftEdge: THREE.Vector3[] = [];
  const rightEdge: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const tx = next[0] - prev[0];
    const tz = next[2] - prev[2];
    const len = Math.hypot(tx, tz) || 1;
    // Perpendicular in the ground plane.
    const px = -tz / len;
    const pz = tx / len;
    const c = points[i];
    const l = toScene(center, c[0] + px * ROAD_HALF_WIDTH, c[1], c[2] + pz * ROAD_HALF_WIDTH);
    const r = toScene(center, c[0] - px * ROAD_HALF_WIDTH, c[1], c[2] - pz * ROAD_HALF_WIDTH);
    positions[i * 6] = l.x; positions[i * 6 + 1] = l.y; positions[i * 6 + 2] = l.z;
    positions[i * 6 + 3] = r.x; positions[i * 6 + 4] = r.y; positions[i * 6 + 5] = r.z;
    leftEdge.push(l);
    rightEdge.push(r);
  }
  const indices: number[] = [];
  for (let s = 0; s < n; s++) {
    const a = s * 2;
    const b = s * 2 + 1;
    const nx = ((s + 1) % n) * 2;
    const ny = ((s + 1) % n) * 2 + 1;
    indices.push(a, b, ny, a, ny, nx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b424f, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, mat));
  // Subtle white kerb edges so the track shape stays legible head-on.
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xaab2c0, transparent: true, opacity: 0.5 });
  leftEdge.push(leftEdge[0]);
  rightEdge.push(rightEdge[0]);
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge), edgeMat));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge), edgeMat.clone()));
  return group;
}

// A translucent overlay ribbon over one [start,end] lap-fraction arc (DRS / X-mode zone / dominance run).
function buildZoneArc(
  points: TrackMap3DCenterlinePoint[],
  center: SceneCenter,
  s: number,
  e: number,
  color: THREE.ColorRepresentation,
  opacity?: number
): THREE.Mesh | null {
  const n = points.length;
  const i0 = Math.max(0, Math.min(n - 1, Math.round(s * (n - 1))));
  const i1 = Math.max(0, Math.min(n - 1, Math.round(e * (n - 1))));
  if (i1 <= i0) return null;
  const count = i1 - i0 + 1;
  const positions = new Float32Array(count * 2 * 3);
  for (let k = 0; k < count; k++) {
    const i = i0 + k;
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const tx = next[0] - prev[0];
    const tz = next[2] - prev[2];
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len;
    const c = points[i];
    const l = toScene(center, c[0] + px * ROAD_HALF_WIDTH, c[1], c[2] + pz * ROAD_HALF_WIDTH);
    const r = toScene(center, c[0] - px * ROAD_HALF_WIDTH, c[1], c[2] - pz * ROAD_HALF_WIDTH);
    l.y += ZONE_LIFT;
    r.y += ZONE_LIFT;
    positions[k * 6] = l.x; positions[k * 6 + 1] = l.y; positions[k * 6 + 2] = l.z;
    positions[k * 6 + 3] = r.x; positions[k * 6 + 4] = r.y; positions[k * 6 + 5] = r.z;
  }
  const indices: number[] = [];
  for (let sgm = 0; sgm < count - 1; sgm++) {
    const a = sgm * 2;
    const b = sgm * 2 + 1;
    const nx = (sgm + 1) * 2;
    const ny = (sgm + 1) * 2 + 1;
    indices.push(a, b, ny, a, ny, nx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity ?? 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
}

function buildZones(
  group: THREE.Group,
  zones: [number, number][] | undefined,
  points: TrackMap3DCenterlinePoint[],
  center: SceneCenter,
  color: THREE.ColorRepresentation
) {
  disposeGroup(group);
  (zones || []).forEach(([s, e]) => {
    const m = buildZoneArc(points, center, s, e, color);
    if (m) group.add(m);
  });
}

// Track dominance: opaque coloured arcs along the lap, each in the fastest driver's colour for that stretch.
function buildDominance(
  group: THREE.Group,
  runs: TrackMap3DDominanceRun[] | undefined,
  points: TrackMap3DCenterlinePoint[],
  center: SceneCenter
) {
  disposeGroup(group);
  (runs || []).forEach((r) => {
    const m = buildZoneArc(points, center, r.start, r.end, r.color, 0.85);
    if (m) group.add(m);
  });
}

function buildDrivers(
  driverGroup: THREE.Group,
  markerGroup: THREE.Group,
  drivers: TrackMap3DDriver[],
  points: TrackMap3DCenterlinePoint[],
  center: SceneCenter
): {
  markers: MarkerEntry[];
  refScenePts: THREE.Vector3[] | null;
  refMotion: TrackMap3DMotionSample[] | null;
  followMarker: THREE.Mesh | null;
} {
  disposeGroup(driverGroup);
  disposeGroup(markerGroup);
  const markers: MarkerEntry[] = [];
  let refScenePts: THREE.Vector3[] | null = null;
  let refMotion: TrackMap3DMotionSample[] | null = null;
  let fPlayer: THREE.Mesh | null = null;
  let fRef: THREE.Mesh | null = null;
  let fFirst: THREE.Mesh | null = null;

  drivers.forEach((drv) => {
    const motion = drv.motion;
    if (!motion || motion.length < 2) return;
    const col = new THREE.Color(drv.color || "#9aa0a6");
    const scenePts = motion.map((m) => {
      const y = m.y != null ? m.y : elevationAt(points, m.x, m.z);
      const v = toScene(center, m.x, y, m.z);
      v.y += PATH_LIFT;
      return v;
    });
    const curve = new THREE.CatmullRomCurve3(scenePts, false);
    const tube = new THREE.TubeGeometry(curve, Math.min(scenePts.length * 2, 4000), TUBE_RADIUS, 6, false);
    driverGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: col })));

    const rad = drv.isPlayer ? 4.2 : 3.2;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
    marker.position.copy(scenePts[0]);
    markerGroup.add(marker);
    markers.push({ mesh: marker, motion, scenePts, isRef: !!drv.isRef });
    if (!fFirst) fFirst = marker;
    if (drv.isRef) fRef = marker;
    if (drv.isPlayer) fPlayer = marker;

    // The reference lap drives hover-distance mapping (hover anywhere -> nearest ref point).
    if (drv.isRef || !refScenePts) {
      refScenePts = scenePts;
      refMotion = motion;
    }
  });

  return { markers, refScenePts, refMotion, followMarker: fPlayer || fRef || fFirst };
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, bounds: TrackMap3DGeometry["bounds"]) {
  const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 || 200;
  controls.target.set(0, 0, 0);
  camera.near = Math.max(1, radius / 100);
  camera.far = radius * 30;
  // Distance ~2.4x radius keeps the whole circuit inside the 50deg FOV with margin;
  // a high tilt makes the elevation profile read at a glance.
  camera.position.set(0, radius * 1.7, radius * 1.7);
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.3;
  controls.maxDistance = radius * 6;
  controls.update();
}

function nearestIndex<T>(arr: T[], getKey: (item: T) => number, val: number): number {
  let best = 0;
  let bestDiff = Math.abs(getKey(arr[0]) - val);
  for (let i = 1; i < arr.length; i++) {
    const diff = Math.abs(getKey(arr[i]) - val);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  trackGroup: THREE.Group;
  driverGroup: THREE.Group;
  markerGroup: THREE.Group;
  drsGroup: THREE.Group;
  xmodeGroup: THREE.Group;
  domGroup: THREE.Group;
  raf: number;
  markers: MarkerEntry[];
  refScenePts: THREE.Vector3[] | null;
  refMotion: TrackMap3DMotionSample[] | null;
  followMarker: THREE.Mesh | null;
  follow: boolean;
  center: SceneCenter | null;
  geometryPoints: TrackMap3DCenterlinePoint[] | null;
  lastHoverD: number;
  onHover?: (d: number) => void;
  onHoverClear?: () => void;
  ray: THREE.Raycaster;
  pointer: THREE.Vector2;
}

function FollowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx={12} cy={12} r={7} />
      <line x1={12} y1={1} x2={12} y2={4} />
      <line x1={12} y1={20} x2={12} y2={23} />
      <line x1={1} y1={12} x2={4} y2={12} />
      <line x1={20} y1={12} x2={23} y2={12} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1={1} y1={1} x2={23} y2={23} />
    </svg>
  );
}

/** Mirrors `track3d.js` `TrackMap3D` — the WebGL circuit stage: authored centreline ribbon at
 *  real elevation, each driver's racing line as a tube over their Motion telemetry, DRS/X-mode/
 *  track-dominance overlays, an orbit camera with optional car-follow easing, and a raycaster
 *  hover bridge that reports lap distance on the reference line. `setData`/`setMarkerDistance`/
 *  `setOverlay`/`setFollow`'s live-fetch and localStorage persistence are app-level concerns —
 *  this component takes already-resolved geometry/driver data and controlled UI props instead. */
export function TrackMap3D({
  geometry,
  drivers,
  dominance,
  markerDistance = 0,
  syncMode = "dist",
  overlayMode = "none",
  onOverlayModeChange,
  follow = false,
  onFollowChange,
  onHover,
  onHoverClear,
  className,
  children,
}: TrackMap3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);

  // Mount once: build the renderer/scene/camera/controls and the render loop.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xcdd6e6, 0x20242c, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(1, 1.4, 0.6);
    scene.add(dir);

    const trackGroup = new THREE.Group();
    const driverGroup = new THREE.Group();
    const markerGroup = new THREE.Group();
    const drsGroup = new THREE.Group();
    drsGroup.visible = false;
    const xmodeGroup = new THREE.Group();
    xmodeGroup.visible = false;
    const domGroup = new THREE.Group();
    domGroup.visible = false;
    scene.add(trackGroup, driverGroup, markerGroup, drsGroup, xmodeGroup, domGroup);

    const state: SceneState = {
      renderer, camera, controls, trackGroup, driverGroup, markerGroup, drsGroup, xmodeGroup, domGroup,
      raf: 0, markers: [], refScenePts: null, refMotion: null, followMarker: null, follow: false,
      center: null, geometryPoints: null, lastHoverD: -Infinity, ray: new THREE.Raycaster(), pointer: new THREE.Vector2(),
    };
    stateRef.current = state;

    function resize() {
      const w = wrap!.clientWidth || 1;
      const h = wrap!.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function pointerMove(e: PointerEvent) {
      const s = stateRef.current;
      if (!s || !s.onHover || !s.refScenePts) return;
      const rect = renderer.domElement.getBoundingClientRect();
      s.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.ray.setFromCamera(s.pointer, camera);
      const hits = s.ray.intersectObjects(trackGroup.children.concat(driverGroup.children), false);
      if (!hits.length) return;
      const pt = hits[0].point;
      let best = 0;
      let bestD2 = Infinity;
      for (let i = 0; i < s.refScenePts.length; i++) {
        const d2 = s.refScenePts[i].distanceToSquared(pt);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (!s.refMotion) return;
      const dist = s.refMotion[best].d;
      if (Math.abs(dist - s.lastHoverD) > 0.5) {
        s.lastHoverD = dist;
        s.onHover(dist);
      }
    }
    function pointerLeave() {
      const s = stateRef.current;
      if (!s) return;
      s.lastHoverD = -Infinity;
      if (s.onHoverClear) s.onHoverClear();
    }
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);

    resize();
    let alive = true;
    (function loop() {
      if (!alive) return;
      state.raf = requestAnimationFrame(loop);
      // Camera follow: ease the orbit target onto the followed car each frame and shift the
      // camera by the same delta, so the user's chosen angle/zoom is preserved.
      if (state.follow && state.followMarker) {
        const offset = camera.position.clone().sub(controls.target);
        controls.target.lerp(state.followMarker.position, 0.12);
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      renderer.render(scene, camera);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      disposeGroup(trackGroup);
      disposeGroup(driverGroup);
      disposeGroup(markerGroup);
      disposeGroup(drsGroup);
      disposeGroup(xmodeGroup);
      disposeGroup(domGroup);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the hover bridge and follow flag live without rebuilding the scene.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.onHover = onHover;
    s.onHoverClear = onHoverClear;
    s.follow = follow;
  }, [onHover, onHoverClear, follow]);

  // Rebuild the track ribbon + DRS/X-mode zones and refit the camera when the circuit changes.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (!geometry) {
      disposeGroup(s.trackGroup);
      disposeGroup(s.driverGroup);
      disposeGroup(s.markerGroup);
      s.geometryPoints = null;
      s.center = null;
      return;
    }
    const b = geometry.bounds;
    const center: SceneCenter = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
    s.center = center;
    s.geometryPoints = geometry.points;
    disposeGroup(s.trackGroup);
    s.trackGroup.add(buildTrackRibbon(geometry.points, center));
    buildZones(s.drsGroup, geometry.drsZones, geometry.points, center, DRS_COLOR);
    buildZones(s.xmodeGroup, geometry.xModeZones, geometry.points, center, XMODE_COLOR);
    fitCamera(s.camera, s.controls, b);
  }, [geometry]);

  // Rebuild driver racing lines + markers.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.center || !s.geometryPoints) return;
    const built = buildDrivers(s.driverGroup, s.markerGroup, drivers, s.geometryPoints, s.center);
    s.markers = built.markers;
    s.refScenePts = built.refScenePts;
    s.refMotion = built.refMotion;
    s.followMarker = built.followMarker;
  }, [drivers, geometry]);

  // Rebuild the track-dominance overlay.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.center || !s.geometryPoints) return;
    buildDominance(s.domGroup, dominance, s.geometryPoints, s.center);
  }, [dominance, geometry]);

  // Place every driver marker at the current scrub position.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.markers.length) return;
    let refT: number | null = null;
    if (syncMode === "time" && s.refMotion && s.refMotion.length) {
      refT = s.refMotion[nearestIndex(s.refMotion, (m) => m.d, markerDistance)].t;
    }
    s.markers.forEach((mk) => {
      const idx = refT != null && !mk.isRef ? nearestIndex(mk.motion, (m) => m.t, refT) : nearestIndex(mk.motion, (m) => m.d, markerDistance);
      mk.mesh.position.copy(mk.scenePts[idx]);
    });
  }, [markerDistance, syncMode, drivers, geometry]);

  // Overlay group visibility.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.drsGroup.visible = overlayMode === "drs";
    s.xmodeGroup.visible = overlayMode === "xmode";
    s.domGroup.visible = overlayMode === "dom";
  }, [overlayMode]);

  return (
    <>
      <div className={cx("tc-map3d", className)} ref={wrapRef}>
        {children}
      </div>
      <div className="tc-map3d-caption">
        <span className="tc-map3d-hint">drag · scroll to zoom</span>
        <span className="tc-map3d-ctrls">
          <button
            type="button"
            className={cx("tc-map3d-follow", follow && "active")}
            title="Camera follows the car during playback"
            aria-label="Follow camera"
            onClick={() => onFollowChange?.(!follow)}
          >
            <FollowIcon />
          </button>
          <span className="tc-map3d-seg" role="group" aria-label="Track overlay">
            <button type="button" className={cx(overlayMode === "drs" && "active")} title="DRS zones" onClick={() => onOverlayModeChange?.("drs")}>
              DRS
            </button>
            <button type="button" className={cx(overlayMode === "xmode" && "active")} title="Straight Mode (X-mode)" onClick={() => onOverlayModeChange?.("xmode")}>
              SM
            </button>
            <button
              type="button"
              className={cx(overlayMode === "dom" && "active")}
              title="Track dominance — fastest driver per segment"
              onClick={() => onOverlayModeChange?.("dom")}
            >
              DOM
            </button>
            <button
              type="button"
              className={cx(overlayMode === "none" && "active")}
              title="Hide overlay"
              aria-label="Hide overlay"
              onClick={() => onOverlayModeChange?.("none")}
            >
              <EyeOffIcon />
            </button>
          </span>
        </span>
      </div>
    </>
  );
}
