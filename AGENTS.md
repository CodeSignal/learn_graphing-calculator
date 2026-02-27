# Repository Contribution Guidelines - CodeSignal CosmoPlot
This repository contains CodeSignal CosmoPlot, a graphing calculator app with
live function-plot rendering, auto-generated sliders, and a lightweight
Node/Vite stack. When working on this repo, start by reading this file
accurately.
Always update this file at the end of your work whenever you change behavior,
commands, or architecture.

## Architecture (what actually runs)
1. **Client entry**: `client/index.html` mounts the layout, loads design-system
   CSS, then `client/app.js`.
2. **App orchestrator**: `app.js` wires StateManager, GraphEngine (renderer
   controller), SidebarManager, ExpressionList, and the help modal
   (`design-system/components/modal`).
3. **State & events**:
   - Central store: `core/state-manager.js` (dot-path set/get).
     StateManager manages state only; EventBus handles all notifications.
   - Pub/Sub: `core/event-bus.js` (namespaced events like `state:changed`,
     `parameters:updated`, `expressions:committed`). EventBus is the single
     notification mechanism for state changes.
     Supports parent path bubbling (subscribing to `state:changed:parameters` also receives
     notifications for `state:changed:parameters.m.value`), and bubbled parent events provide
     the parent value (not the child value). Use `{ immediate: true }` to receive current
     value on subscription (requires `EventBus.setStateManager(StateManager)` in app init).
4. **Math layer**:
   - Parsing/validation: `math/expression-parser.js` (math.js wrapper, caches,
     requires `x`, optionally `y`; warns on unknown variables). Provides
     `parseAssignmentSyntax()` for pure syntax detection,
     `parseFunctionDefinitionSyntax()` for `f(x) = expr` style detection,
     `parsePointsSyntax()` for `points([[x,y], ...])`,
     `parseVectorSyntax()` for `vector([vx,vy],[ox,oy]?)`, and `isParameter()`
     for parameter detection.
   - Line classification: `math/line-classifier.js` (single source of truth for
     line kinds: assignment/graph/invalid/empty). Uses syntax parser then applies
     semantic rules. Returns `graphMode`
     (explicit/implicit/inequality/points/vector) for mapping to function-plot
     fnType. Supports: explicit (`y = f(x)`, `f(x) = expr`, bare `f(x)`),
     implicit (e.g. `x^2 + y^2 = 1`, `x = expr`), points
     (`points([[x,y], ...])`), vector (`vector([vx,vy],[ox,oy]?)`), and
     inequality detection (rendering deferred). Function definition syntax
     (`f(x) = expr`) is treated as explicit with the body as `plotExpression`;
     sole parameter must be `x`. Points/vector coordinates may use parameters
     but cannot include `x` or `y`.
   - Parameter inference: `math/parameter-utils.js` (derives defined/used params
     from classified lines).
   - Expression adaptation: `math/expression-adapter.js` (AST-based conversion
     layer that normalizes expressions for function-plot and produces polished
     display LaTeX from raw user input). Also provides `computeDerivative(expr)`
     which symbolically differentiates an explicit RHS expression with respect to
     `x` using math.js and returns the result adapted for function-plot.
   - Formatting: `utils/math-formatter.js` (LaTeX via KaTeX, delegated to
     `math/expression-adapter.js` for expression-to-LaTeX conversion).
5. **UI components**:
  - `components/expression-list.js` manages expressions (updates go through
     `StateManager.set('functions', ...)` which fires
     `state:changed:functions`). On blur/Enter commit it publishes
     `expressions:committed`. Sidebar rows are split into tabbed sections:
     `f(x)` (graph expressions) and `θ` (parameter assignments), with tab labels
     rendered through KaTeX. Assignment-intent rows render only in the `θ` tab;
     graph rows render only in `f(x)`. The bottom CTA is contextual:
     `+ Add Expression` in `f(x)` and `+ Add Parameter` in `θ`.
  - `components/sidebar-manager.js` handles resize/toggle.
   - `graph-engine.js` orchestrates render updates and delegates chart drawing
     to `renderers/function-plot-renderer.js`. Plot display uses function-plot
     natives: axis ticks/labels, grid toggle via options, on-curve tip.
     GraphEngine aspect-locks units at render time by expanding only the
     smaller axis to match the plot pixel ratio (no cropping), while keeping
     the canonical state viewport unchanged. Parameter detection is deferred
     while `.expression-input` is focused and resumes on
     `expressions:committed`.
     - `mapFunctionsToPlotData` returns `{ data, meta }` where `meta` is a
       parallel array of `{ id }` entries for each plotted datum (used by
       `tipRenderer` to show expression ids in tooltips).
     - `tipRenderer(x, y, index)` formats the on-curve tooltip as
       `id: (x, y)` using `datumMeta`.
     - Reads `graph.annotations` from state and passes to renderer on every
       `init()` and `rebuild()`.
     - For explicit expressions with `func.derivative`, auto-computes the
       symbolic derivative via `computeDerivative()` (or uses the caller-
       supplied `fn` string) and attaches it to the datum. `updateOnMouseMove`
       and `x0` are forwarded when present.
     - For explicit expressions with `func.secants`, maps the array onto
       function-plot secant objects (forwarding `x0`, `x1`,
       `updateOnMouseMove`) with `scope` injected from current parameters.
     - For `graphMode: 'points'`, maps to
       `{ fnType: 'points', graphType: 'scatter', sampler: 'builtIn', points }`
       after evaluating coordinate expressions against current parameter scope.
     - For `graphMode: 'vector'`, maps to
       `{ fnType: 'vector', graphType: 'polyline', sampler: 'builtIn', vector, offset }`
       after evaluating coordinate expressions against current parameter scope.
6. **Config**:
   - Primary: `configs/config.json` (loaded first). Fallback:
     `configs/default-config.js` (used when JSON unavailable).
   - Example configurations: `configs/samples/` contains example JSON files for
     reference; keep schema consistent with `config.json`.
   - `graph.annotations` (optional array): each entry is
     `{ x?: number, y?: number, text?: string }`. Vertical line if `x` set,
     horizontal if `y` set. Defaults to `[]`. Validated and normalized by
     `ConfigLoader`. Passed to function-plot on every render.
   - Function entries support optional `derivative` (object) and `secants`
     (array) fields for educational overlays; see Coding rules for semantics.
7. **Logging**:
   - Client logger: `utils/logger.js` provides `Logger.logActivity()` and
     `Logger.debug()` methods.
   - Activity logs: Always enabled, semantic logs about user actions
     (e.g., "Created expression y = a * x").
   - Debug logs: Toggleable via `?debug=true` URL parameter, development
     debugging logs.
   - Server endpoint: `POST /api/logs` accepts
     `{ type: 'activity' | 'debug', message: string }` and writes to plain text
     files in `/logs/` directory (`activity.log` and `debug.log`).
   - Logs directory: Created automatically on server startup if missing.
     Log files are plain text, one message per line.
8. **Server/build**:
   - Dev: Vite (`npm run start:dev`) serves client on :3000, proxies API/ws to
     :3001.
   - Prod: `server.js` (Express-free static server + optional WebSocket
     broadcast). `npm run build` outputs to `dist/`; `npm run start:prod` serves
     `dist/` on :3000 with `IS_PRODUCTION=true`.
   - `npm start` aliases `start:prod`. Keep ports in sync with
     `vite.config.js` proxies.

## Design System (non-negotiable)
- Use `client/design-system` components and tokens first (buttons, inputs,
  numeric-slider, modal, boxes, spacing, typography). Custom CSS belongs in
  `client/app.css` only when DS lacks coverage.
- Do **not** edit design-system assets; override with local styles sparingly.
- Keep HTML classes aligned with DS expectations (`button button-secondary`,
  `input`, `box card`, etc.).

## Coding rules & patterns
- **State**: Prefer `StateManager.set('parameters.a.value', val, { silent: true })`
  when avoiding DOM churn, but publish
  `EventBus.publish('parameters:updated', {...})` so GraphEngine re-renders.
- **Expressions**: LineClassifier defines line kinds; GraphEngine backfills
  parameter assignments for any extra symbols detected in graph lines (excluding
  x/y). Assignment lines never plot. In the sidebar, assignment-intent rows live
  in the `θ` tab and are hidden from `f(x)`. `+ Add Parameter` opens an inline
  name composer in the `θ` tab; names must match `[A-Za-z_][A-Za-z0-9_]*`,
  cannot be `x`/`y`, and cannot duplicate existing assignment names. Avoid loops
  when adding detection paths.
  `points` and `vector` are reserved function names and must not be inferred as
  parameter symbols.
  The inline composer's show/hide behavior relies on native `hidden` plus an
  explicit `.expression-parameter-composer[hidden]` CSS rule.
- **Expression adaptation**: Before passing `plotExpression` to function-plot,
  GraphEngine must call `toFunctionPlotSyntax()` from
  `math/expression-adapter.js` to normalize `pi/e/ln` aliases without mutating
  raw user input. For derivatives, use `computeDerivative(plotExpression)` from
  the same module; it symbolically differentiates w.r.t. `x` and returns a
  function-plot-ready string (or `null` on failure).
- **Derivative/secant overlays**: Supported on explicit (`fnType: 'linear'`)
  datums only. Config schema: `functions[i].derivative` is an object with
  optional `{ fn, x0, updateOnMouseMove }`; `functions[i].secants` is an array
  of `{ x0, x1?, updateOnMouseMove? }`. If `derivative.fn` is omitted,
  GraphEngine auto-computes it via `computeDerivative()`. Both receive the
  current parameter `scope` automatically.
- **Annotations**: `state.graph.annotations` is an array of
  `{ x?, y?, text? }` passed directly to function-plot on every `init` and
  `rebuild`. They are config-driven; to update at runtime call
  `StateManager.set('graph', { ...StateManager.get('graph'), annotations: [...] })`
  which triggers a rebuild.
- **Classification metadata**: `state.functions` entries may include derived
  classification fields (`kind`, `graphMode`, `error`, `paramName`, `value`,
  `usedVariables`, `plotExpression`, `plotData`) for UI consistency;
  GraphEngine still classifies from `expression` on each render.
- **Error handling**: Wrap async; surface meaningful messages; log to console;
  never swallow errors that block rendering.
- **Styling**: Keep line length ≤100 chars. Kebab-case filenames. No magic
  globals except the existing `window.app` debug hook.
- **Design guardrail**: If a UI need arises, reach for a DS component before
  inventing a bespoke one.

## Build / run commands (unchanged, keep verbatim)
- Dev: `npm run start:dev` (Vite + API server on 3001 via proxy).
- Build: `npm run build`
- Prod serve: `npm run start:prod` (sets `IS_PRODUCTION=true`, serves `dist/` on
  3000)
- Quick start (prod): `npm start`
- WebSocket broadcast (optional, requires `ws`):
  ```sh
  curl -X POST http://localhost:3000/message \
    -H "Content-Type: application/json" \
    -d '{"message":"Hi"}'
  ```
- Enable debug logging: Add `?debug=true` to URL
  (e.g., `http://localhost:3000?debug=true`)

## Testing & QA
- **Automated tests**: Unit tests for math/core/components (including
  `graph-engine.test.js` and `function-plot-renderer.test.js`) run with
  `npm run test` or `npm run test:run`. Use Vitest; tests live under `tests/`
  (and may also exist under `client/`).
- **Manual smoke**: run `npm run start:dev`, open `http://localhost:3000`,
  add/edit expressions, confirm plot redraws, switch between `f(x)` and `θ`
  tabs, verify sliders appear in `θ` for parameters (e.g., `a*sin(b*x)`),
  zoom/pan, help modal opens.
- **Prod sanity**: `npm run build && npm run start:prod`, hit
  `http://localhost:3000`, ensure assets load from `dist/`.
- When introducing risky math/engine changes, add/update automated tests to
  maintain coverage.

## Security / perf notes
- Math evaluation runs client-side via math.js; do not inject unchecked user
  input into new Function or eval. Keep parsing through ExpressionParser only.
- GraphEngine render requests are throttled via `requestAnimationFrame`; avoid
  synchronous heavy work or unnecessary rebuild loops in render paths.

## Documentation discipline
- Any code change that affects behavior, commands, structure, or conventions
  **must** update the relevant `AGENTS.md` (root and nearest subdir). If you
  skip this, you’re creating future thrash.
