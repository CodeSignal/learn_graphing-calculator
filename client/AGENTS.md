# Repository Contribution Guidelines – Client Layer
This directory holds all frontend code for CodeSignal CosmoPlot. If you add or
change behavior here, update this file. Use the design-system first; custom
styling is a last resort.

## Layout & entry points
1. `index.html`: Declares the DS styles, base layout (header, sidebar, canvas
   area), and loads `app.js`. Keep placeholders minimal; app-specific changes
   belong in JS/CSS, not duplicated HTML.
2. `app.js`: Bootstraps StateManager, GraphEngine, sidebar components, help
   modal. It is the only place that should instantiate the app; do not spin up
   parallel apps.
3. CSS:
   - `app.css`: base layout, utilities, and custom overrides. Uses design system
     tokens and variables.

## Design System usage
- Use components from `design-system/components/*` (buttons, modal,
  numeric-slider, dropdown, tags, input, boxes). Avoid reinventing UI. Do not
  modify DS assets directly.
- New UI should keep DS class names and spacing/typography tokens
  (`--UI-Spacing-*`, `--Colors-*`).

## Interaction model
- State flows through `core/state-manager.js`; events through `core/event-bus.js`.
- App initialization must call `EventBus.setStateManager(StateManager)` before components
  subscribe with `{ immediate: true }` or rely on bubbled parent `state:changed:*` payloads.
- GraphEngine listens to:
  - `state:changed` for viewport resets
  - `expression:updated` for live expression edits
  - `state:changed:functions` for add/remove/reorder (triggers parameter
    detection)
  - `parameters:updated` for slider-driven value changes
- ExpressionList publishes `expression:updated` when inputs change.
- GraphEngine detects parameters from graph lines (symbols beyond `x/y`) and:
  1. Ensures `parameters[paramName] = { value, min, max, step }`
  2. Auto-creates assignment expressions (e.g., `a = 1.0`) for missing params
  3. ExpressionList renders sliders and inline range settings for assignment
     lines
- Assignment lines never plot; only graph lines render.

## Utilities
- Line classification lives in `math/line-classifier.js` and is the single
  source of truth for line kinds.
- `state.functions` entries may include derived classification metadata
  (`kind`, `error`, `paramName`, `value`, `usedVariables`, `plotExpression`,
  `verticalLineX`) normalized by ExpressionList.
- `math/shared-parser.js` provides a shared ExpressionParser instance for
  caching across components.
- ExpressionList still uses `ExpressionParser.isParameter()` for optional
  auto-conversion of bare params.

## Controls & expressions
- Primary config: `configs/config.json` (loaded first). Fallback:
  `configs/default-config.js` (used when JSON unavailable).
- Example configurations: `configs/samples/` contains example JSON files for
  reference; keep schema consistent with `config.json`.
- GraphEngine's `detectAndUpdateParameters()` automatically:
  - Detects parameters from graph lines (variables other than `x` and `y`)
  - Ensures `parameters` entries for new parameters (value/min/max/step)
  - Auto-creates assignment expressions (e.g., `a = 1.0`) for parameters that
    don't already have assignments
  - Uses debouncing (300ms) to prevent rapid-fire updates during typing
- ExpressionList renders sliders for assignment expressions and inline range
  settings (min/max/step).
- When you add a new UI control, either predefine it in config or ensure
  GraphEngine's variable detection handles it without render loops.

## ExpressionList activity logging
- ExpressionList logs user actions via `Logger.logActivity()` for create,
  modify, and delete operations.
- **Commit-boundary logging**: Logs are emitted only on commit boundaries to
  avoid spam:
  - **Text edits**: State updates happen live on each keystroke (for responsive
    graph updates), but logging occurs only on commit (`blur` event or Enter
    key). The component tracks `editStartExpression` when entering edit mode
    and compares old vs new on commit.
  - **Slider edits**: For parameter sliders (assignment expressions like
    `a = 1.0`), logging occurs once per interaction end (mouseup/touchend) or
    for discrete changes (track click/keyboard). During drag, intermediate
    values update state but do not trigger logs.
- Log messages:
  - Create: `Created expression ${id}`
  - Modify (text): `Modified expression ${id}: ${oldExpression} ->
    ${newExpression}` (or with `(invalid: ${error})` suffix if validation
    fails)
  - Modify (slider): `Modified expression ${id} (parameter: ${paramName}):
    ${oldExpr} -> ${newExpr}`
  - Delete: `Deleted expression: ${expressionText}`
- This ensures logs capture user intent (one log per logical action) rather
  than intermediate state changes.

## Build/run (delegated to root commands)
- Dev: `npm run start:dev` (Vite on 3000, API on 3001 via proxy).
- Prod: `npm run build` then `npm run start:prod`.

## Gotchas
- LineClassifier enforces `x` for graph lines; `y = ...` is allowed, `y`
  elsewhere is invalid.
- Assignment lines must be constants (no `x` on the RHS).
- Canvas sizing depends on parent flex; avoid inline styles that break 100%
  width/height.
- Sidebar resizing uses mouse events; keep resizer element present and avoid CSS
  that removes its hit area.

## Documentation
- If you touch anything under `client/`, update this file and the nearest
  deeper `AGENTS.md` (core, math, configs) with the new realities. If you don’t,
  you’re leaving traps for the next engineer.
