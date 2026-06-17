## Setup

No provider or root wrapper is required — every component is self-contained (no Context, no theme injection). Just load React/ReactDOM, then the bundle, then the stylesheet:

```html
<script src="react.js"></script>
<script src="react-dom.js"></script>
<script src="_ds_bundle.js"></script>
<link rel="stylesheet" href="styles.css">
```

Components carry their own internal CSS classes (`.btn`, `.toggle-switch`, `.widget-wrapper`, …) applied via props — never apply those class names yourself from outside; drive appearance through the component's own props (`variant`, `size`, `state`, `layout`) instead.

## Styling idiom

This is a dark telemetry-dashboard design language driven by CSS custom properties (tokens), not a utility-class system. For your own layout glue — containers, spacing between widgets, custom panels — reach for the tokens directly with `var(--token-name)`:

| Purpose | Tokens |
|---|---|
| Surfaces | `--color-bg-base`, `--color-bg-surface`, `--color-bg-elevated`, `--color-bg-card` |
| Text | `--color-text-primary`, `--color-text-secondary`, `--color-text-muted` |
| Accent | `--color-accent-primary`, `--color-accent-primary-hover`, `--color-accent-glow` |
| Semantic | `--color-semantic-success`, `--color-semantic-warning`, `--color-semantic-info`, `--color-semantic-danger` |
| Spacing | `--space-1` (4px) … `--space-6` (24px) |
| Radius | `--radius-sm`, `--radius-md`, `--radius-lg` |
| Type | `--font-sans`, `--font-mono` |
| Motion | `--motion-fast`, `--motion-normal`, `--motion-slow` |

Telemetry-specific hues are also available for data visualizations: `--throttle`, `--brake`, `--ers`, `--drs`. (The bundle also carries `--bg-primary`/`--text-primary`/etc. legacy aliases kept only for back-compat with the original app — prefer the `--color-*`/`--space-*` names above in new work.)

## Where the truth lives

`styles.css` is the single entry point — it `@import`s `_ds_bundle.css`, which is the resolved closure of `tokens.css` plus every component's CSS. Read it before styling anything by hand. For a specific component's props and usage, read `components/<group>/<Name>/<Name>.prompt.md`.

## Example

Composing a settings panel from the real primitives:

```jsx
const { WidgetShell, SettingRow, ToggleSwitch, Select, Badge } = window.TelemetryDS;

function SettingsPanel() {
  return (
    <WidgetShell title="Display">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <SettingRow label="UDP format" hint="Restart required to apply">
          <Select
            options={[{ value: "2024", label: "F1 24" }, { value: "2025", label: "F1 25" }]}
          />
          <Badge variant="warning">Restart required</Badge>
        </SettingRow>
        <SettingRow label="Show debug tab" layout="toggle">
          <ToggleSwitch defaultChecked={false} />
        </SettingRow>
      </div>
    </WidgetShell>
  );
}
```
