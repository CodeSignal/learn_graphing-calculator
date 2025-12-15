# Repository Contribution Guidelines - CodeSignal MathGraph
This repository contains CodeSignal MathGraph, a math graphing app with live canvas rendering, auto‑generated sliders, and a lightweight Node/Vite stack. When working on this repo, start by reading this file accurately. Always update this file at the end of your work whenever you change behavior, commands, or architecture.

## Architecture (what actually runs)
1. **Client entry**: `client/index.html` mounts the layout, loads design-system CSS, then `client/app.js`.
2. **App orchestrator**: `app.js` wires StateManager, GraphEngine (canvas renderer), SidebarManager, ExpressionList, and the help modal (`design-system/components/modal`).
3. **State & events**:
   - Central store: `core/state-manager.js` (dot-path set/get, history, validation, publishes events).
   - Pub/Sub: `core/event-bus.js` (namespaced events like `state:changed`, `expression:updated`).
4. **Math layer**:
   - Parsing/validation: `math/expression-parser.js` (math.js wrapper, caches, requires `x`, optionally `y`; warns on unknown variables).
   - Evaluation: `math/function-evaluator.js` (single point, ranges, discontinuities, zero finding).
   - Calculus: `math/calculus-engine.js` (symbolic diff via math.js, numerical fallbacks, limits, Taylor series, secant/tangent).
   - Numerics: `math/numerical-methods.js` (Riemann, trapezoid, Simpson, Newton, bisection, gradient).
   - Formatting: `utils/math-formatter.js` (LaTeX via KaTeX).
   - Detection: `utils/expression-detector.js` (single variable detection, assignment parsing; used by ExpressionList).
5. **UI components**:
   - `components/expression-list.js` manages expressions (live updates publish `expression:updated`).
   - `components/sidebar-manager.js` handles resize/toggle.
6. **Config**:
   - Active default: `configs/default-config.js` only. Legacy JSON samples in `configs/samples/` are
     unused until someone wires a loader; keep schema consistent.
7. **Server/build**:
   - Dev: Vite (`npm run start:dev`) serves client on :3000, proxies API/ws to :3001.
   - Prod: `server.js` (Express-free static server + optional WebSocket broadcast). `npm run build`
     outputs to `dist/`; `npm run start:prod` serves `dist/` on :3000 with `IS_PRODUCTION=true`.
   - `npm start` aliases `start:prod`. Keep ports in sync with `vite.config.js` proxies.

## Design System (non-negotiable)
- Use `client/design-system` components and tokens first (buttons, inputs, numeric-slider, modal, boxes, spacing, typography). Custom CSS belongs in `client/app.css` only when DS lacks coverage.
- Do **not** edit design-system assets; override with local styles sparingly.
- Keep HTML classes aligned with DS expectations (`button button-secondary`, `input`, `box card`, etc.).

## Coding rules & patterns
- **State**: Prefer `StateManager.set('controls.a', val, {silent: true})` when avoiding DOM churn, but publish the needed event (`EventBus.publish('controls:updated', {...})`) so GraphEngine re-renders.
- **Expressions**: Parser enforces presence of `x`; GraphEngine backfills slider controls for any extra symbols detected in expressions (excluding x/y). If you add a new detection path, ensure it doesn’t loop renders.
- **Status text**: Stick to these exact strings:
  1. "Ready"
  2. "Loading..."
  3. "Saving..."
  4. "Changes saved"
  5. "Save failed (will retry)"
  6. "Failed to load data"
- **Error handling**: Wrap async; surface meaningful messages; log to console; never swallow errors that block rendering.
- **Styling**: Keep line length ≤100 chars. Kebab-case filenames. No magic globals except the existing `window.app` debug hook.
- **Design guardrail**: If a UI need arises, reach for a DS component before inventing a bespoke one.

## Build / run commands (unchanged, keep verbatim)
- Dev: `npm run start:dev` (Vite + API server on 3001 via proxy).
- Build: `npm run build`
- Prod serve: `npm run start:prod` (sets `IS_PRODUCTION=true`, serves `dist/` on 3000)
- Quick start (prod): `npm start`
- WebSocket broadcast (optional, requires `ws`): `curl -X POST http://localhost:3000/message -H "Content-Type: application/json" -d '{"message":"Hi"}'`

## Testing & QA (manual for now)
- Smoke: run `npm run start:dev`, open `http://localhost:3000`, add/edit expressions, confirm canvas redraws, sliders appear for parameters (e.g., `a*sin(b*x)`), zoom/pan, help modal opens, status shows Ready.
- Prod sanity: `npm run build && npm run start:prod`, hit `http://localhost:3000`, ensure assets load from `dist/`.
- No automated tests exist—add them if you introduce risky math/engine changes.

## Security / perf notes
- Math evaluation runs client-side via math.js; do not inject unchecked user input into new Function or eval. Keep parsing through ExpressionParser only.
- Canvas render throttled via `requestAnimationFrame`; avoid synchronous heavy loops inside render.

## Documentation discipline
- Any code change that affects behavior, commands, structure, or conventions **must** update the relevant `AGENTS.md` (root and nearest subdir). If you skip this, you’re creating future thrash.
