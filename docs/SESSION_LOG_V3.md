# Session Log Schema v3 — Split Storage

## Problem (v2)

One monolithic `{slug}.json` holds everything, including 20 Hz samples and 10 Hz motion for
all 24 cars. A full race distance produces ~185 MB of uncompressed JSON, which causes:

1. **Checkpoint churn** — the whole file is rewritten every 5 player laps
   (`FlushEveryNPlayerLaps`), so total disk writes per race are measured in gigabytes.
2. **Cold-open cost** — the detail endpoint needs ~1 % of the file but must parse all of it.
3. **RAM** — samples for the whole session stay in the logger's memory (~100 MB+ live),
   and `HistoryReader` caches whole parsed sessions.

## Design

Two files per session in the weekend folder:

| File | Contents | Format |
|---|---|---|
| `{slug}.json` | meta, driver lap summaries (+ per-lap `perf`, `sref`), tyres, lapHistories, events, finalClassification, packets snapshot | plain JSON (schema v3) |
| `{slug}.samples` | per-lap sample blobs | concatenated **independent gzip members** |

### Sidecar format

A sequence of length-prefixed frames: `[len: int32 LE][gzip member of len bytes]`. Each
member decompresses to one self-describing JSON object:

```json
{ "carIdx": 3, "lapNum": 12, "samples": [ ...LapSample ], "motion": [ ...MotionSample ] }
```

* Appended when a lap completes, on the `SessionLoggerWriter` thread (single writer).
* The main file's lap record stores `sref: { o, l }` — frame start offset and gzip length.
* **Random access:** read one lap = `Seek(o + 4)` + decompress `l` bytes (~ms). The length
  prefix also makes sequential scans trivial (repair/migration tooling) without having to
  detect gzip member boundaries by trial decompression.
* **Flashback / rewind:** the game can re-complete an existing lap. The new blob is
  appended and `sref` re-pointed; the orphaned member stays as dead bytes (negligible).
* The `.samples` extension is intentionally not `.json` so the History listing
  (`GetFiles(dir, "*.json")`) never sees it.

### Write path changes

On lap completion (before buffers are dropped):
1. Compute per-lap **Perf** (ERS/DRS aggregate — logic extracted from `Program.ComputeLapPerf`
   into a shared, testable calculator) and store it on the lap.
2. Fold the lap's motion into **running TrackBounds** (v2 recomputed bounds from all motion
   at write time; v3 no longer has it in RAM).
3. Serialize + gzip the blob, append to the sidecar, set `sref`.
4. Drop `Samples`/`Motion` from RAM.

The checkpoint now rewrites only the small main file (~1–3 MB), so its cadence changes from
**every 5 player laps to every player lap** — the crash-loss window shrinks from 5 laps to 1
while writing *less* than v2 wrote per checkpoint.

### Crash recovery

Sidecar appends happen before the main-file checkpoint that references them, so `sref`s in
the main file are always valid. A crash between an append and the next checkpoint leaves at
most ~1 lap of orphaned members in the sidecar — treated as dead bytes (same as flashback
orphans), because a lap summary that never reached the main file is unrecoverable anyway.
A truncated final frame (crash mid-append) is skipped by the length-prefix check.

### Read path changes

* `meta.schemaVersion`: `3` = split; absent/`0`/`2` = v2 monolith. **v2 files remain readable
  forever; nothing is migrated automatically.**
* `HistoryReader.Load` caches only the main graph (small). LRU pressure disappears.
* `/lap-samples` — v3: targeted sidecar member read; v2: inline as before.
* Detail `perf` — v3: stored value; if it was computed without DRS zones
  (`drsZoneBased == false`) and zones exist now for the track, recompute lazily from the
  sidecar. Zones come from the static track-geometry files (`drsZones` / `xModeZones`),
  selected by packet format. v2: computed on read, as before.
* Ghost **export** hydrates inline samples from the sidecar, so the exported payload — and
  the whole `_ghosts/` import path — keeps the existing v2-compatible shape. No format
  change for ghosts.
* Front-end: **zero changes** — all endpoint payload shapes are identical.

## Expected numbers (full race, 24 cars)

| Metric | v2 | v3 |
|---|---|---|
| On disk | ~185 MB | ~2–4 MB main + ~15–25 MB sidecar |
| Checkpoint write | ~185 MB × every 5 laps | ~3 MB × every 5 laps |
| Live logger RAM (samples) | ~100 MB+ | ~one lap per car |
| Detail cold open | parse 185 MB | parse ~3 MB |
| One lap of samples | (inline) | seek + ~150 KB member decompress |

## Trade-offs accepted

* Stored `perf` can go stale if the track-geometry zone data changes after recording —
  mitigated by the lazy recompute above; full recompute is always possible since raw samples
  are retained.
* Dead gzip members after flashbacks waste a few hundred KB per rewound lap.
* Two files must travel together; weekend-folder delete already covers both.

## Out of scope (follow-ups)

* Migration of existing v2 logs (optional tool/button; v2 stays readable regardless).
* Compressing the main file (kept plain for the 256 KB meta fast-path and inspectability).
