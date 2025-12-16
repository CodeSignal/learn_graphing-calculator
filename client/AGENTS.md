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
- GraphEngine detects parameters from expressions (symbols beyond `x/y`) and:
  1. Creates entries in `controls` state for new parameters (default value: 1.0)
  2. Auto-creates assignment expressions (e.g., `a = 1.0`) for newly detected parameters if no assignment already exists
  3. ExpressionList then renders sliders for these assignment expressions
- This ensures that typing expressions like `a * sin(b * x)` automatically creates sliders for `a` and `b`.

## Utilities
- Expression detection is handled by `math/expression-parser.js` (see math layer docs). ExpressionList uses `ExpressionParser.isSingleVariable()` and `ExpressionParser.isAssignmentExpression()` for auto-converting single variables to assignments and handling assignment expressions in the UI.

## Controls & expressions
- Primary config: `configs/config.json` (loaded first). Fallback: `configs/default-config.js` (used when JSON unavailable).
- Example configurations: `configs/samples/` contains example JSON files for reference; keep schema consistent with `config.json`.
- GraphEngine's `detectAndUpdateParameters()` automatically:
  - Detects parameters from all expressions (variables other than `x` and `y`)
  - Creates `controls` entries for new parameters
  - Auto-creates assignment expressions (e.g., `a = 1.0`) for parameters that don't already have assignments
  - Uses debouncing (300ms) to prevent rapid-fire updates during typing
- ExpressionList renders sliders for assignment expressions, creating the UI controls for parameters.
- When you add a new UI control, either predefine it in config or ensure GraphEngine's variable detection handles it without render loops.

## Build/run (delegated to root commands)
- Dev: `npm run start:dev` (Vite on 3000, API on 3001 via proxy).
- Prod: `npm run build` then `npm run start:prod`.

## Gotchas
- ExpressionParser currently demands variable `x`; non-`x` parameters are fine but `x` is mandatory.
- Canvas sizing depends on parent flex; avoid inline styles that break 100% width/height.
- Sidebar resizing uses mouse events; keep resizer element present and avoid CSS that removes its hit area.

## Documentation
- If you touch anything under `client/`, update this file and the nearest deeper `AGENTS.md` (core, math, configs) with the new realities. If you don’t, you’re leaving traps for the next engineer.
