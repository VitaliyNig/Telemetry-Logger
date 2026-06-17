# design-sync notes

## Shape / layout
- **Shape: `storybook`** (pinned in `design-sync.config.json`). Storybook config at
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

## Verification (first sync, 2026-06-17)
- build + validate exit clean: 8/8 components, 8/8 previews render, tokens resolve,
  no FONT/CSS warnings. render-check: total 8, bad 0, thin 0, variantsIdentical 0.
- compare vs reference storybook: all 29 stories graded `match`; final run = 8 carried
  forward, 0 awaiting grade, 0 factual failures.

## Re-sync risks
- **Upload not yet done.** First sync verified locally but the upload is blocked: this
  session authenticates via `CLAUDE_CODE_OAUTH_TOKEN`, which can't get design scopes.
  Upload requires an interactive `/login` session. No project exists yet, so
  `design-sync.config.json` has no `projectId` — the next (logged-in) run still uploads
  fresh, then records `projectId`.
- Data widgets (Session/Tyres/etc.) are NOT extracted — out of scope until ported.
- `esbuild` is pinned in `design-system` devDependencies only for the styles.css compile
  step; if that step is removed, the CSS scrape fails and styles vanish from designs.
