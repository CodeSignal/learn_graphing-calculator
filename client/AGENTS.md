# Repository Contribution Guidelines – Client Layer
This directory holds all frontend code for CodeSignal CosmoPlot. If you add or
change behavior here, update this file. Use the design-system first; custom
styling is a last resort.

## Layout & entry points
1. `index.html`: Declares the DS styles, base layout (header, sidebar, graph
   area), and loads `app.js`. Keep placeholders minimal; app-specific changes
   belong in JS/CSS, not duplicated HTML.
2. `app.js`: Bootstraps StateManager, GraphEngine, sidebar components, help
   modal. It is the only place that should instantiate the app; do not spin up
   parallel apps.
3. CSS:
   - `app.css`: base layout, utilities, and custom overrides. Uses design system
     tokens and variables. Keeps only one function-plot override: legend hidden
     (sidebar is our legend; no native option).

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
  - `state:changed:functions` for any expression change (typing, add/remove,
    reorder) -- this is the canonical signal for function edits and always
    triggers render; parameter detection is skipped while an expression input is
    focused
  - `expressions:committed` for commit-boundary parameter detection after
    typing (blur/Enter)
  - `parameters:updated` for slider-driven value changes
- GraphEngine detects parameters from graph lines (symbols beyond `x/y`) and:
  1. Ensures `parameters[paramName] = { value, min, max, step }`
  2. Auto-creates assignment expressions (e.g., `a = 1.0`) for missing params
  3. ExpressionList renders sliders and inline range settings for assignment
     lines
- Assignment lines never plot; only graph lines render.

## Components
- `components/expression-list.js`: Manages the list of mathematical expressions
  in the sidebar. Handles expression rendering, LaTeX display, input mode
  switching, visibility toggling, deletion, reordering, and auto-conversion of
  bare parameters to assignments. Publishes `expressions:committed` at text
  commit boundaries (blur/Enter). Delegates slider functionality to
  ParameterSlider.
- `components/parameter-slider.js`: Manages parameter slider UI for assignment
  expressions (e.g., `a = 1.0`). Owns slider DOM structure, wraps
  NumericSlider from design system, handles parameter config normalization,
  value formatting, settings panel (min/max/step), and interaction tracking for
  commit-boundary logging. Emits onChange callbacks with old/new values for
  ExpressionList to handle expression updates and logging.
- `renderers/function-plot-renderer.js`: Adapter over `function-plot` that owns
  chart init/rebuild/draw and forwards zoom events. Uses function-plot native
  axis ticks/labels, grid via options, and on-curve tip (crosshairs + tooltip).
  Accepts `tipRenderer` (function) and `annotations` (array) in `init()`;
  `rebuild()` also accepts `annotations` to update reference lines.
- GraphEngine enforces equal unit scale on X/Y during render by deriving an
  aspect-locked viewport from the canonical state viewport and current canvas
  size. Policy is fixed to expanding the smaller axis around center (never
  cropping). The canonical viewport in state is not mutated by resize-time
  aspect correction.

## Utilities
- Line classification lives in `math/line-classifier.js` and is the single
  source of truth for line kinds.
- `state.functions` entries may include derived classification metadata
  (`kind`, `graphMode`, `error`, `paramName`, `value`, `usedVariables`,
  `plotExpression`) normalized by ExpressionList.
- **Single-authority classification**: ExpressionList's `handleFunctionsUpdate`
  is the single authority for classification metadata and UI-specific overrides.
  It classifies all expressions on each `state:changed:functions` event and
  suppresses syntax errors for items where `isEditing === true` (hides partial
  expression errors while typing; surfaces them on blur). `updateExpression`
  writes honest metadata; suppression happens only in `handleFunctionsUpdate`.
- `math/shared-parser.js` provides a shared ExpressionParser instance for
  caching across components.
- `math/expression-adapter.js` is the single expression adaptation layer:
  `toFunctionPlotSyntax()` normalizes plot expressions for function-plot,
  `toDisplayLatex()` converts raw user input into polished LaTeX for display,
  `computeDerivative()` symbolically differentiates an explicit RHS expression
  w.r.t. `x` and returns a function-plot-ready string (or `null` on failure).
- ExpressionList still uses `ExpressionParser.isParameter()` for optional
  auto-conversion of bare params.

## Controls & expressions
- Primary config: `configs/config.json` (loaded first). Fallback:
  `configs/default-config.js` (used when JSON unavailable).
- Example configurations: `configs/samples/` contains example JSON files for
  reference; keep schema consistent with `config.json`.
- `graph.annotations`: optional `[{x?, y?, text?}]` for reference lines.
  Validated by ConfigLoader (must have `x` or `y`; defaults to `[]`).
  Passed to function-plot on every `init`/`rebuild`.
- Function entries support optional `derivative: {fn?, x0?, updateOnMouseMove?}`
  and `secants: [{x0, x1?, updateOnMouseMove?}]` for educational overlays on
  explicit expressions. ConfigLoader normalizes and strips invalid structures.
  GraphEngine auto-computes `derivative.fn` via `computeDerivative()` when not
  supplied; injects current parameter `scope` into both.
- GraphEngine's `detectAndUpdateParameters()` automatically:
  - Detects parameters from graph lines (variables other than `x` and `y`)
  - Ensures `parameters` entries for new parameters (value/min/max/step)
  - Auto-creates assignment expressions (e.g., `a = 1.0`) for parameters that
    don't already have assignments
  - Uses debouncing (300ms), but defers detection while a text expression input
    is focused and runs it on `expressions:committed`
- ExpressionList creates ParameterSlider instances for assignment expressions.
  ParameterSlider manages the slider UI, settings panel, and parameter config
  normalization. ExpressionList handles expression updates and logging based
  on ParameterSlider's onChange callbacks.
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
  - **Slider edits**: ParameterSlider tracks interaction state and emits
    onChange callbacks with `{oldValue, newValue, isDiscrete, paramName}`.
    ExpressionList receives these callbacks, formats values into expressions,
    updates state, and logs the change. For drag interactions, ParameterSlider
    captures the start value and emits once on drag end. For discrete changes
    (track click/keyboard), it emits immediately. During drag, intermediate
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
- LineClassifier auto-detects expression type: explicit (`y = f(x)`, bare `f(x)`),
  implicit (`x^2 + y^2 = 1`, `x = expr`), inequality (detected, rendering
  deferred). Users type math; fnType is internal.
- Keep raw expression text in inputs/state. Plot and LaTeX display conversions
  are target-specific and handled by `math/expression-adapter.js`.
- Assignment lines must be constants (no `x` on the RHS).
- Plot container sizing depends on parent flex; avoid inline styles that break
  100% width/height.
- Sidebar resizing uses mouse events; keep resizer element present and avoid CSS
  that removes its hit area.

## Documentation
- If you touch anything under `client/`, update this file and the nearest
  deeper `AGENTS.md` (core, math, configs) with the new realities. If you don’t,
  you’re leaving traps for the next engineer.
