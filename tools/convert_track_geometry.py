#!/usr/bin/env python3
"""Convert F1 game track centreline splines into compact per-track JSON for the 3D map.

Reads the authored `*.trackspacespline.xml` (the "maintrack" centreline and the "pit_1"
pit-lane centreline, world-space X/Y/Z in metres) shipped under docs/tracks/, plus the
`*.aispline.xml` AI gates (each gate carries a lateral `normal` and signed left/right
`white_line` / `track_limit` offsets), and writes one JSON per F1 UDP trackId into the
host's wwwroot so the frontend can fetch it directly.

Each centreline point is matched to its nearest AI gate (by 3D position) to pick up a
real per-point road half-width (white line, i.e. the paved surface) and kerb half-width
(track limit, i.e. outer edge of the kerb) on each side — replacing the old fixed
6.5 m half-width with the track's actual, varying width and kerb bands.

It's also matched to its nearest `*.trackspacedata.xml` cross-section gate (4 real 3D
points sweeping across the track) to derive a per-point banking slope — cross-track
camber/banking such as Zandvoort's ~14-19 degree corners, which a flat cross-section
would otherwise erase.

Also pulled in: sector 1/2/3 boundaries and corner numbers (from `trackmarkup.xml` and
the career-mode `*.taprogram.xml`), plus where the pit lane geometrically forks off /
rejoins the main straight (nearest-point match, not a markup zone — there isn't one on
the maintrack side).

World coordinates match the UDP Motion `worldPosition` frame 1:1 (verified against a
Catalunya session log), so X/Z need no transform and Y is true elevation.

Run from the repo root:  python tools/convert_track_geometry.py
"""
import json
import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "docs" / "tracks" / "xmlfiles"
OUT = REPO / "src" / "F1Telemetry.Host" / "wwwroot" / "data" / "track-geometry"

# Folder slug (the part before "_common_erp_xmlfiles") -> (F1 UDP trackId, display name).
# trackIds 0..41 come from Format2025 lookups; Madrid (42) is 2026-only.
TRACKS = {
    "abu_dhabi": (14, "Abu Dhabi"),
    "austria": (17, "Austria"),
    "austria_reverse": (40, "Austria (R)"),
    "bahrain": (3, "Sakhir"),
    "baku": (20, "Baku"),
    "brazil": (16, "Brazil"),
    "catalunya": (4, "Catalunya"),
    "hungaroring": (9, "Hungaroring"),
    "imola": (27, "Imola"),
    "jeddah": (29, "Jeddah"),
    "las_vegas": (31, "Las Vegas"),
    "losail": (32, "Losail"),
    "madrid": (42, "Madrid"),
    "melbourne": (0, "Melbourne"),
    "mexico": (19, "Mexico"),
    "miami": (30, "Miami"),
    "monaco": (5, "Monaco"),
    "montreal": (6, "Montreal"),
    "monza": (11, "Monza"),
    "shanghai": (2, "Shanghai"),
    "silverstone": (7, "Silverstone"),
    "silverstone_reverse": (39, "Silverstone (R)"),
    "singapore": (12, "Singapore"),
    "spa_francorchamps": (10, "Spa"),
    "suzuka": (13, "Suzuka"),
    "texas": (15, "Texas"),
    "zandvoort": (26, "Zandvoort"),
    "zandvoort_reverse": (41, "Zandvoort (R)"),
}

POS_RE = re.compile(r'position="([^"]+)"')
ELEM_RE = re.compile(
    r'<MarkupElement\b[^>]*?Start="([-0-9.eE]+)"[^>]*?End="([-0-9.eE]+)"'
    r'[^>]*?SplineName="([^"]+)"[^>]*?>(.*?)</MarkupElement>', re.DOTALL)
GATE_RE = re.compile(
    r'<gate id="\d+" name="([^"]+)">\s*'
    r'<position x="([-0-9.eE]+)" y="([-0-9.eE]+)" z="([-0-9.eE]+)"\s*/>\s*'
    r'<normal x="([-0-9.eE]+)" y="([-0-9.eE]+)" z="([-0-9.eE]+)"\s*/>\s*'
    r'<waypoints[^>]*>(.*?)</waypoints>', re.DOTALL)
WAYPOINT_RE = re.compile(r'type="([a-z_]+)" length="([-0-9.eE]+)"')
NEEDED_WAYPOINTS = ("left_white_line", "right_white_line", "left_track_limit", "right_track_limit")
GATE4_RE = re.compile(
    r'<Gate point1="([^"]+)" point2="([^"]+)" point3="([^"]+)" point4="([^"]+)"')
CORNER_BLOCK_RE = re.compile(r'<practice_programmes_(\d+)>(.*?)</practice_programmes_\1>', re.DOTALL)
CORNER_RE = re.compile(r'<Corner>(\d+)(.*?)</Corner>', re.DOTALL)
APEX_FRAC_RE = re.compile(r'<Apex><Position progressDelta="([-0-9.eE]+)"')


def _merge_intervals(ranges):
    """Normalise circular [start,end] ranges (0..1 along the lap) into a sorted,
    merged list of non-wrapping [s,e] intervals. A range with end<start wraps past
    the start/finish line and is split into [s,1] + [0,e] first."""
    spans = []
    for s, e in ranges:
        if e >= s:
            spans.append((s, e))
        else:
            spans.append((s, 1.0))
            spans.append((0.0, e))
    spans.sort()
    merged = []
    for s, e in spans:
        if merged and s <= merged[-1][1] + 1e-4:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [[round(s, 4), round(e, 4)] for s, e in merged]


def parse_markup_zones(folder):
    """Extract DRS activation, Straight-Mode (x_mode) zones and the sector 1/2/3
    boundaries from the track markup, as normalised lap-fraction intervals along the
    maintrack spline (DRS/x_mode merged since a zone can be split into several
    elements; sectors are already single elements each)."""
    mk = next(folder.rglob("*trackmarkup.xml"), None) if folder.exists() else None
    if mk is None:
        return [], [], [None, None, None]
    text = mk.read_text(encoding="utf-8", errors="replace")
    drs, xmode = [], []
    sectors = {}
    for m in ELEM_RE.finditer(text):
        start, end, spline, body = m.group(1), m.group(2), m.group(3), m.group(4)
        if spline != "maintrack":
            continue
        try:
            s, e = float(start), float(end)
        except ValueError:
            continue
        if 'Type="drs_act"' in body:
            drs.append((s, e))
        elif 'Type="x_mode"' in body:
            xmode.append((s, e))
        else:
            for n in (1, 2, 3):
                if f'Type="sector_{n}"' in body:
                    sectors[n] = [round(s, 4), round(e, 4)]
    return _merge_intervals(drs), _merge_intervals(xmode), [sectors.get(n) for n in (1, 2, 3)]


def parse_named_spline(xml_path: Path, name: str):
    """Extract one named `<TrackSpaceSpline>` block's knot points. Falls back to the
    first block found when `name` isn't present (keeps old behaviour for maintrack)."""
    text = xml_path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r'<TrackSpaceSpline\b', text)
    chosen = None
    for b in blocks[1:]:
        if f'name="{name}"' in b:
            chosen = b
            break
    if chosen is None and name == "maintrack" and len(blocks) > 1:
        chosen = blocks[1]
    if chosen is None:
        return []
    pts = []
    for m in POS_RE.finditer(chosen):
        parts = [p.strip() for p in m.group(1).split(",")]
        if len(parts) != 3:
            continue
        try:
            x, y, z = (float(parts[0]), float(parts[1]), float(parts[2]))
        except ValueError:
            continue
        pts.append([round(x, 1), round(y, 1), round(z, 1)])
    return pts


def parse_aispline_gates(folder):
    """Extract AI gates from `*.aispline.xml`, split into main-track vs pit-lane gates
    (a gate is "pit" if "pit" appears anywhere in its name — naming varies per track,
    e.g. `ai_gate_pit_000` vs Silverstone's `ai_gate_track_pit_000`, but this substring
    check holds for all 28 tracks). Each gate keeps its lateral `normal` (XZ) and the
    signed left/right white-line / track-limit offsets used to derive real width."""
    f = next(folder.rglob("*.aispline.xml"), None) if folder.exists() else None
    if f is None:
        return [], []
    text = f.read_text(encoding="utf-8", errors="replace")
    main_gates, pit_gates = [], []
    for m in GATE_RE.finditer(text):
        name = m.group(1)
        wp = dict(WAYPOINT_RE.findall(m.group(8)))
        if not all(k in wp for k in NEEDED_WAYPOINTS):
            continue
        gate = {
            "pos": (float(m.group(2)), float(m.group(3)), float(m.group(4))),
            "normal": (float(m.group(5)), float(m.group(7))),  # x, z only
            "lw": float(wp["left_white_line"]), "rw": float(wp["right_white_line"]),
            "ll": float(wp["left_track_limit"]), "rl": float(wp["right_track_limit"]),
        }
        (pit_gates if "pit" in name.lower() else main_gates).append(gate)
    return main_gates, pit_gates


def _nearest_gate(pt, gates):
    x, y, z = pt
    best, best_d2 = None, float("inf")
    for g in gates:
        gx, gy, gz = g["pos"]
        d2 = (gx - x) ** 2 + (gy - y) ** 2 + (gz - z) ** 2
        if d2 < best_d2:
            best_d2, best = d2, g
    return best


WIDTH_HALF_CLAMP_M = 15.0  # sanity ceiling on any single half-width (metres).


def compute_widths(pts, gates, closed):
    """Per-point [left, right] half-widths for the road surface (white line) and the
    kerb outer edge (track limit). Falls back to a constant width when a track ships no
    matching gates (shouldn't happen for the 28 tracks, but keeps this safe).

    An AI gate's `position` is the *racing line* (waypoint id 4, length 0), and its
    white_line / track_limit offsets are measured from there along the gate normal — NOT
    from the centreline. Crucially, only *differences* of those offsets (rw-lw, |ll|-|lw|)
    are trustworthy: they cancel the gate's own position, so they stay correct even when
    the nearest gate is far away. The gate's absolute offset from the centreline is NOT
    trustworthy — the pit_1 spline runs ~80-130 m past the last pit gate (pit entry/exit
    roads have no gates), and anchoring width to such a distant gate blew half-widths up
    to ~85 m, which rendered as big triangular sails. So we centre the ribbon on the
    centreline (the maintrack/pit spline already IS the centre) and take half the true
    edge-to-edge width each side, plus the per-side kerb band as the white-line→track-limit
    gap. Robust to missing/distant gates; the tiny real centreline offset we drop is well
    under the noise floor."""
    n = len(pts)
    if not gates or n == 0:
        flat = [6.5, 6.5]
        return [list(flat) for _ in range(n)], [list(flat) for _ in range(n)]
    road, kerb = [], []
    for pt in pts:
        g = _nearest_gate(pt, gates)
        half = min(abs(g["rw"] - g["lw"]) / 2.0, WIDTH_HALF_CLAMP_M)
        left_band = max(0.0, abs(g["ll"]) - abs(g["lw"]))   # extra to the track limit, left
        right_band = max(0.0, abs(g["rl"]) - abs(g["rw"]))  # ...and right
        road.append([round(half, 1), round(half, 1)])
        kerb.append([round(min(half + left_band, WIDTH_HALF_CLAMP_M), 1),
                     round(min(half + right_band, WIDTH_HALF_CLAMP_M), 1)])
    return road, kerb


def parse_trackspacedata_gates(folder):
    """Extract the `<Gate point1=".." point2=".." point3=".." point4=".."/>` quads from
    `*.trackspacedata.xml`, split into main-track vs pit-lane by their `<VolumeList
    type="main"|"pit">` wrapper (mirrors the aispline main/pit split — mixing the two
    pools would let a pit-lane point near a banked corner wrongly borrow that corner's
    banking by sheer XZ proximity). Each quad is 4 real 3D points sweeping across the
    track at one cross-section (point1/4 ~ outer run-off edges, point2/3 ~ the paved
    track edges), so unlike aispline's flat lateral offsets these carry independent
    elevation per edge — that's what lets us recover cross-track camber/banking (e.g.
    Zandvoort's ~14-19° banked corners, verified against the game data before wiring
    this up)."""
    f = next(folder.rglob("*trackspacedata.xml"), None) if folder.exists() else None
    if f is None:
        return [], []
    text = f.read_text(encoding="utf-8", errors="replace")
    main_gates, pit_gates = [], []
    for vm in re.finditer(r'<VolumeList\b[^>]*?type="(main|pit)"[^>]*?>(.*?)</VolumeList>', text, re.DOTALL):
        vtype, body = vm.group(1), vm.group(2)
        dest = main_gates if vtype == "main" else pit_gates
        for m in GATE4_RE.finditer(body):
            try:
                pts = [[float(v.strip()) for v in g.split(",")] for g in m.groups()]
            except ValueError:
                continue
            if any(len(p) != 3 for p in pts):
                continue
            dest.append(pts)
    return main_gates, pit_gates


def _nearest_gate4_xz(pt, gates):
    """Nearest trackspacedata gate by its paved-edge midpoint, XZ-only — banked corners
    make Y diverge a lot between the centreline and the gate's own edges, so including Y
    in the distance would mismatch exactly where banking matters most."""
    x, z = pt[0], pt[2]
    best, best_d2 = None, float("inf")
    for g in gates:
        mx = (g[1][0] + g[2][0]) / 2.0
        mz = (g[1][2] + g[2][2]) / 2.0
        d2 = (mx - x) ** 2 + (mz - z) ** 2
        if d2 < best_d2:
            best_d2, best = d2, g
    return best


def compute_banking(pts, gates, closed):
    """Per-point cross-track slope (dy per metre of lateral offset, i.e. tan of the bank
    angle), in the same perpendicular sense as compute_widths — so the frontend can place
    edge.y = point.y + bank * halfWidth directly. 0.0 (flat) when a track has no gate
    data or the matched gate's paved edges are degenerate."""
    n = len(pts)
    if not gates or n == 0:
        return [0.0] * n
    bank = []
    for i, pt in enumerate(pts):
        if closed:
            prev, nxt = pts[(i - 1) % n], pts[(i + 1) % n]
        else:
            prev = pts[i - 1] if i > 0 else pt
            nxt = pts[i + 1] if i < n - 1 else pt
        tx, tz = nxt[0] - prev[0], nxt[2] - prev[2]
        tlen = (tx * tx + tz * tz) ** 0.5 or 1.0
        px, pz = -tz / tlen, tx / tlen

        g = _nearest_gate4_xz(pt, gates)
        a, b = g[1], g[2]  # the paved track-edge pair
        lat_a = px * (a[0] - pt[0]) + pz * (a[2] - pt[2])
        lat_b = px * (b[0] - pt[0]) + pz * (b[2] - pt[2])
        dlat = lat_b - lat_a
        if abs(dlat) < 0.5:
            bank.append(0.0)
            continue
        slope = max(-1.0, min(1.0, (b[1] - a[1]) / dlat))
        bank.append(round(slope, 4))
    return bank


def parse_corners(folder):
    """Extract corner numbers and their apex lap-fraction from the career-mode "track
    acclimatisation" program (`*.taprogram.xml`). A corner can list several apexes (e.g.
    a chicane counted as one numbered corner) — anchor the label at their average. Games
    ship one `<practice_programmes_NN>` block per ruleset year; the highest NN is newest."""
    f = next(folder.rglob("*.taprogram.xml"), None) if folder.exists() else None
    if f is None:
        return []
    text = f.read_text(encoding="utf-8", errors="replace")
    blocks = CORNER_BLOCK_RE.findall(text)
    if not blocks:
        return []
    _, body = max(blocks, key=lambda b: int(b[0]))
    corners = []
    for m in CORNER_RE.finditer(body):
        fracs = [float(x) for x in APEX_FRAC_RE.findall(m.group(2))]
        if not fracs:
            continue
        corners.append({"n": int(m.group(1)), "at": round((sum(fracs) / len(fracs)) % 1.0, 4)})
    corners.sort(key=lambda c: c["at"])
    return corners


def compute_pit_merge_fractions(pts, pit_pts):
    """Where the pit lane geometrically forks off / rejoins the main straight, as a
    maintrack lap-fraction — found by nearest-point (XZ) match of pit_1's own first and
    last knot, rather than trusting any single markup zone (there's no explicit
    maintrack-side "this is where pit lane joins" marker; the zones under `pit_1` mark
    behavioural ranges like the speed-limiter, not necessarily the exact fork point)."""
    if not pts or not pit_pts or len(pts) < 2:
        return None
    n = len(pts)

    def nearest_frac(p):
        best, best_d2 = 0, float("inf")
        for i, q in enumerate(pts):
            d2 = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2
            if d2 < best_d2:
                best_d2, best = d2, i
        return round(best / (n - 1), 4)

    return [nearest_frac(pit_pts[0]), nearest_frac(pit_pts[-1])]


PIT_HALF_MAX = 4.0   # ceiling on pit half-width (m): kills spurious track-width values on
#                      the entry/exit stretches without narrowing the real ~2.5 m lane.


def pit_render_range(pit_pts, main_pts, main_road_w, floor=1.5):
    """Decide which slice of the pit spline to draw so the pit lane shows as a separate
    surface in the middle yet still runs its real entry/exit ramps onto the main track
    with no gap.

    `pit_1`'s two ends run a long way along the main straight (Zandvoort: ~290 m at 0-4 m
    offset) — pure double-paint we drop. Between that and the separated lane is the actual
    entry/exit road curving from the track to the pit; we KEEP those points (their spline
    tangents are real, so the ribbon stays correctly oriented) and let the ribbon overlap
    the main a little near the mouth — the pit road is drawn a hair above the main so the
    overlap reads as the lane running onto the track, not as z-fighting. Width is capped
    elsewhere (PIT_HALF_MAX) so the overlap stays a lane-width sliver, and we no longer
    taper it to nothing (that made the pointed spike the user saw)."""
    n = len(pit_pts)
    if not main_pts or n == 0:
        return 0, max(0, n - 1)

    dist, mhalf = [0.0] * n, [0.0] * n
    for i, p in enumerate(pit_pts):
        bi, bd = 0, float("inf")
        for j, q in enumerate(main_pts):
            dd = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2
            if dd < bd:
                bd, bi = dd, j
        dist[i] = bd ** 0.5
        mhalf[i] = max(main_road_w[bi][0], main_road_w[bi][1])

    sep = [dist[i] > mhalf[i] for i in range(n)]
    start = next((i for i in range(n) if sep[i]), None)
    if start is None:
        return 0, n - 1
    end = next(i for i in range(n - 1, -1, -1) if sep[i])
    # Extend along the real merge ramp: keep walking outward while the pit keeps
    # approaching the main (distance decreasing) and hasn't yet run onto it (> floor).
    while start > 0 and dist[start - 1] < dist[start] and dist[start - 1] > floor:
        start -= 1
    while end < n - 1 and dist[end + 1] < dist[end] and dist[end + 1] > floor:
        end += 1
    if end - start < 4:
        return 0, n - 1
    return start, end


def _smoothing_window(pts, radius_m=8.0):
    """How many neighbouring points to average on each side to cover ~radius_m of track,
    given this track's own point spacing (which varies from ~2 to ~12 m across the 28
    tracks — a fixed point-count window would over- or under-smooth depending on track)."""
    n = len(pts)
    if n < 3:
        return 0
    total = 0.0
    for i in range(1, n):
        a, b = pts[i - 1], pts[i]
        total += ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5
    avg_spacing = total / (n - 1) or 1.0
    return max(1, round(radius_m / avg_spacing))


def _smooth_scalar(vals, closed, window):
    """Centred moving average. Nearest-gate matching (compute_widths/compute_banking)
    snaps to one of a few dozen gates, so several consecutive centreline points share the
    exact same value and then jump — a staircase that, laid over a curving centreline,
    shows up as a visible sawtooth on the rendered edge. Smoothing turns each step into
    the gradual ramp real track width/banking transitions actually are."""
    n = len(vals)
    if window <= 0 or n < 3:
        return list(vals)
    out = []
    for i in range(n):
        acc, cnt = 0.0, 0
        for k in range(-window, window + 1):
            j = i + k
            if closed:
                j %= n
            elif j < 0 or j >= n:
                continue
            acc += vals[j]
            cnt += 1
        out.append(acc / cnt)
    return out


def _smooth_pairs(pairs, closed, window):
    left = _smooth_scalar([p[0] for p in pairs], closed, window)
    right = _smooth_scalar([p[1] for p in pairs], closed, window)
    return [[round(a, 2), round(b, 2)] for a, b in zip(left, right)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for slug, (track_id, name) in sorted(TRACKS.items(), key=lambda kv: kv[1][0]):
        folder = SRC / f"{slug}_common_erp_xmlfiles"
        spline = next(folder.rglob("*trackspacespline.xml"), None) if folder.exists() else None
        if spline is None:
            print(f"  SKIP {slug:18s} (no spline)")
            continue
        pts = parse_named_spline(spline, "maintrack")
        if not pts:
            print(f"  SKIP {slug:18s} (no knots)")
            continue
        pit_pts = parse_named_spline(spline, "pit_1")
        drs_zones, xmode_zones, sectors = parse_markup_zones(folder)
        main_gates, pit_gates = parse_aispline_gates(folder)
        space_main_gates, space_pit_gates = parse_trackspacedata_gates(folder)
        road_w, kerb_w = compute_widths(pts, main_gates, closed=True)
        bank = compute_banking(pts, space_main_gates, closed=True)

        # Pick the pit slice to draw: the separated lane plus its real entry/exit ramps.
        if pit_pts:
            ps, pe = pit_render_range(pit_pts, pts, road_w)
            pit_pts = pit_pts[ps:pe + 1]
        pit_road_w, pit_kerb_w = compute_widths(pit_pts, pit_gates, closed=False)
        pit_bank = compute_banking(pit_pts, space_pit_gates, closed=False)
        # Cap the spurious track-width values the ramps pick up near the main straight, so
        # the overlap at the mouth stays a lane-width sliver (no wide duplicate, no spike).
        pit_road_w = [[min(w[0], PIT_HALF_MAX), min(w[1], PIT_HALF_MAX)] for w in pit_road_w]
        pit_kerb_w = [[min(w[0], PIT_HALF_MAX), min(w[1], PIT_HALF_MAX)] for w in pit_kerb_w]

        # Nearest-gate matching snaps several consecutive points to the same value, then
        # jumps — smooth that staircase into the gradual ramp real width/banking is, else
        # it renders as a sawtooth on the curving centreline (see conversation: reported
        # as "jagged borders" on Zandvoort's ribbon).
        main_window = _smoothing_window(pts)
        road_w = _smooth_pairs(road_w, True, main_window)
        kerb_w = _smooth_pairs(kerb_w, True, main_window)
        kerb_w = [[max(k[0], r[0]), max(k[1], r[1])] for k, r in zip(kerb_w, road_w)]
        bank = [round(v, 4) for v in _smooth_scalar(bank, True, main_window)]
        if pit_pts:
            pit_window = _smoothing_window(pit_pts)
            pit_road_w = _smooth_pairs(pit_road_w, False, pit_window)
            pit_kerb_w = _smooth_pairs(pit_kerb_w, False, pit_window)
            pit_kerb_w = [[max(k[0], r[0]), max(k[1], r[1])] for k, r in zip(pit_kerb_w, pit_road_w)]
            pit_bank = [round(v, 4) for v in _smooth_scalar(pit_bank, False, pit_window)]

        max_bank_deg = math.degrees(max((abs(math.atan(s)) for s in bank), default=0.0))
        corners = parse_corners(folder)
        pit_merge = compute_pit_merge_fractions(pts, pit_pts)

        all_xs = [p[0] for p in pts] + [p[0] for p in pit_pts]
        all_ys = [p[1] for p in pts] + [p[1] for p in pit_pts]
        all_zs = [p[2] for p in pts] + [p[2] for p in pit_pts]
        ys = [p[1] for p in pts]
        # Ground-plane polyline length (sum of XZ segment lengths, loop closed).
        length = 0.0
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            length += ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5
        data = {
            "trackId": track_id,
            "slug": slug,
            "name": name,
            "closed": True,
            "points": pts,
            "roadWidth": road_w,
            "kerbWidth": kerb_w,
            "bank": bank,
            "bounds": {
                "minX": min(all_xs), "maxX": max(all_xs),
                "minY": min(all_ys), "maxY": max(all_ys),
                "minZ": min(all_zs), "maxZ": max(all_zs),
            },
            "lengthM": round(length, 1),
            "elevMin": min(ys), "elevMax": max(ys),
            "drsZones": drs_zones,
            "xModeZones": xmode_zones,
            "sectors": sectors,
            "corners": corners,
            "pitLane": {
                "points": pit_pts,
                "roadWidth": pit_road_w,
                "kerbWidth": pit_kerb_w,
                "bank": pit_bank,
                "mergeAt": pit_merge,
            } if pit_pts else None,
        }
        (OUT / f"{track_id}.json").write_text(
            json.dumps(data, separators=(",", ":")), encoding="utf-8")
        index.append({
            "trackId": track_id, "slug": slug, "name": name,
            "knots": len(pts), "lengthM": round(length, 1),
            "elevSpanM": round(max(ys) - min(ys), 1),
            "bankMaxDeg": round(max_bank_deg, 1),
        })
        print(f"  ok   {slug:18s} id={track_id:<3d} knots={len(pts):<4d} "
              f"len={length/1000:.2f}km elev={max(ys)-min(ys):.0f}m "
              f"drs={len(drs_zones)} xmode={len(xmode_zones)} "
              f"gates={len(main_gates)}/{len(pit_gates)} pit_knots={len(pit_pts)} "
              f"bank_max={max_bank_deg:.1f}deg (space_gates={len(space_main_gates)}/{len(space_pit_gates)}) "
              f"corners={len(corners)} sectors={sum(1 for s in sectors if s)} "
              f"pit_merge={pit_merge}")

    (OUT / "index.json").write_text(
        json.dumps(sorted(index, key=lambda e: e["trackId"]), separators=(",", ":")),
        encoding="utf-8")
    print(f"\nWrote {len(index)} tracks + index.json -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    sys.exit(main())
