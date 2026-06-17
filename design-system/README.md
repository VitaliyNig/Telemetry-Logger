# Telemetry Logger Design System

React component library extracted from the Telemetry Logger web UI
(`src/F1Telemetry.Host/wwwroot`). Built so a future `/design-sync` run has a real
Storybook to convert and upload to claude.ai/design.

## Stack

- React 18 + TypeScript
- Vite (library build)
- Storybook 8 (`@storybook/react-vite`)

Design tokens (`src/tokens.css`) are copied verbatim from the app's
`wwwroot/css/tokens.css`. Component CSS is ported 1:1 from `app.css` / `style.css`
and reachable through the single `src/styles.css` `@import` closure.

## First pass scope

Primitives + the widget shell:

| Component | Source class(es) |
|---|---|
| `Button` | `.btn`, `.btn-primary/secondary/ghost/danger`, `.btn-small` |
| `ToggleSwitch` | `.toggle-switch`, `.toggle-slider` |
| `TabNav` | `.tab-nav`, `.tab-btn` |
| `ConnectionPill` | `.connection-pill[data-state]` |
| `Select` | `.setting-row select` → standalone `.select-field` |
| `Badge` | `.restart-badge`, `.history-folder-badge` |
| `SettingRow` | `.setting-row`, `.setting-toggle` |
| `WidgetShell` | `.widget-wrapper`, `.widget-header`, … |

Data widgets (Session, Tyres, Lap Data, …) are intentionally out of scope for
this pass; they're tightly coupled to live telemetry state.

## Develop

```bash
cd design-system
npm install
npm run storybook       # dev server on :6006
npm run build-storybook # static build (CI / design-sync verification)
npm run build           # library build → dist/
```
