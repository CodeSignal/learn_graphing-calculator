# Repository Contribution Guidelines – Core (State & Events)
These modules are the plumbing; break them and the app thrashes. Keep changes minimal and documented.

## Files & roles
1. `state-manager.js`: Central store with dot-path get/set, history (max 50), validation of controls
   against config, subscribers per path, optional debug logs.
2. `event-bus.js`: Namespaced pub/sub (`module:action`), once subscriptions, history (max 100), debug
   logging.
3. `config-loader.js`: Validates and normalizes config objects or fetched JSON; applies defaults,
   auto-assigns ids/colors, detects variables through `math/expression-parser.js`. Only topics allowed:
   functions, limits, derivatives, integrals.

## Usage patterns
- Prefer `StateManager.set(path, value, { silent: true })` only when you manually publish the relevant
  event (e.g., `EventBus.publish('expression:updated', data)`) to avoid render storms.
- Validation is light; do not bypass it when adding control types or visual elements—extend the
  validator instead.
- Keep event names consistent and scoped (`state:changed`, `controls:updated`, `expression:updated`).

## Safety/limits
- History arrays are capped; if you change limits, ensure memory stays bounded.
- `ConfigLoader.load` fetches relative to `./configs/config.json`; adjust only with clear reason and
  update root AGENTS.

## When adding features
- New control types → extend `_validateControl` and StateManager default value logic.
- New visual element types → extend `_validateVisualElement` and defaults if needed.
- If you add topics or schema fields, document them here and in root AGENTS.

## Documentation rule
- Any behavior change here demands an update to this file and root `AGENTS.md`. No exceptions.
