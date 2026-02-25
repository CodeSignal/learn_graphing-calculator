# Repository Contribution Guidelines - CodeSignal CosmoPlot
This repository contains CodeSignal CosmoPlot, a graphing calculator app with
live canvas rendering, auto-generated sliders, and a lightweight Node/Vite
stack. When working on this repo, start by reading this file accurately.
Always update this file at the end of your work whenever you change behavior,
commands, or architecture.

## Architecture (what actually runs)
1. **Client entry**: `client/index.html` mounts the layout, loads design-system
   CSS, then `client/app.js`.
2. **App orchestrator**: `app.js` wires StateManager, GraphEngine (canvas
   renderer), SidebarManager, ExpressionList, and the help modal
   (`design-system/components/modal`).
3. **State & events**:
   - Central store: `core/state-manager.js` (dot-path set/get).
     StateManager manages state only; EventBus handles all notifications.
   - Pub/Sub: `core/event-bus.js` (namespaced events like `state:changed`,
     `parameters:updated`). EventBus is the single notification mechanism for state changes.
     Supports parent path bubbling (subscribing to `state:changed:parameters` also receives
     notifications for `state:changed:parameters.m.value`), and bubbled parent events provide
     the parent value (not the child value). Use `{ immediate: true }` to receive current
     value on subscription (requires `EventBus.setStateManager(StateManager)` in app init).
4. **Math layer**:
   - Parsing/validation: `math/expression-parser.js` (math.js wrapper, caches,
     requires `x`, optionally `y`; warns on unknown variables). Provides
     `parseAssignmentSyntax()` for pure syntax detection and `isParameter()` for
     parameter detection.
   - Line classification: `math/line-classifier.js` (single source of truth for
     line kinds: assignment/graph/invalid/empty). Uses syntax parser then applies
     semantic rules. Supports vertical lines (`x = constant`) and horizontal
     lines (`y = constant`) as graph types.
   - Parameter inference: `math/parameter-utils.js` (derives defined/used params
     from classified lines).
   - Evaluation: `math/function-evaluator.js` (evaluates expressions at specific
     points).
   - Formatting: `utils/math-formatter.js` (LaTeX via KaTeX).
5. **UI components**:
   - `components/expression-list.js` manages expressions (updates go through
     `StateManager.set('functions', ...)` which fires `state:changed:functions`).
   - `components/sidebar-manager.js` handles resize/toggle.
6. **Config**:
   - Primary: `configs/config.json` (loaded first). Fallback:
     `configs/default-config.js` (used when JSON unavailable).
   - Example configurations: `configs/samples/` contains example JSON files for
     reference; keep schema consistent with `config.json`.
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
  x/y). Assignment lines never plot. Avoid loops when adding detection paths.
- **Classification metadata**: `state.functions` entries may include derived
  classification fields (`kind`, `error`, `paramName`, `value`, `usedVariables`,
  `plotExpression`, `verticalLineX`) for UI consistency; GraphEngine still
  classifies from `expression` on each render.
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
- **Automated tests**: Unit tests for math layer (e.g.,
  `expression-parser.test.js`) run with `npm run test` or `npm run test:run`.
  Use Vitest; tests live under `tests/` (and may also exist under `client/`).
- **Manual smoke**: run `npm run start:dev`, open `http://localhost:3000`,
  add/edit expressions, confirm canvas redraws, sliders appear for parameters
  (e.g., `a*sin(b*x)`), zoom/pan, help modal opens.
- **Prod sanity**: `npm run build && npm run start:prod`, hit
  `http://localhost:3000`, ensure assets load from `dist/`.
- When introducing risky math/engine changes, add/update automated tests to
  maintain coverage.

## Security / perf notes
- Math evaluation runs client-side via math.js; do not inject unchecked user
  input into new Function or eval. Keep parsing through ExpressionParser only.
- Canvas render throttled via `requestAnimationFrame`; avoid synchronous heavy
  loops inside render.

## Documentation discipline
- Any code change that affects behavior, commands, structure, or conventions
  **must** update the relevant `AGENTS.md` (root and nearest subdir). If you
  skip this, you’re creating future thrash.
