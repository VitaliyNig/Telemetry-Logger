# design-sync notes

## Shape / layout
- **Shape: `storybook`** (pinned in `.design-sync/config.json`, moved there from the
  legacy `design-sync.config.json` root path on 2026-06-17). Storybook config at
  `design-system/.storybook/`; converter runs **from repo root** so `.design-sync/`
  and `storybookStatic` resolve correctly (running it from inside `.ds-sync/` makes
  the converter rebuild storybook itself into `ds-bundle/.sb-static` — wrong + slow).
- Package: `@telemetry-logger/design-system` in `design-system/`, global `TelemetryDS`.
  It's the DS's own source repo (no `node_modules/<pkg>`), so the converter is run with
  `--entry design-system/dist/index.js` + `--node-modules design-system/node_modules`.
- 8 storied primitives: Button, ToggleSwitch, TabNav, ConnectionPill, Select, Badge,
  SettingRow, WidgetShell. No portals/overlays, no data-fetching stories.

## Build knobs (why the config/build look the way they do)
- **Build order matters**: `package.json` build is `vite build && tsc && esbuild`.
  `vite build` empties `dist/`, so `tsc` (declaration emit) MUST run *after* vite or the
  converter parses 0 `.d.ts` and finds 0 components. Don't reorder back.
- **CSS**: component CSS isn't imported by the JS bundle, and Storybook+Vite injects CSS
  via JS (no static `.css` asset to scrape), so the converter found no styles. Fix: the
  build's `esbuild src/styles.css --bundle` step emits `dist/styles.css` (resolves the
  `@import` closure: tokens + all component CSS), and `cfg.cssEntry: "dist/styles.css"`
  (package-relative) points the converter at it. This is the `_ds_bundle.css` shipped to designs.

## Verification (first sync, completed 2026-06-17)
- build + validate exit clean: 8/8 components, 8/8 previews render, tokens resolve,
  no FONT/CSS warnings. render-check: total 8, bad 0, thin 0, variantsIdentical 0.
- compare vs reference storybook: all 29 stories graded `match`; final driver run = 8
  carried forward, 0 awaiting grade, 0 factual failures.
- `cfg.overrides`: `SettingRow` and `TabNav` both need `{"cardMode": "column"}` — their
  stories render wider than a grid cell ([GRID_OVERFLOW]); without it the product card
  crops them. Presentation-only, grades carried through the fix.
- `.design-sync/conventions.md` authored and wired via `cfg.readmeHeader`. Covers: no
  provider/wrapper needed (every component is self-contained); the styling idiom is
  CSS-custom-property tokens, not utility classes (components apply their own internal
  classes like `.btn`/`.widget-wrapper` via props — never write those classes from
  outside); a real composed example (WidgetShell + SettingRow + ToggleSwitch + Select +
  Badge). Validated every named class/token against the compiled `_ds_bundle.css`
  before shipping.
- **Uploaded** to Claude Design project "Telemetry Logger Design System"
  (`projectId` in `.design-sync/config.json`) — incremental path, single batch (all 8
  components were already verified, so there was no progressive-batch reason to split
  the push). `https://claude.ai/design/p/2601881a-868d-466e-b712-911d3495d17d`

## Verification (second sync, completed 2026-06-18)
- Added 19 components (8→27 total): atoms DeltaDisplay/EventBadge/GaugeBar/Popover/
  StatBox/TyreCompoundBadge, plus widgets Damage/FuelErs/GapBoard/PitPredictor/
  PitStopTimer/Session/Standings/Telemetry26/TopSpeed/TopSpeedCompare/Tyres/TyreSets/
  Weather. All 27 unchanged-or-new components: render-check total 27, bad 0, thin 0,
  variantsIdentical 0; all stories graded `match` (no `close`/`mismatch` this round).
- `cfg.overrides` grew from 2 to 10 `cardMode: "column"` entries — FuelErs, GapBoard,
  PitPredictor, Session, Standings, TopSpeedCompare, TyreSets, Weather all hit the same
  [GRID_OVERFLOW] crop as SettingRow/TabNav. Fixed the same way: add the override, then
  `node .ds-sync/lib/preview-rebuild.mjs --config .design-sync/config.json
  --node-modules design-system/node_modules --out ds-bundle --components <8 names>`
  (targeted rebuild, not a full resync) — confirms the SKILL's claim that column cards
  can't re-flag wide by construction, and that grades carry through untouched.
- Upload was scoped to `.sync-diff.json`'s actual diff (19 added components' dirs +
  their `_preview/*.js`, plus `_vendor/**` since `aux: true`, plus the bundle/styling/
  root files) — the 8 unchanged primitives (`changed: []`, listed under `unchanged`)
  were *not* re-sent; re-uploading byte-identical content they'd add no value and
  contradicts the tool's incremental-write intent.
- Full upload sequence used: `finalize_plan` → sentinel write (`_ds_needs_recompile`)
  → 99 changed-component files in one `write_files` call → 4 root files
  (`_ds_bundle.js`/`_ds_bundle.css`/`styles.css`/`README.md`) → sentinel re-arm →
  `_ds_sync.json` last, as the anchor. All under the 256-files/call cap, so no chunking
  was needed even unfiltered (139 files including the unchanged primitives).

## Re-sync risks
- **Environment is not durable between sessions.** This sync resumed a previous
  session's local-only verification, but in *this* session: Playwright's Chromium
  wasn't installed (`~/AppData/Local/ms-playwright` didn't exist — needed
  `npx playwright install chromium` before any render check could run), and the staged
  `.ds-sync/` scripts were a stale skill version missing `resync.mjs` entirely (had to
  re-`cp` the whole skill bundle over `.ds-sync/`, per §2.4/§7 step 1 — always do this,
  not just when something looks missing).
- Re-staging the scripts to a newer skill version triggered a grade-key migration:
  the driver flagged 5 components as `[SPOT_CHECK]`/needs-grade purely from internal
  key churn (no source change). Confirmed all sheets still showed pixel-identical
  storybook-vs-preview renders and re-wrote their `.grade.json` files as `match` — a
  second driver run then spot-checked Select/ToggleSwitch the same way. If this
  happens again on a future skill update, the same eyeball-and-reconfirm approach is
  correct (NOTES already says this clearly; don't treat it as a real regression).
- `esbuild` is pinned in `design-system` devDependencies only for the styles.css compile
  step; if that step is removed, the CSS scrape fails and styles vanish from designs.
- **Grading completeness: trust the driver's `pendingGrade` list, not your own tracking.**
  Second sync (2026-06-18) skipped Session entirely on the first grading pass (15
  components graded by hand, Session forgotten) and the driver caught it as
  `pendingGrade` with the exact missing story names — re-run resync.mjs after grading
  to confirm `pendingGrade: []` before assuming you're done.
- **Grade keys must equal story display names exactly, including spaces.** Wrote
  `"BottomEnd"` for Popover's "Bottom End" story; driver flagged
  `grade key(s) matching no story for Popover: BottomEnd`. Copy story names verbatim
  from the `.stories.tsx` file, don't camelCase/abbreviate them.
- **Storybook-side capture clips absolutely-positioned overflow.** `.ds-sync/storybook/
  compare.mjs` screenshots `#storybook-root`'s bounding box, which doesn't grow for
  children positioned `absolute` outside the flow (e.g. Popover's open panel when the
  trigger is near a viewport edge). This can make the sb-side screenshot look "closed"
  or clipped even when the story's default props are correct — verify against the
  component/story source before grading a `mismatch`; if the markup is right, it's a
  capture-method artifact, not a real bundle-vs-source divergence (see Popover's
  grade.json notes for the precedent).
## Verification (third sync, completed 2026-06-19)
- Added 16 components (27→43 total): CarTelemetry, LapData, EventsCard, GapRing,
  QualiStandings, LapTimesCard (live-tab template widgets); SettingsScreen (composed
  Settings tab screen); PacketStats, DebugConsole, DrsZonesTable (Debug tab);
  HistorySessionList, HistoryDetailShell, HistoryLapTimesGrid, HistoryEventsTable,
  HistoryLapChart (History tab); TelemetryChartStack (Telemetry Compare 2D chart
  stack). **This closes out the porting effort — every remaining wwwroot surface
  (live-tab templates, History, Settings, Debug) is now in `design-system/`.** No
  surfaces are left un-ported; future syncs are pure maintenance/redesign, not porting.
- `cfg.overrides` grew from 10 to 22 `cardMode: "column"` entries (the same
  [GRID_OVERFLOW] fix as before, for: SettingRow, TabNav, FuelErs, GapBoard,
  PitPredictor, Session, Standings, TopSpeedCompare, TyreSets, Weather, DebugConsole,
  DrsZonesTable, HistoryDetailShell, HistoryEventsTable, HistoryLapChart,
  HistoryLapTimesGrid, HistorySessionList, SettingsScreen, EventsCard, QualiStandings),
  plus two new override shapes:
  - **`LapTimesCard`: `{"cardMode": "single", "primaryStory": "QualifyingWithSetupOpen"}`**
    — this card has a setup popover (portal/overlay), so the default grid thumbnail
    needs to render as a single full card with the popover open to be a useful preview,
    not the column grid treatment. Graded exhaustively, story-by-story, no
    sibling-trust, per the skill's portal/overlay exception.
  - **`TelemetryChartStack`: `{"cardMode": "column", "viewport": "900x950"}`** — this
    component stacks 9 metric rows (Delta/Speed/Throttle/Brake/Steering/Gear/RPM/ERS/
    DRS) totaling ~889px tall, taller than the default 900x700 capture viewport. The
    storybook side captures via a full-element screenshot (unaffected by viewport), but
    the preview's per-story capture (`?story=` query param, always renders via
    `.ds-single`) is a *page* screenshot bound to the viewport — so without an override
    the bottom 3 rows (RPM/ERS/DRS) were silently cropped from the preview only. Fixed
    by sizing the viewport override to the tallest story's actual content height.
    **Rebuild-rule gotcha**: `viewport` (unlike `cardMode`/`primaryStory`) is part of
    the stamped grade-key contract — a targeted `preview-rebuild.mjs` fails with
    `[CONFIG_STALE]` after changing it; a full `resync.mjs` is required.
- **SettingsScreen's ~700px fold is intentional, not a capture bug.** Investigated at
  length (Playwright DOM probes on both the storybook iframe and the ds preview)
  before finding the real cause: `SettingsScreen.stories.tsx`'s meta-level `decorators`
  wraps every story in a fixed `height: 700, overflow: "auto"` div, deliberately
  mirroring the app's real fixed-height scrollable settings panel. Confirmed via DOM
  inspection that all content below the fold (Auto-configure, History Folder, Web Port
  rows) exists identically on both sides — just below an intentional scroll boundary.
  Do not add a `viewport` override here; it won't reveal more content (tried 900x1600,
  no effect) and isn't the right fix even if it did.
- Two components legitimately render *more* than their storybook reference without
  being a mismatch: **LapTimesCard**'s "Qualifying With Setup Open" story (storybook
  canvas clips the popover at the bottom; preview's single-card mode shows it in full)
  and **PacketStats**' "Default" story (storybook crops at 700px, cutting off the
  Download Log/Reset buttons that a 10-row table pushes below the fold; preview shows
  them). Rubric: a preview showing more than a gated/cropped reference is `match`, not
  `close`/`mismatch` — note it on the grade for future reviewers.
- All 43 components: render-check total 43, bad 0, thin 0; final driver run =
  `pendingGrade: []`, every story graded `match` (0 `close`/`mismatch`).
- Canary spot-check (FuelErs, GapBoard, TopSpeedCompare, Select, Session) reconfirmed
  `match` — these were carried forward byte-identical (no fresh sheets generated,
  which is the carry-forward mechanism working as intended, not a gap).
- `conventions.md` re-validated against the 43-component build (every named class,
  token, and example-snippet prop still resolves) — not rewritten, still accurate.

## Re-sync risks (continued)
- The `.ds-single` vs `.ds-cell`/`.ds-grid` rendering split: per-story capture
  (`?story=<label>`) always renders into `.ds-single` regardless of the configured
  `cardMode` — `cardMode` only changes the no-query-param default grid/stacked render
  used for the product-card thumbnail. Don't expect a `cardMode` change to affect
  per-story capture framing; that's what `viewport`/`primaryStory` are for.
- Before assuming a fold/crop is a capture-tooling bug (as with SettingsScreen above),
  check the component's own `.stories.tsx` for a `decorators` array — a fixed-size
  wrapper there is easy to mistake for a viewport limitation, and chasing the viewport
  knob wastes a full rebuild cycle for nothing.

## Verification (fourth sync, completed 2026-06-19)
- Added 9 components (43→52 total), all under `components/telemetry/`: CompareLapPicker,
  CompareModeToggle, FocusPanel, MapDeltaOverlay, SectorBadgesToolbar, TopLossZones,
  TrackMap3D, TransportControls, and the composed `TelemetryCompareScreen`. Together
  with the existing TelemetryChartStack, this is the full Telemetry Compare page.
- **Contract change**: `TelemetryChartStack` was retrofitted with controlled props (it
  previously owned its own metric-visibility/zoom state internally) so
  `TelemetryCompareScreen` and `SectorBadgesToolbar`/`TopLossZones` can drive it from
  shared state. Verified via the new "Synced With Toolbar" story, which shows the
  toolbar's channel selection correctly narrowing the chart stack's visible rows —
  confirmed `match` at full resolution, not just sibling-trusted.
- 6 new `cardMode: "column"` overrides (CompareLapPicker, CompareModeToggle,
  MapDeltaOverlay, TopLossZones, TrackMap3D, TransportControls) for the same
  [GRID_OVERFLOW] reason as prior syncs — fixed via override + targeted
  `preview-rebuild.mjs`, no re-validation needed.
- All 10 pending components graded from true screenshot comparisons: every story
  across every component came back `match` (no `close`/`mismatch`, no notes). The two
  most contract-sensitive components (TelemetryChartStack, TelemetryCompareScreen) were
  graded from full-resolution raw PNG pairs rather than the comparison sheet thumbnails.
- Canary spot-check (DebugConsole, TopSpeed, PitPredictor, LapTimesCard, FuelErs),
  triggered by `reference_drift`, reconfirmed `match` — no regrading needed.
- `conventions.md` re-validated against the 9 new/changed components (grepped for
  `createContext|Provider|useContext` — zero matches) — not rewritten, still accurate.
- Final driver run: `pendingGrade: []`, `canary: null`, `ok: true`. Atomic upload
  (project was non-empty — pinned `projectId` from prior syncs) in 3 content chunks
  (130 + 130 + 8 files, all under the 256-file cap) plus sentinel write/re-arm and
  `_ds_sync.json` last. No deletes (`upload.deletePaths` was empty).

## Status: Telemetry Compare page complete
All of wwwroot's UI surface, including the full Telemetry Compare page (3D track map,
lap picker, sector toolbar, transport controls, map delta overlay, focus panel, top
loss zones, mode toggle, and the composed screen), is now extracted into
`design-system/` (52 components). Future `/design-sync` runs are maintenance syncs
(catching source edits) or redesign work — there is no remaining "NOT extracted"
surface to track here.
