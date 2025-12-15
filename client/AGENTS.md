# Repository Contribution Guidelines – Client Layer
This directory holds all frontend code for MathGraph. If you add or change behavior here, update this file. Use the design-system first; custom styling is a last resort.

## Layout & entry points
1. `index.html`: Declares the DS styles, base layout (header, sidebar, canvas area), and loads `app.js`. Keep placeholders minimal; app-specific changes belong in JS/CSS, not duplicated HTML.
2. `app.js`: Bootstraps StateManager, GraphEngine, sidebar components, help modal. It is the only place that should instantiate the app; do not spin up parallel apps.
3. CSS:
   - `app.css`: base layout, utilities, and custom overrides. Uses design system tokens and variables.

## Design System usage
- Use components from `design-system/components/*` (buttons, modal, numeric-slider, dropdown, tags, input, boxes). Avoid reinventing UI. Do not modify DS assets directly.
- New UI should keep DS class names and spacing/typography tokens (`--UI-Spacing-*`, `--Colors-*`).

## Interaction model
- State flows through `core/state-manager.js`; events through `core/event-bus.js`.
- GraphEngine listens to:
  - `state:changed` for viewport resets
  - `expression:updated` for live expression edits
- ExpressionList publishes `expression:updated` when inputs change.
- GraphEngine auto-adds slider controls for symbols beyond `x/y`; ensure expressions remain parsable.

## Utilities
- `utils/expression-detector.js`: Provides `isSingleVariable()` and `isAssignmentExpression()` for detecting variable names and assignment expressions (e.g., `a = 5`). Used by ExpressionList for auto-converting single variables to assignments and handling assignment expressions in the UI.

## Controls & expressions
- Default expressions live in `configs/default-config.js` only. Legacy JSON samples stay unused until a loader is wired; keep schema consistency if you revive them.
- When you add a new UI control, either predefine it in config or ensure GraphEngine’s variable detection handles it without render loops.

## Build/run (delegated to root commands)
- Dev: `npm run start:dev` (Vite on 3000, API on 3001 via proxy).
- Prod: `npm run build` then `npm run start:prod`.

## Gotchas
- ExpressionParser currently demands variable `x`; non-`x` parameters are fine but `x` is mandatory.
- Canvas sizing depends on parent flex; avoid inline styles that break 100% width/height.
- Sidebar resizing uses mouse events; keep resizer element present and avoid CSS that removes its hit area.

## Documentation
- If you touch anything under `client/`, update this file and the nearest deeper `AGENTS.md` (core, math, configs) with the new realities. If you don’t, you’re leaving traps for the next engineer.
