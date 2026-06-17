#!/usr/bin/env python3
"""Convert F1 game track centreline splines into compact per-track JSON for the 3D map.

Reads the authored `*.trackspacespline.xml` (the "maintrack" centreline, ~600 knots of
world-space X, Y, Z in metres) shipped under docs/tracks/ and writes one JSON per F1 UDP
trackId into the host's wwwroot so the frontend can fetch it directly.

World coordinates match the UDP Motion `worldPosition` frame 1:1 (verified against a
Catalunya session log), so X/Z need no transform and Y is true elevation.

Run from the repo root:  python tools/convert_track_geometry.py
"""
import json
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
    """Extract DRS activation and Straight-Mode (x_mode) zones from the track markup,
    as merged normalised lap-fraction intervals along the maintrack spline."""
    mk = next(folder.rglob("*trackmarkup.xml"), None) if folder.exists() else None
    if mk is None:
        return [], []
    text = mk.read_text(encoding="utf-8", errors="replace")
    drs, xmode = [], []
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
    return _merge_intervals(drs), _merge_intervals(xmode)


def parse_maintrack(xml_path: Path):
    text = xml_path.read_text(encoding="utf-8", errors="replace")
    # Isolate the maintrack spline block if multiple TrackSpaceSpline nodes exist.
    blocks = re.split(r'<TrackSpaceSpline\b', text)
    chosen = None
    for b in blocks[1:]:
        if 'name="maintrack"' in b:
            chosen = b
            break
    if chosen is None and len(blocks) > 1:
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for slug, (track_id, name) in sorted(TRACKS.items(), key=lambda kv: kv[1][0]):
        folder = SRC / f"{slug}_common_erp_xmlfiles"
        spline = next(folder.rglob("*trackspacespline.xml"), None) if folder.exists() else None
        if spline is None:
            print(f"  SKIP {slug:18s} (no spline)")
            continue
        pts = parse_maintrack(spline)
        if not pts:
            print(f"  SKIP {slug:18s} (no knots)")
            continue
        drs_zones, xmode_zones = parse_markup_zones(folder)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        zs = [p[2] for p in pts]
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
            "bounds": {
                "minX": min(xs), "maxX": max(xs),
                "minY": min(ys), "maxY": max(ys),
                "minZ": min(zs), "maxZ": max(zs),
            },
            "lengthM": round(length, 1),
            "elevMin": min(ys), "elevMax": max(ys),
            "drsZones": drs_zones,
            "xModeZones": xmode_zones,
        }
        (OUT / f"{track_id}.json").write_text(
            json.dumps(data, separators=(",", ":")), encoding="utf-8")
        index.append({
            "trackId": track_id, "slug": slug, "name": name,
            "knots": len(pts), "lengthM": round(length, 1),
            "elevSpanM": round(max(ys) - min(ys), 1),
        })
        print(f"  ok   {slug:18s} id={track_id:<3d} knots={len(pts):<4d} "
              f"len={length/1000:.2f}km elev={max(ys)-min(ys):.0f}m "
              f"drs={len(drs_zones)} xmode={len(xmode_zones)}")

    (OUT / "index.json").write_text(
        json.dumps(sorted(index, key=lambda e: e["trackId"]), separators=(",", ":")),
        encoding="utf-8")
    print(f"\nWrote {len(index)} tracks + index.json -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    sys.exit(main())
