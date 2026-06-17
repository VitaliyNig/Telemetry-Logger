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
- Data widgets (Session/Tyres/etc.) are NOT extracted — out of scope until ported.
- `esbuild` is pinned in `design-system` devDependencies only for the styles.css compile
  step; if that step is removed, the CSS scrape fails and styles vanish from designs.
