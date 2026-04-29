# Design tokens guideline

Use shared tokens from `wwwroot/css/tokens.css` for all new widgets.

## Core usage
- Card/surface backgrounds: `--color-bg-card`, `--color-bg-card-alt`.
- Accent/focus/active states: `--color-accent-primary`, `--color-accent-primary-hover`, `--color-accent-soft`, `--color-accent-border`.
- Text hierarchy: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-dim`.
- Interactive states and semantics: `--color-semantic-success`, `--color-semantic-warning`, `--color-semantic-danger`.

## Layout + shape
- Spacing scale only: `--space-1..--space-6`.
- Radius scale only: `--radius-sm`, `--radius-md`, `--radius-lg`.

## Typography + motion
- Sans text: `--font-sans`; numeric/telemetry text: `--font-mono`.
- Motion tokens: `--motion-fast`, `--motion-normal`, `--motion-slow`.

## Compatibility note
Legacy variables are aliased in `tokens.css`; new code should use `--color-*`, `--space-*`, `--radius-*`, `--font-*`, `--motion-*` names.
